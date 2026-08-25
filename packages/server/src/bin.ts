#!/usr/bin/env node
/** stdio entry point: `npx @kontor-mcp/server` / Claude Desktop command. */
import { warmUp } from "@kontor-mcp/core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

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
