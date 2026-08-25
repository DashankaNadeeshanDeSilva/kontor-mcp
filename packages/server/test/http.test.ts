import { readFileSync } from "node:fs";
import { get as httpGet } from "node:http";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readConfig } from "../src/config.js";
import { type RunningHttpServer, startHttpServer } from "../src/http.js";

const TOKEN = "test-token-0123456789abcdef";
const sample = (name: string) => fileURLToPath(new URL(`../samples/${name}`, import.meta.url));

let running: RunningHttpServer;
let url: URL;
const auth = (token = TOKEN, extra: Record<string, string> = {}) => ({
  headers: { Authorization: `Bearer ${token}`, ...extra },
});

function connect(opts: { token?: string; origin?: string } = {}): Promise<Client> {
  const headers: Record<string, string> = {};
  if (opts.token !== undefined) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.origin) headers.Origin = opts.origin;
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
  const client = new Client({ name: "http-test", version: "0.0.0" });
  return client.connect(transport).then(() => client);
}

const initBody = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "raw", version: "0" },
  },
});
const rawPost = (init: RequestInit) =>
  fetch(url, {
    method: "POST",
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(init.headers as Record<string, string>),
    },
    body: initBody,
  });

beforeAll(async () => {
  running = await startHttpServer({
    port: 0,
    bind: "127.0.0.1",
    authToken: TOKEN,
    allowedOrigins: ["https://agent.example"],
  });
  url = new URL(`http://127.0.0.1:${running.port}/mcp`);
});
afterAll(async () => {
  await running.close();
});

describe("readConfig (PRD §5.9 env surface)", () => {
  it("defaults to stdio and never reads HTTP settings there", () => {
    expect(readConfig({}).transport).toBe("stdio");
  });
  it("parses the http surface with defaults 3333 / 127.0.0.1", () => {
    const c = readConfig({ KONTOR_TRANSPORT: "http", KONTOR_AUTH_TOKEN: "x".repeat(16) });
    expect(c.transport).toBe("http");
    if (c.transport !== "http") throw new Error("unreachable");
    expect(c.port).toBe(3333);
    expect(c.bind).toBe("127.0.0.1");
    expect(c.allowedOrigins).toEqual([]);
  });
  it("splits KONTOR_ALLOWED_ORIGINS on commas and trims", () => {
    const c = readConfig({
      KONTOR_TRANSPORT: "http",
      KONTOR_AUTH_TOKEN: "x".repeat(16),
      KONTOR_ALLOWED_ORIGINS: " https://a.example , https://b.example:8443 ",
      KONTOR_PORT: "4444",
      KONTOR_BIND: "0.0.0.0",
    });
    if (c.transport !== "http") throw new Error("unreachable");
    expect(c.allowedOrigins).toEqual(["https://a.example", "https://b.example:8443"]);
    expect(c.port).toBe(4444);
    expect(c.bind).toBe("0.0.0.0");
  });
  it("refuses http without a token unless loopback + KONTOR_ALLOW_NO_AUTH=1", () => {
    expect(() => readConfig({ KONTOR_TRANSPORT: "http" })).toThrow(/KONTOR_AUTH_TOKEN/);
    expect(() =>
      readConfig({ KONTOR_TRANSPORT: "http", KONTOR_BIND: "0.0.0.0", KONTOR_ALLOW_NO_AUTH: "1" }),
    ).toThrow(/loopback/);
    const c = readConfig({ KONTOR_TRANSPORT: "http", KONTOR_ALLOW_NO_AUTH: "1" });
    if (c.transport !== "http") throw new Error("unreachable");
    expect(c.authToken).toBeUndefined();
  });
  it("KONTOR_ALLOWED_HOSTS is a trimmed comma list (Docker: bind 0.0.0.0 behind a proxy)", () => {
    const c = readConfig({
      KONTOR_TRANSPORT: "http",
      KONTOR_AUTH_TOKEN: "x".repeat(16),
      KONTOR_ALLOWED_HOSTS: "kontor.internal, mcp.example ",
    });
    if (c.transport !== "http") throw new Error("unreachable");
    expect(c.allowedHosts).toEqual(["kontor.internal", "mcp.example"]);
  });
  it("session limits: KONTOR_MAX_SESSIONS / KONTOR_SESSION_IDLE_MINUTES with sane defaults", () => {
    const base = { KONTOR_TRANSPORT: "http", KONTOR_AUTH_TOKEN: "x".repeat(16) };
    const c = readConfig(base);
    if (c.transport !== "http") throw new Error("unreachable");
    expect(c.maxSessions).toBe(100);
    expect(c.sessionIdleMs).toBe(30 * 60_000);
    const d = readConfig({ ...base, KONTOR_MAX_SESSIONS: "5", KONTOR_SESSION_IDLE_MINUTES: "2" });
    if (d.transport !== "http") throw new Error("unreachable");
    expect(d.maxSessions).toBe(5);
    expect(d.sessionIdleMs).toBe(120_000);
    expect(() => readConfig({ ...base, KONTOR_MAX_SESSIONS: "0" })).toThrow(/KONTOR_MAX_SESSIONS/);
  });
  it("rejects garbage", () => {
    expect(() => readConfig({ KONTOR_TRANSPORT: "grpc" })).toThrow(/KONTOR_TRANSPORT/);
    expect(() =>
      readConfig({
        KONTOR_TRANSPORT: "http",
        KONTOR_AUTH_TOKEN: "x".repeat(16),
        KONTOR_PORT: "abc",
      }),
    ).toThrow(/KONTOR_PORT/);
    expect(() => readConfig({ KONTOR_TRANSPORT: "http", KONTOR_AUTH_TOKEN: "short" })).toThrow(
      /16/,
    );
  });
});

