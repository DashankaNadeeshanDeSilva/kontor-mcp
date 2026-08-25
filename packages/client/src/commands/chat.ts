/**
 * `kontor-agent chat` — Anthropic agent loop with every MCP tool bridged in.
 * The SDK's beta Tool Runner drives the loop; we add a readable tool-call trace by wrapping
 * the MCP client the bridge calls into. The Anthropic client is injectable so tests never
 * touch the network.
 */
import Anthropic from "@anthropic-ai/sdk";
import { type MCPCallToolResultLike, mcpTools } from "@anthropic-ai/sdk/helpers/beta/mcp";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const DEFAULT_MODEL = "claude-opus-5";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type Trace = (line: string) => void;

const MAX_ARG_PREVIEW = 160;

function previewArgs(args: Record<string, unknown> | undefined): string {
  const entries = Object.entries(args ?? {}).map(([k, v]) => {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    const short = s.length > 60 ? `${s.slice(0, 57)}…` : s;
    return `${k}=${short}`;
  });
  const joined = entries.join(" ");
  return joined.length > MAX_ARG_PREVIEW ? `${joined.slice(0, MAX_ARG_PREVIEW - 1)}…` : joined;
}

function summarizeResult(raw: unknown): string {
  const r = raw as { isError?: boolean; structuredContent?: unknown };
  if (r.isError) return "error";
  const sc = (r.structuredContent ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of ["recommendation", "verdict", "status", "format", "target"]) {
    if (typeof sc[k] === "string") parts.push(`${k}=${sc[k]}`);
  }
  if (Array.isArray(sc.findings)) parts.push(`${sc.findings.length} findings`);
  if (typeof sc.valid === "boolean") parts.push(`valid=${sc.valid}`);
  return parts.join(" · ") || "ok";
}

/** MCP tools → runnable Anthropic tools, with a `→ name args` / `← name summary · ms` trace. */
export function bridgeTools(tools: Tool[], client: Client, trace: Trace) {
  const tracing = {
    callTool: async (params: { name: string; arguments?: Record<string, unknown> }) => {
      trace(`→ ${params.name} ${previewArgs(params.arguments)}`);
      const t0 = performance.now();
      const r = await client.callTool(params);
      const ms = Math.round(performance.now() - t0);
      trace(`← ${params.name} ${summarizeResult(r)} · ${ms} ms`);
      return r as MCPCallToolResultLike;
    },
  };
  return mcpTools(tools, tracing);
}

/** What a tool-runner iteration must look like for `runChat`: an event stream plus the final message. */
export interface ChatIteration {
  [Symbol.asyncIterator](): AsyncIterator<unknown>;
  finalMessage(): Promise<{
    content: unknown;
    stop_reason: string | null;
    usage: { input_tokens: number; output_tokens: number };
  }>;
}
export type ChatRunner = AsyncIterable<ChatIteration>;

export interface ChatOptions {
  client: Client;
  message: string;
  /** Prior turns (user/assistant/tool exchanges) — pass the `messages` returned by the previous call. */
  history?: BetaMessageParam[];
  model?: string;
  effort?: Effort;
  maxIterations?: number;
  write: (s: string) => void;
  trace?: Trace;
  /** Test seam: build the runner from the prepared params. Defaults to the real Anthropic Tool Runner. */
  runnerFactory?: (params: RunnerParams) => ChatRunner;
}

export interface RunnerParams {
  model: string;
  system: string;
  tools: ReturnType<typeof bridgeTools>;
  messages: BetaMessageParam[];
  effort: Effort;
  maxIterations: number;
}

export interface ChatResult {
  text: string;
  stopReason: string | null;
  usage: { input_tokens: number; output_tokens: number };
  messages: BetaMessageParam[];
}

export function buildSystemPrompt(instructions: string | undefined): string {
  return [
    "You are kontor-agent, an accounts-payable assistant with the Kontor MCP tools connected.",
    "Use the tools for every factual claim about an invoice; never guess rule outcomes.",
    "Answer in the user's language (German or English), concisely, and relay the disclaimer line of tool results.",
    instructions ? `\nServer instructions:\n${instructions}` : "",
  ].join("\n");
}

function defaultRunnerFactory(anthropic: Anthropic) {
  return (p: RunnerParams): ChatRunner => {
    const runner = anthropic.beta.messages.toolRunner({
      model: p.model,
      max_tokens: 64_000,
      system: p.system,
      tools: p.tools,
      messages: p.messages,
      stream: true,
      max_iterations: p.maxIterations,
      thinking: { type: "adaptive" },
      output_config: { effort: p.effort },
      // Server-side refusal fallback (opt-in per Anthropic's guidance for the Opus 5 family).
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    return {
      async *[Symbol.asyncIterator]() {
        for await (const stream of runner) yield stream as unknown as ChatIteration;
        // Keep the full exchange (tool_use / tool_result turns) for the next user message.
        lastMessages = runner.params.messages as BetaMessageParam[];
      },
    };
  };
}
let lastMessages: BetaMessageParam[] | undefined;

export async function runChat(opts: ChatOptions): Promise<ChatResult> {
  const { client, write } = opts;
  const trace = opts.trace ?? ((l) => write(`  ${l}\n`));
  const { tools } = await client.listTools();
  const params: RunnerParams = {
    model: opts.model ?? DEFAULT_MODEL,
    system: buildSystemPrompt(client.getInstructions()),
    tools: bridgeTools(tools, client, trace),
    messages: [...(opts.history ?? []), { role: "user", content: opts.message }],
    effort: opts.effort ?? "high",
    maxIterations: opts.maxIterations ?? 20,
  };
  const factory = opts.runnerFactory ?? defaultRunnerFactory(new Anthropic());
  lastMessages = undefined;

  let text = "";
  let stopReason: string | null = null;
  const usage = { input_tokens: 0, output_tokens: 0 };
  for await (const iteration of factory(params)) {
    let wroteText = false;
    for await (const raw of iteration) {
      const ev = raw as { type: string; delta?: { type: string; text?: string } };
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
        write(ev.delta.text);
        text += ev.delta.text;
        wroteText = true;
      }
    }
    const final = await iteration.finalMessage();
    if (wroteText) write("\n");
    stopReason = final.stop_reason;
    usage.input_tokens += final.usage.input_tokens;
    usage.output_tokens += final.usage.output_tokens;
  }
  const assistant: BetaMessageParam = { role: "assistant", content: text };
  const messages = lastMessages ?? [...params.messages, assistant];
  return { text, stopReason, usage, messages };
}
