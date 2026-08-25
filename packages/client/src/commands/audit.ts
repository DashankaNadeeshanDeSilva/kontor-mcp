/** `kontor-agent audit <file>` — one direct `audit_invoice` call; no LLM, no API key. */
import { resolve } from "node:path";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

export type Recommendation = "accept" | "review" | "reject";
/** Script-friendly: accept 0 · review 1 · reject 2 · error 3. */
export const EXIT_CODES: Record<Recommendation, number> = { accept: 0, review: 1, reject: 2 };
export const EXIT_ERROR = 3;

export interface AuditOptions {
  lang?: "de" | "en";
  known?: string[];
}

export interface AuditRun {
  exitCode: number;
  recommendation: Recommendation | undefined;
  invoiceNumber: string;
  text: string;
  structured: Record<string, unknown> | undefined;
}

export async function runAudit(
  client: Client,
  file: string,
  opts: AuditOptions,
): Promise<AuditRun> {
  const args: Record<string, unknown> = { file_path: resolve(file) };
  if (opts.lang) args.lang = opts.lang;
  if (opts.known?.length) args.known_invoice_numbers = opts.known;
  const r = await client.callTool({ name: "audit_invoice", arguments: args });
  const text = (r.content as Array<{ type: string; text?: string }>)
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
  if (r.isError) {
    return {
      exitCode: EXIT_ERROR,
      recommendation: undefined,
      invoiceNumber: "",
      text,
      structured: undefined,
    };
  }
  const sc = (r.structuredContent ?? {}) as {
    recommendation?: Recommendation;
    header?: { number?: string };
  };
  const recommendation = sc.recommendation;
  return {
    exitCode: recommendation ? EXIT_CODES[recommendation] : EXIT_ERROR,
    recommendation,
    invoiceNumber: sc.header?.number ?? "",
    text,
    structured: sc as Record<string, unknown>,
  };
}