describe("Streamable HTTP transport (Task 3.1)", () => {
  it("connects with the token and exposes the same tool surface as stdio", async () => {
    const client = await connect({ token: TOKEN });
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual(
      [
        "audit_invoice",
        "check_obligations",
        "convert_invoice",
        "explain_rule",
        "generate_invoice",
        "list_capabilities",
        "parse_invoice",
        "validate_invoice",
      ].sort(),
    );
    await client.close();
  });

  it("accepts a content_base64 PDF larger than Express' 100 kB default (F7 use case)", async () => {
    const client = await connect({ token: TOKEN });
    const pdf = readFileSync(sample("valid-zugferd-en16931.pdf")).toString("base64");
    expect(pdf.length).toBeGreaterThan(100 * 1024);
    const r = await client.callTool({
      name: "parse_invoice",
      arguments: { content_base64: pdf, filename: "valid-zugferd-en16931.pdf" },
    });
    expect(r.isError).toBeFalsy();
    await client.close();
  });

  it("401 without or with a wrong token; WWW-Authenticate is set", async () => {
    const missing = await rawPost({});
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toMatch(/Bearer/);
    const wrong = await rawPost(auth("wrong-token-0123456789abcdef"));
    expect(wrong.status).toBe(401);
    const sameLengthWrong = await rawPost(auth(TOKEN.replace(/.$/, "X")));
    expect(sameLengthWrong.status).toBe(401);
    await expect(connect({ token: "nope" })).rejects.toThrow(/Unauthorized/);
  });

  it("403 on a spoofed Origin; localhost and allow-listed origins pass", async () => {
    const spoof = await rawPost(auth(TOKEN, { Origin: "https://evil.example" }));
    expect(spoof.status).toBe(403);
    const local = await connect({ token: TOKEN, origin: "http://localhost:6274" });
    await local.close();
    const listed = await connect({ token: TOKEN, origin: "https://agent.example" });
    await listed.close();
    // Origin is checked before auth would even matter for a browser, but auth still applies.
    const spoofNoAuth = await rawPost({ headers: { Origin: "https://evil.example" } });
    expect([401, 403]).toContain(spoofNoAuth.status);
  });

  it("DELETE terminates the session; the id is unusable afterwards", async () => {
    const transport = new StreamableHTTPClientTransport(url, { requestInit: auth() });
    const client = new Client({ name: "http-test", version: "0.0.0" });
    await client.connect(transport);
    const sid = transport.sessionId;
    expect(sid).toBeTruthy();
    expect(running.sessionCount()).toBeGreaterThanOrEqual(1);
    await transport.terminateSession();
    const after = await fetch(url, {
      method: "POST",
      headers: {
        ...auth().headers,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "Mcp-Session-Id": sid as string,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    expect(after.status).toBe(404);
    await client.close();
  });

  it("Host header: loopback always passes, other hosts only via KONTOR_ALLOWED_HOSTS (DNS rebinding)", async () => {
    // undici's fetch silently drops a caller-set Host header, so use node:http here.
    const withHost = (u: URL, host: string) =>
      new Promise<number>((resolve, reject) =>
        httpGet(
          { host: u.hostname, port: u.port, path: "/healthz", headers: { Host: host } },
          (r) => {
            r.resume();
            resolve(r.statusCode ?? 0);
          },
        ).on("error", reject),
      );
    expect(await withHost(url, "evil.example")).toBe(403);
    expect(await withHost(url, "localhost:1234")).toBe(200);
    const proxied = await startHttpServer({
      port: 0,
      bind: "127.0.0.1",
      authToken: TOKEN,
      allowedOrigins: [],
      allowedHosts: ["kontor.internal"],
    });
    try {
      const u = new URL(`http://127.0.0.1:${proxied.port}/mcp`);
      expect(await withHost(u, "kontor.internal:8443")).toBe(200);
      expect(await withHost(u, "127.0.0.1")).toBe(200);
      expect(await withHost(u, "evil.example")).toBe(403);
    } finally {
      await proxied.close();
    }
  });

  it("reaps idle sessions and caps concurrent sessions (503)", async () => {
    const small = await startHttpServer({
      port: 0,
      bind: "127.0.0.1",
      authToken: TOKEN,
      allowedOrigins: [],
      maxSessions: 1,
      sessionIdleMs: 200,
    });
    try {
      const u = new URL(`http://127.0.0.1:${small.port}/mcp`);
      const c1 = new Client({ name: "a", version: "0" });
      await c1.connect(new StreamableHTTPClientTransport(u, { requestInit: auth() }));
      expect(small.sessionCount()).toBe(1);
      const c2 = new Client({ name: "b", version: "0" });
      await expect(
        c2.connect(new StreamableHTTPClientTransport(u, { requestInit: auth() })),
      ).rejects.toThrow(/503|Too many sessions/);
      await new Promise((r) => setTimeout(r, 700));
      expect(small.sessionCount()).toBe(0);
      await expect(c1.listTools()).rejects.toThrow(); // its session id is gone (404)
    } finally {
      await small.close();
    }
  });

  it("serves an unauthenticated /healthz for container health checks", async () => {
    const r = await fetch(new URL("/healthz", url));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, name: "kontor-mcp" });
  });

  it("no-auth mode is only reachable via the explicit loopback opt-in", async () => {
    const open = await startHttpServer({ port: 0, bind: "127.0.0.1", allowedOrigins: [] });
    try {
      const u = new URL(`http://127.0.0.1:${open.port}/mcp`);
      const client = new Client({ name: "t", version: "0" });
      await client.connect(new StreamableHTTPClientTransport(u));
      expect((await client.listTools()).tools.length).toBeGreaterThan(0);
      await client.close();
    } finally {
      await open.close();
    }
  });
});
