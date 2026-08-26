import { fileURLToPath } from "node:url";
import { startHttpServer } from "@kontor-mcp/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAudit } from "../src/commands/audit.js";
import { bridgeTools, type ChatRunner, runChat } from "../src/commands/chat.js";
import { renderTools } from "../src/commands/tools.js";
import { CLIENT_NAME, type Connection, connect, serverBinPath } from "../src/index.js";

const TOKEN = "agent-test-token-0123456789";
const sample = (name: string) =>
  fileURLToPath(new URL(`../../server/samples/${name}`, import.meta.url));

let http: Awaited<ReturnType<typeof startHttpServer>>;
let stdio: Connection;
let remote: Connection;

beforeAll(async () => {
  http = await startHttpServer({
    port: 0,
    bind: "127.0.0.1",
    authToken: TOKEN,
    allowedOrigins: [],
  });
  stdio = await connect({ stdio: [] });
  remote = await connect({ url: `http://127.0.0.1:${http.port}/mcp`, token: TOKEN });
}, 30_000);
afterAll(async () => {
  await stdio.close();
  await remote.close();
  await http.close();
});

describe("kontor-agent connection layer", () => {
  it("exports the CLI name and resolves the bundled server binary", () => {
    expect(CLIENT_NAME).toBe("kontor-agent");
    expect(serverBinPath()).toMatch(/packages[\\/]server[\\/]dist[\\/]bin\.js$/);
  });
  it("stdio (spawned server) and HTTP (bearer) expose the same 8 tools and the instructions", async () => {
    const a = (await stdio.client.listTools()).tools.map((t) => t.name).sort();
    const b = (await remote.client.listTools()).tools.map((t) => t.name).sort();
    expect(a).toEqual(b);
    expect(a).toHaveLength(8);
    expect(stdio.client.getInstructions()).toMatch(/fully offline/);
    expect(stdio.transport).toBe("stdio");
    expect(remote.transport).toBe("http");
  });
  it("closing an HTTP connection terminates the server session (DELETE)", async () => {
    const before = http.sessionCount();
    const extra = await connect({ url: `http://127.0.0.1:${http.port}/mcp`, token: TOKEN });
    expect(http.sessionCount()).toBe(before + 1);
    await extra.close();
    expect(http.sessionCount()).toBe(before);
  });
  it("HTTP with a wrong token fails clearly", async () => {
    await expect(
      connect({ url: `http://127.0.0.1:${http.port}/mcp`, token: "wrong-token-0123456789" }),
    ).rejects.toThrow(/Unauthorized|401/);
  });
});

describe("kontor-agent tools", () => {
  it("renders tools, resources, resource templates and prompts as readable text", async () => {
    const out = await renderTools(stdio.client);
    expect(out).toMatch(/^Tools \(8\)/m);
    expect(out).toMatch(/audit_invoice/);
    expect(out).toMatch(/readOnly/);
    expect(out).toMatch(/kontor:\/\/samples\//);
    expect(out).toMatch(/Prompts \(3\)/);
    expect(out).toMatch(/draft-supplier-rejection/);
  });
});

describe("kontor-agent audit (no LLM)", () => {
  it("broken sample → reject, exit 2, German text by default", async () => {
    const r = await runAudit(stdio.client, sample("broken-missing-buyer-reference.xml"), {});
    expect(r.recommendation).toBe("reject");
    expect(r.exitCode).toBe(2);
    expect(r.text).toMatch(/BR-DE-15/);
  });
  it("valid sample → accept, exit 0; --lang en; known numbers → review, exit 1", async () => {
    const ok = await runAudit(remote.client, sample("valid-xrechnung-ubl.xml"), { lang: "en" });
    expect(ok.recommendation).toBe("accept");
    expect(ok.exitCode).toBe(0);
    expect(ok.text).toMatch(/not tax or legal advice/i);
    const dup = await runAudit(remote.client, sample("valid-xrechnung-ubl.xml"), {
      known: [ok.invoiceNumber],
    });
    expect(dup.recommendation).toBe("review");
    expect(dup.exitCode).toBe(1);
  });
  it("relative path / missing file → exit 3 with the server's advice", async () => {
    const r = await runAudit(stdio.client, "/definitely/not/here.xml", {});
    expect(r.exitCode).toBe(3);
    expect(r.text).toMatch(/not found|does not exist|ENOENT/i);
  });
});

describe("kontor-agent chat bridge (Anthropic never called)", () => {
  it("bridges MCP tools to runnable tools and traces each call with timing", async () => {
    const lines: string[] = [];
    const { tools } = await stdio.client.listTools();
    const bridged = bridgeTools(tools, stdio.client, (l) => lines.push(l));
    expect(bridged.map((t) => t.name).sort()).toContain("audit_invoice");
    const audit = bridged.find((t) => t.name === "audit_invoice");
    if (!audit) throw new Error("unreachable");
    const result = await audit.run({ file_path: sample("broken-missing-buyer-reference.xml") });
    expect(JSON.stringify(result)).toMatch(/BR-DE-15/);
    expect(lines.some((l) => /→ audit_invoice/.test(l) && /file_path/.test(l))).toBe(true);
    expect(lines.some((l) => /← audit_invoice/.test(l) && /reject/.test(l) && /ms/.test(l))).toBe(
      true,
    );
  });

  it("runChat drives an injected runner: streams text, prints the trace, returns usage", async () => {
    const out: string[] = [];
    const fakeRunner: ChatRunner = async function* () {
      yield {
        async *[Symbol.asyncIterator]() {
          yield { type: "content_block_delta", delta: { type: "text_delta", text: "Hallo " } };
          yield { type: "content_block_delta", delta: { type: "text_delta", text: "Welt" } };
        },
        finalMessage: async () => ({
          role: "assistant",
          content: [{ type: "text", text: "Hallo Welt" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 12, output_tokens: 3 },
        }),
      };
    };
    const r = await runChat({
      client: stdio.client,
      message: "Prüfe die Rechnung",
      write: (s) => out.push(s),
      runnerFactory: () => fakeRunner(),
    });
    expect(out.join("")).toMatch(/Hallo Welt/);
    expect(r.usage.input_tokens).toBe(12);
    expect(r.usage.output_tokens).toBe(3);
  });
});
