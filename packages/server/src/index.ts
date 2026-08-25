/** @kontor-mcp/server — MCP server exposing Kontor tools/resources (stdio via bin.ts). */

export { type HttpConfig, readConfig, type ServerConfig } from "./config.js";
export { createHttpApp, type RunningHttpServer, startHttpServer } from "./http.js";
export { listSamples, SAMPLES_DIR } from "./resources.js";
export { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
