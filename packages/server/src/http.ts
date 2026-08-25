/**
 * Streamable HTTP host (Task 3.1, PRD NFR-5 "HTTP transport").
 *
 * One Express app, one `StreamableHTTPServerTransport` per MCP session, the same `createServer()`
 * factory as stdio. Security posture: loopback bind by default (SDK host-header validation guards
 * against DNS rebinding there), Bearer token compared in constant time, Origin allow-list, no
 * session state beyond the in-memory transport map, no payload logging. TLS is the reverse proxy's
 * job (see SECURITY.md).
 *
 * `createMcpExpressApp` from the SDK is deliberately not used: it hard-codes `express.json()` at
 * the 100 kB default, which would reject every `content_base64` PDF — the main reason HTTP exists
 * (Desktop never hands attachment bytes to stdio servers, finding F7). We compose the same pieces.
 */
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Server as NodeHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { warmUp } from "@kontor-mcp/core";
import {
  hostHeaderValidation,
  localhostHostValidation,
} from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { isLoopback } from "./config.js";
import { maxBytes } from "./input.js";
import { createServer } from "./server.js";
import { SERVER_NAME, SERVER_VERSION } from "./server-meta.js";

export interface HttpServerOptions {
  port: number;
  bind: string;
  /** Undefined = no authentication (caller must have enforced the loopback opt-in). */
  authToken?: string | undefined;
  allowedOrigins: string[];
  /** Extra hostnames accepted in the Host header when not bound to loopback. */
  allowedHosts?: string[];
  log?: (line: string) => void;
}

export interface RunningHttpServer {
  port: number;
  sessionCount(): number;
  /** Closes every session transport, then the listener. Idempotent. */
  close(): Promise<void>;
}

export const MCP_PATH = "/mcp";

// --- middleware -------------------------------------------------------------

function bearerAuth(token: string) {
  const expected = Buffer.from(token, "utf8");
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    const given = Buffer.from(match?.[1]?.trim() ?? "", "utf8");
    // Compare in constant time; a length mismatch is still a mismatch, not an early-exit oracle.
    const ok = given.length === expected.length && timingSafeEqual(given, expected);
    if (!ok) {
      res
        .status(401)
        .set("WWW-Authenticate", 'Bearer realm="kontor-mcp"')
        .json(jsonRpcError(-32001, "Unauthorized: missing or invalid bearer token"));
      return;
    }
    next();
  };
}

const LOOPBACK_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/** Requests without Origin (non-browser clients) pass; browsers must be local or allow-listed. */
export function originAllowed(origin: string | undefined, allowList: readonly string[]): boolean {
  if (origin === undefined) return true;
  const o = origin.trim().replace(/\/$/, "");
  if (LOOPBACK_ORIGIN.test(o)) return true;
  return allowList.some((a) => a.replace(/\/$/, "").toLowerCase() === o.toLowerCase());
}

function originCheck(allowList: readonly string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!originAllowed(req.header("origin"), allowList)) {
      res.status(403).json(jsonRpcError(-32003, "Forbidden: Origin not allowed"));
      return;
    }
    next();
  };
}

function jsonRpcError(code: number, message: string, id: null | string | number = null) {
  return { jsonrpc: "2.0", error: { code, message }, id };
}

/** JSON body cap: base64 inflates by 4/3, plus headroom for the JSON-RPC envelope. */
export function jsonBodyLimit(): number {
  return Math.ceil(maxBytes() * (4 / 3)) + 1024 * 1024;
}

// --- app --------------------------------------------------------------------

