/** parseInvoice: XML bytes / XmlDocument → { format, invoice, warnings } (PRD §5.5 T1). */
import { DetectError, type DetectedFormat, detectFormatFromDocument } from "../detect/index.js";
import type { Finding } from "../finding.js";
import { type InvoiceModel, InvoiceModelSchema } from "../model/index.js";
import { loadXml, XmlDocument, type XmlLoadOptions } from "../xml/index.js";
import { CII_MAP } from "./cii.js";
import { extractGroup } from "./engine.js";
import { UBL_MAP } from "./ubl.js";

export interface ParseResult {
  format: DetectedFormat;
  invoice: InvoiceModel;
  /** Non-fatal parse issues, e.g. mandatory BTs missing (KONTOR-PARSE-MISSING). */
  warnings: Finding[];
}

export function parseInvoice(
  input: Uint8Array | string | XmlDocument,
  options: XmlLoadOptions = {},
): ParseResult {
  const doc = input instanceof XmlDocument ? input : loadXml(input, options);
  const format = detectFormatFromDocument(doc);
  const map = format.syntax === "cii" ? CII_MAP : UBL_MAP;
  const raw = extractGroup(doc, doc.root as unknown as Node, map);
  const warnings: Finding[] = [];
  const parsed = InvoiceModelSchema.safeParse(raw);
  if (parsed.success) return { format, invoice: parsed.data, warnings };

  // Fill mandatory-but-missing fields so callers still get a typed model, and report each gap.
  for (const issue of parsed.error.issues) {
    const path = issue.path
      .map((p) => (typeof p === "number" ? `[${p}]` : `.${String(p)}`))
      .join("")
      .replace(/^\./, "");
    warnings.push({
      ruleId: "KONTOR-PARSE-MISSING",
      severity: "warning",
      source: "plausibility",
      location: path,
      message: `${issue.message} at ${path || "<root>"}`,
    });
    if (issue.code === "invalid_type") setDefault(raw, issue.path as (string | number)[]);
  }
  const retry = InvoiceModelSchema.safeParse(raw);
  if (!retry.success) {
    throw new DetectError(
      "KONTOR-DETECT-UNSUPPORTED",
      `document cannot be mapped to the EN 16931 model: ${retry.error.message}`,
    );
  }
  return { format, invoice: retry.data, warnings };
}

function setDefault(obj: Record<string, unknown>, path: (string | number)[]): void {
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = String(path[i]);
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  const last = String(path[path.length - 1]);
  if (cur[last] === undefined)
    cur[last] = ARRAY_FIELDS.has(last) ? [] : OBJECT_FIELDS.has(last) ? {} : "";
}
const ARRAY_FIELDS = new Set(["lines", "vatBreakdown"]);
const OBJECT_FIELDS = new Set(["seller", "buyer", "totals", "price", "vat", "item"]);
