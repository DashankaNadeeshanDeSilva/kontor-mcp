/** Kontor MCP server factory (transport-agnostic; stdio wiring lives in bin.ts). */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolError } from "./input.js";
import { registerResources } from "./resources.js";
import { ExplainInputSchema, ExplainOutputSchema, runExplain } from "./tools/explain.js";
import { ParseInputSchema, ParseOutputSchema, runParse } from "./tools/parse.js";
import { runValidate, ValidateInputSchema, ValidateOutputSchema } from "./tools/validate.js";

export const SERVER_NAME = "kontor-mcp" as const;
export const SERVER_VERSION = "0.1.0";

const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function guard<T>(
  fn: () => Promise<{ output: T; text: string }> | { output: T; text: string },
): Promise<ToolResult> {
  return Promise.resolve()
    .then(fn)
    .then(({ output, text }) => ({
      content: [{ type: "text" as const, text }],
      structuredContent: output as Record<string, unknown>,
    }))
    .catch((e: unknown) => {
      const msg =
        e instanceof ToolError
          ? e.message
          : `Unexpected error: ${e instanceof Error ? e.message : String(e)}`;
      return { content: [{ type: "text" as const, text: msg }], isError: true };
    });
}

export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { logging: {} } },
  );

  const log = (message: string) =>
    server.server
      .sendLoggingMessage({ level: "info", logger: SERVER_NAME, data: message })
      .catch(() => {});

  server.registerTool(
    "parse_invoice",
    {
      title: "Parse e-invoice",
      description:
        "Detect the format (UBL/CII, EN 16931, XRechnung version, ZUGFeRD/Factur-X profile) of an XML or ZUGFeRD PDF invoice and return its EN 16931 semantic model (BT-annotated). Fully offline.",
      inputSchema: ParseInputSchema.shape,
      outputSchema: ParseOutputSchema.shape,
      annotations: ANNOTATIONS,
    },
    async (input) => {
      void log("parse_invoice called");
      return guard(() => runParse(input));
    },
  );

  server.registerTool(
    "validate_invoice",
    {
      title: "Validate e-invoice",
      description:
        "Validate an XML or ZUGFeRD PDF invoice against XML Schema and the official EN 16931 / XRechnung Schematron rules (KoSIT-equivalent verdict), with plain-language explanations and fix hints. Fully offline.",
      inputSchema: ValidateInputSchema.shape,
      outputSchema: ValidateOutputSchema.shape,
      annotations: ANNOTATIONS,
    },
    async (input) => {
      void log("validate_invoice called");
      return guard(() => runValidate(input));
    },
  );

  server.registerTool(
    "explain_rule",
    {
      title: "Explain validation rule",
      description:
        "Explain an EN 16931 / XRechnung rule id (e.g. BR-DE-15): official text, plain-language explanation (DE/EN), affected business terms, fix hint. Unknown ids get nearest-match suggestions.",
      inputSchema: ExplainInputSchema.shape,
      outputSchema: ExplainOutputSchema.shape,
      annotations: ANNOTATIONS,
    },
    async (input) => guard(() => runExplain(input)),
  );

  registerResources(server);
  return server;
}