export function createHttpApp(opts: HttpServerOptions): {
  app: Express;
  sessions: Map<string, StreamableHTTPServerTransport>;
} {
  const app = express();
  app.disable("x-powered-by");
  if (opts.allowedHosts?.length) app.use(hostHeaderValidation(opts.allowedHosts));
  else if (isLoopback(opts.bind)) app.use(localhostHostValidation());

  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const log = opts.log ?? (() => {});

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, name: SERVER_NAME, version: SERVER_VERSION, sessions: sessions.size });
  });

  const guards = [
    originCheck(opts.allowedOrigins),
    ...(opts.authToken ? [bearerAuth(opts.authToken)] : []),
    express.json({ limit: jsonBodyLimit() }),
  ];

  app.post(MCP_PATH, ...guards, async (req, res) => {
    const sid = req.header("mcp-session-id");
    let transport = sid ? sessions.get(sid) : undefined;
    if (!transport) {
      if (sid) {
        res.status(404).json(jsonRpcError(-32001, "Session not found"));
        return;
      }
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, transport as StreamableHTTPServerTransport);
          log(`session ${id} opened (${sessions.size} active)`);
        },
        onsessionclosed: (id) => {
          sessions.delete(id);
          log(`session ${id} closed (${sessions.size} active)`);
        },
      });
      transport.onclose = () => {
        const id = transport?.sessionId;
        if (id && sessions.delete(id)) log(`session ${id} dropped (${sessions.size} active)`);
      };
      // Cast: the class's `onclose` getter type trips exactOptionalPropertyTypes; it is a Transport.
      await createServer().connect(transport as Transport);
    }
    await transport.handleRequest(req, res, req.body);
  });

  const withSession = async (req: Request, res: Response) => {
    const sid = req.header("mcp-session-id");
    const transport = sid ? sessions.get(sid) : undefined;
    if (!transport) {
      res.status(sid ? 404 : 400).json(jsonRpcError(-32000, "Bad Request: no valid session"));
      return;
    }
    await transport.handleRequest(req, res);
  };
  app.get(MCP_PATH, ...guards, withSession);
  app.delete(MCP_PATH, ...guards, withSession);

  // Body-parser / JSON errors → JSON-RPC shaped responses, never a stack trace.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as { status?: number; type?: string; message?: string };
    const status = e.status ?? 500;
    const message =
      status === 413
        ? `Payload too large (limit ${jsonBodyLimit()} bytes; raise KONTOR_MAX_FILE_MB)`
        : status === 400
          ? "Bad Request: invalid JSON"
          : "Internal error";
    res.status(status).json(jsonRpcError(status === 413 ? -32000 : -32700, message));
  });

  return { app, sessions };
}

export async function startHttpServer(opts: HttpServerOptions): Promise<RunningHttpServer> {
  const { app, sessions } = createHttpApp(opts);
  const server: NodeHttpServer = await new Promise((resolve, reject) => {
    const s = app.listen(opts.port, opts.bind, () => resolve(s));
    s.once("error", reject);
  });
  const port = (server.address() as AddressInfo).port;
  let closing: Promise<void> | undefined;
  return {
    port,
    sessionCount: () => sessions.size,
    close: () => {
      closing ??= (async () => {
        await Promise.allSettled([...sessions.values()].map((t) => t.close()));
        sessions.clear();
        server.closeAllConnections?.();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      })();
      return closing;
    },
  };
}

/** Entry used by bin.ts: start, log the bind, wire graceful shutdown, warm up artefacts. */
export async function runHttp(opts: HttpServerOptions): Promise<RunningHttpServer> {
  const log = opts.log ?? ((line: string) => console.error(`[kontor-mcp] ${line}`));
  const running = await startHttpServer({ ...opts, log });
  log(
    `${SERVER_NAME} ${SERVER_VERSION} listening on http://${opts.bind}:${running.port}${MCP_PATH} ` +
      `(auth: ${opts.authToken ? "bearer" : "NONE — loopback opt-in"}, origins: localhost` +
      `${opts.allowedOrigins.length ? `, ${opts.allowedOrigins.join(", ")}` : ""})`,
  );
  const shutdown = (signal: string) => {
    log(`${signal} received, closing ${running.sessionCount()} session(s)`);
    running.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  setImmediate(() => {
    try {
      warmUp();
    } catch {
      /* artefacts load lazily on first use anyway */
    }
  });
  return running;
}
