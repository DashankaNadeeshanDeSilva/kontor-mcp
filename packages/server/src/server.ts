/** Kontor MCP server factory (transport-agnostic; stdio wiring lives in bin.ts). */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DEFAULT_MAX_MB, maxBytes, ToolError } from "./input.js";
import { registerPrompts } from "./prompts.js";
import { registerReferenceResources } from "./reference.js";
import { registerResources } from "./resources.js";
import { SERVER_NAME, SERVER_VERSION } from "./server-meta.js";
import { AuditInputSchema, AuditOutputSchema, runAudit } from "./tools/audit.js";
import {
  CapabilitiesInputSchema,
  CapabilitiesOutputSchema,
  runCapabilities,
} from "./tools/capabilities.js";
import { ConvertInputSchema, ConvertOutputSchema, runConvert } from "./tools/convert.js";
import { ExplainInputSchema, ExplainOutputSchema, runExplain } from "./tools/explain.js";
import { GenerateInputSchema, GenerateOutputSchema, runGenerate } from "./tools/generate.js";
import {
  ObligationsOutputSchema,
  ObligationsToolInputSchema,
  runObligations,
} from "./tools/obligations.js";
import { ParseInputSchema, ParseOutputSchema, runParse } from "./tools/parse.js";
import { runValidate, ValidateInputSchema, ValidateOutputSchema } from "./tools/validate.js";

export { SERVER_NAME, SERVER_VERSION } from "./server-meta.js";

/** Sent to the client on initialize; folds in Desktop verification finding F5 (attachments never reach stdio servers as paths). */
export const SERVER_INSTRUCTIONS = [
  "Kontor MCP validates German/EU e-invoices (XRechnung, ZUGFeRD/Factur-X, EN 16931) fully offline.",
  "Document input convention for every tool: pass `file_path` ONLY for files on the local filesystem of the machine running this server (absolute path). " +
    "For chat attachments, uploads or sandboxed paths (e.g. /mnt/user-data/…) the server cannot read the file — pass the document as `content_base64` instead; do not try `file_path` first.",
  "Prefer `audit_invoice` when the user asks whether an invoice is OK / can be paid / should be rejected; use `validate_invoice` for the raw rule result and `parse_invoice` for the data only.",
  "Findings with ids BR-*, BR-DE-* come from the official rule sets (KoSIT-equivalent verdict); KONTOR-PLAUS-* are Kontor's own plausibility checks and never change the official verdict.",
  "Always relay the disclaimer line of a result to the user: the checks are formal/technical, not tax or legal advice.",
].join("\n");

const INPUT_HINT =
  " Input: `file_path` (absolute, local filesystem only) or `content_base64` (required for chat attachments / sandboxed uploads).";

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
    { capabilities: { logging: {} }, instructions: SERVER_INSTRUCTIONS },
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
        "Detect the format (UBL/CII, EN 16931, XRechnung version, ZUGFeRD/Factur-X profile) of an XML or ZUGFeRD PDF invoice and return its EN 16931 semantic model (BT-annotated). Fully offline." +
        INPUT_HINT,
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
        "Validate an XML or ZUGFeRD PDF invoice against XML Schema and the official EN 16931 / XRechnung Schematron rules (KoSIT-equivalent verdict) plus Kontor plausibility checks, with plain-language explanations and fix hints. Fully offline." +
        INPUT_HINT,
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
    "audit_invoice",
    {
      title: "Audit e-invoice",
      description:
        "One-call audit for accounts payable: parse + validate (XSD, official EN 16931 / XRechnung rules, Kontor plausibility: totals recomputed, VAT rates, IBAN, Leitweg-ID check digits, dates, duplicates) and return header facts, VAT breakdown, verdict, grouped findings with fix hints and an accept / review / reject recommendation with rationale. Fully offline." +
        INPUT_HINT,
      inputSchema: AuditInputSchema.shape,
      outputSchema: AuditOutputSchema.shape,
      annotations: ANNOTATIONS,
    },
    async (input) => {
      void log("audit_invoice called");
      return guard(() => runAudit(input));
    },
  );

  server.registerTool(
    "generate_invoice",
    {
      title: "Generate XRechnung / ZUGFeRD",
      description:
        "Create a compliant e-invoice from structured data: XRechnung 3.0 (UBL 2.1, default) or a ZUGFeRD 2.3 / Factur-X PDF/A-3 with embedded factur-x.xml (`target: zugferd-pdf`, profiles EN16931 / BASIC / EXTENDED). Amounts, VAT breakdown and totals are derived decimal-safe; the result is validated internally — for PDFs the XML is read back out of the generated file first (fail-honest: `valid` reports the real verdict, findings tell what is missing). Optional `output_path` writes the .xml / .pdf to the server's local filesystem (no overwrite unless `overwrite=true`). Fully offline.",
      inputSchema: GenerateInputSchema.shape,
      outputSchema: GenerateOutputSchema.shape,
      annotations: { ...ANNOTATIONS, readOnlyHint: false },
    },
    async (input) => {
      void log("generate_invoice called");
      return guard(() => runGenerate(input));
    },
  );

  server.registerTool(
    "convert_invoice",
    {
      title: "Convert e-invoice",
      description:
        "Convert an invoice: extract the XML from a ZUGFeRD/Factur-X PDF, convert UBL ↔ CII via the EN 16931 semantic model (post-validated, with an honest loss report of anything that did not survive), or render a self-contained HTML preview to show the invoice to a human. Optional `output_path` writes the artifact (no overwrite unless `overwrite=true`). Fully offline." +
        INPUT_HINT,
      inputSchema: ConvertInputSchema.shape,
      outputSchema: ConvertOutputSchema.shape,
      annotations: { ...ANNOTATIONS, readOnlyHint: false },
    },
    async (input) => {
      void log("convert_invoice called");
      return guard(() => runConvert(input));
    },
  );

  server.registerTool(
    "check_obligations",
    {
      title: "Check e-invoicing obligations (Germany)",
      description:
        "Offline decision tree over the German e-invoicing mandate (§ 14 / § 27 Abs. 38 UStG, UStDV §§ 33/34/34a, E-RechV): what applies to an issuer or receiver (B2B / B2G / B2C), from when, transition rules (2026, 2027 with the €800,000 prior-year turnover threshold, 2028), exemptions (small business, small-amount invoices, exempt supplies, cross-border), accepted formats and whether a Leitweg-ID is needed. Every answer carries the primary sources, the date the legal parameters were last verified, and a non-advice disclaimer.",
      inputSchema: ObligationsToolInputSchema.shape,
      outputSchema: ObligationsOutputSchema.shape,
      annotations: ANNOTATIONS,
    },
    async (input) => {
      void log("check_obligations called");
      return guard(() => runObligations(input));
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

  server.registerTool(
    "list_capabilities",
    {
      title: "List capabilities",
      description:
        "Introspect this server: supported formats and profiles, bundled standard versions (XRechnung, EN 16931, KoSIT configuration, XSDs), rule knowledge-base stats, code lists, legal parameters' last-verified date, tools/resources/prompts and the sovereignty statement (offline, no persistence).",
      inputSchema: CapabilitiesInputSchema.shape,
      outputSchema: CapabilitiesOutputSchema.shape,
      annotations: ANNOTATIONS,
    },
    async (input) =>
      guard(() => runCapabilities(input, Math.round(maxBytes() / (1024 * 1024)) || DEFAULT_MAX_MB)),
  );

  registerResources(server);
  registerReferenceResources(server);
  registerPrompts(server);
  return server;
}
