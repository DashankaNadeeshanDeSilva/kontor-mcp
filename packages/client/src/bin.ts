#!/usr/bin/env node
/** `kontor-agent` CLI: tools · audit <file> · chat — over stdio (spawned server) or Streamable HTTP. */
import { createInterface } from "node:readline/promises";
import { Command, Option } from "commander";
import { EXIT_ERROR, runAudit } from "./commands/audit.js";
import { DEFAULT_MODEL, type Effort, runChat } from "./commands/chat.js";
import { renderTools } from "./commands/tools.js";
import { CLIENT_NAME, CLIENT_VERSION, type Connection, connect } from "./connect.js";

const program = new Command()
  .name(CLIENT_NAME)
  .version(CLIENT_VERSION)
  .description("Reference MCP client for Kontor MCP — introspection, one-shot audit, agent chat.")
  .option(
    "--stdio [command...]",
    "spawn the server over stdio (default: the bundled @kontor-mcp/server)",
  )
  .option("--url <url>", "Streamable HTTP endpoint, e.g. http://127.0.0.1:3333/mcp")
  .option("--token <token>", "bearer token for --url (default: $KONTOR_AUTH_TOKEN)");

interface GlobalOpts {
  stdio?: true | string[];
  url?: string;
  token?: string;
}

async function open(): Promise<Connection> {
  const g = program.opts<GlobalOpts>();
  const token = g.token ?? process.env.KONTOR_AUTH_TOKEN;
  try {
    if (g.url) return await connect({ url: g.url, ...(token ? { token } : {}) });
    return await connect({ stdio: Array.isArray(g.stdio) ? g.stdio : [] });
  } catch (e) {
    console.error(`${CLIENT_NAME}: cannot connect — ${(e as Error).message}`);
    process.exit(EXIT_ERROR);
  }
}

program
  .command("tools")
  .description("list tools, resources and prompts with their schemas (no LLM)")
  .action(async () => {
    const c = await open();
    try {
      process.stdout.write(await renderTools(c.client));
    } finally {
      await c.close();
    }
  });

program
  .command("audit")
  .description(
    "audit one invoice via audit_invoice (no LLM, no API key); exit 0 accept · 1 review · 2 reject · 3 error",
  )
  .argument("<file>", "XRechnung / ZUGFeRD / Factur-X file (path local to the server)")
  .addOption(new Option("--lang <lang>", "language of the report").choices(["de", "en"]))
  .option("--known <numbers>", "comma-separated invoice numbers already booked (duplicate check)")
  .option("--json", "print the structured result instead of the text report")
  .action(async (file: string, o: { lang?: "de" | "en"; known?: string; json?: boolean }) => {
    const c = await open();
    try {
      const r = await runAudit(c.client, file, {
        ...(o.lang ? { lang: o.lang } : {}),
        ...(o.known
          ? {
              known: o.known
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            }
          : {}),
      });
      process.stdout.write(
        o.json && r.structured ? `${JSON.stringify(r.structured, null, 2)}\n` : `${r.text}\n`,
      );
      process.exitCode = r.exitCode;
    } finally {
      await c.close();
    }
  });

program
  .command("chat")
  .description(
    "agent loop: Anthropic Messages API with all Kontor tools bridged in; prints every tool call",
  )
  .option(
    "-m, --message <text>",
    "one-shot message (otherwise interactive; empty line or Ctrl-D ends)",
  )
  .option("--model <id>", "Claude model", DEFAULT_MODEL)
  .addOption(
    new Option("--effort <level>", "reasoning effort")
      .choices(["low", "medium", "high", "xhigh", "max"])
      .default("high"),
  )
  .option("--max-iterations <n>", "tool-use rounds per message", "20")
  .action(async (o: { message?: string; model: string; effort: Effort; maxIterations: string }) => {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
      console.error(
        `${CLIENT_NAME} chat needs Anthropic credentials (ANTHROPIC_API_KEY). ` +
          "`tools` and `audit` work without one — the Kontor server itself never talks to the network.",
      );
      process.exit(EXIT_ERROR);
    }
    const c = await open();
    const write = (s: string) => process.stdout.write(s);
    const dim = (s: string) => (process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s);
    const trace = (l: string) => write(dim(`  ${l}\n`));
    write(
      dim(
        `[${CLIENT_NAME} ${CLIENT_VERSION} · ${c.transport} → ${c.target} · ${o.model} · effort ${o.effort}]\n`,
      ),
    );
    let history: Awaited<ReturnType<typeof runChat>>["messages"] = [];
    const turn = async (message: string) => {
      const r = await runChat({
        client: c.client,
        message,
        history,
        model: o.model,
        effort: o.effort,
        maxIterations: Number(o.maxIterations) || 20,
        write,
        trace,
      });
      history = r.messages;
      write(
        dim(
          `  [${r.usage.input_tokens} in / ${r.usage.output_tokens} out · stop=${r.stopReason}]\n`,
        ),
      );
    };
    try {
      if (o.message) {
        await turn(o.message);
        return;
      }
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        for (;;) {
          const line = (await rl.question("you> ")).trim();
          if (!line) break;
          await turn(line);
        }
      } catch {
        /* Ctrl-D / closed stdin */
      } finally {
        rl.close();
      }
    } finally {
      await c.close();
    }
  });

await program.parseAsync(process.argv);
