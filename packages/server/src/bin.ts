#!/usr/bin/env node
/**
 * Entry point: `npx @kontor-mcp/server` / Claude Desktop command (stdio, default) or
 * `KONTOR_TRANSPORT=http` for the Streamable HTTP host (PRD §5.9).
 */
import { warmUp } from "@kontor-mcp/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readConfig } from "./config.js";
import { runHttp } from "./http.js";
import { createServer } from "./server.js";

let config: ReturnType<typeof readConfig>;
try {
  config = readConfig();
} catch (e) {
  console.error(`[kontor-mcp] configuration error: ${(e as Error).message}`);
  process.exit(2);
}

if (config.transport === "http") {
  await runHttp(config);
} else {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  // Pre-load SEFs/XSDs after the handshake so the first tool call is fast (NFR-3); never block startup.
  setImmediate(() => {
    try {
      warmUp();
    } catch {
      /* artifacts are loaded lazily on first use anyway */
    }
  });
}
