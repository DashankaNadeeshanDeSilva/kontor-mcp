/**
 * @kontor-mcp/client — `kontor-agent`, the reference MCP client CLI for Kontor MCP.
 */
export { type AuditRun, EXIT_CODES, EXIT_ERROR, runAudit } from "./commands/audit.js";
export {
  bridgeTools,
  buildSystemPrompt,
  type ChatResult,
  type ChatRunner,
  DEFAULT_MODEL,
  runChat,
} from "./commands/chat.js";
export { renderTools } from "./commands/tools.js";
export {
  CLIENT_NAME,
  CLIENT_VERSION,
  type Connection,
  type ConnectOptions,
  connect,
  serverBinPath,
} from "./connect.js";
