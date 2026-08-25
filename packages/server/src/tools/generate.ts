import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { enrichFinding, generateInvoice, InvoiceInputSchema } from "@kontor-mcp/core";
import { z } from "zod";
import { type Lang, LangSchema, ToolError } from "../input.js";
import { DISCLAIMER, toToolError } from "./shared.js";
import { FindingSchema } from "./validate.js";

export const GenerateInputSchema = z.object({
  invoice: InvoiceInputSchema.describe(
    "Invoice data. Amounts are derived server-side (decimal-safe): line nets, VAT breakdown per category/rate, totals.",
  ),
  output_path: z
    .string()
    .optional()
    .describe(
      "Optional absolute .xml path on the server's local filesystem to write the result to. Existing files are not overwritten unless overwrite=true.",
    ),
  overwrite: z.boolean().default(false),
  lang: LangSchema,
});

export const GenerateOutputSchema = z.object({
  xml: z.string(),
  format: z.literal("xrechnung-3.0-ubl"),
  valid: z
    .boolean()
    .describe(
      "Official verdict of the internal validation (XSD + EN 16931 + XRechnung) — never assumed",
    ),
  plausible: z.boolean().describe("No error-level KONTOR-PLAUS-* findings"),
  findings: z.array(FindingSchema),
  autoFixes: z.array(z.object({ code: z.string(), description: z.string() })),
  totals: z.object({
    lineExtension: z.string(),
    taxExclusive: z.string(),
    taxAmount: z.string().optional(),
    taxInclusive: z.string(),
    payable: z.string(),
  }),
  taxBreakdown: z.array(
    z.object({
      categoryCode: z.string(),
      rate: z.string().optional(),
      taxableAmount: z.string(),
      taxAmount: z.string(),
    }),
  ),
  writtenTo: z.string().optional(),
  disclaimer: z.string(),
});
export type GenerateOutput = z.infer<typeof GenerateOutputSchema>;

function resolveOutputPath(p: string, overwrite: boolean): string {
  if (!isAbsolute(p)) throw new ToolError(`output_path must be absolute (got "${p}").`);
  const abs = resolve(p);
  if (extname(abs).toLowerCase() !== ".xml")
    throw new ToolError(`output_path must end in .xml (got "${extname(abs)}").`);
  if (existsSync(abs) && !overwrite)
    throw new ToolError(`output_path already exists: ${abs}. Pass overwrite=true to replace it.`);
  return abs;
}

export async function runGenerate(
  input: z.infer<typeof GenerateInputSchema>,
): Promise<{ output: GenerateOutput; text: string }> {
  // Resolve the target first so a bad path fails before any work is done.
  const target = input.output_path
    ? resolveOutputPath(input.output_path, input.overwrite)
    : undefined;
  let r: Awaited<ReturnType<typeof generateInvoice>>;
  try {
    r = await generateInvoice(input.invoice);
  } catch (e) {
    throw toToolError(e);
  }
  const output: GenerateOutput = {
    xml: r.xml,
    format: "xrechnung-3.0-ubl",
    valid: r.valid,
    plausible: r.plausible,
    findings: r.findings.map(enrichFinding) as GenerateOutput["findings"],
    autoFixes: r.autoFixes,
    totals: r.model.totals,
    taxBreakdown: r.model.vatBreakdown.map((b) => {
      const e: GenerateOutput["taxBreakdown"][number] = {
        categoryCode: b.categoryCode,
        taxableAmount: b.taxableAmount,
        taxAmount: b.taxAmount,
      };
      if (b.rate !== undefined) e.rate = b.rate;
      return e;
    }),
    disclaimer: DISCLAIMER[input.lang],
  };
  if (target) {
    try {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, r.xml, "utf8");
    } catch (e) {
      throw new ToolError(
        `Could not write ${target}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    output.writtenTo = target;
  }
  return { output, text: summarize(output, input.lang, r.model.number, r.model.currency) };
}

function summarize(o: GenerateOutput, lang: Lang, number: string, currency: string): string {
  const L = lang === "de";
  const status = o.valid
    ? o.plausible
      ? L
        ? "GÜLTIG"
        : "VALID"
      : L
        ? "GÜLTIG (Plausibilitätsfehler)"
        : "VALID (plausibility errors)"
    : L
      ? "UNGÜLTIG"
      : "INVALID";
  const lines = [
    `${L ? "XRechnung 3.0 (UBL) erzeugt" : "XRechnung 3.0 (UBL) generated"}: ${number} — ${status}`,
    `${L ? "Netto" : "Net"} ${o.totals.taxExclusive} · ${L ? "USt" : "VAT"} ${o.totals.taxAmount ?? "0.00"} · ${L ? "Brutto" : "Gross"} ${o.totals.taxInclusive} · ${L ? "Zahlbetrag" : "Due"} ${o.totals.payable} ${currency}`,
    `${L ? "USt-Aufschlüsselung" : "VAT breakdown"}: ${o.taxBreakdown.map((b) => `${b.categoryCode} ${b.rate ?? "–"} %: ${b.taxableAmount} → ${b.taxAmount}`).join(" | ")}`,
  ];
  if (o.autoFixes.length)
    lines.push(
      `${L ? "Automatisch korrigiert" : "Auto-fixed"}: ${o.autoFixes.map((f) => f.description).join(" ")}`,
    );
  const relevant = o.findings.filter((f) => f.severity !== "info");
  if (relevant.length) {
    lines.push(L ? "Befunde:" : "Findings:");
    for (const f of relevant.slice(0, 15))
      lines.push(`- [${f.severity}] ${f.ruleId}: ${f.explanation?.[lang] ?? f.message}`);
  }
  if (o.writtenTo) lines.push(`${L ? "Gespeichert unter" : "Written to"}: ${o.writtenTo}`);
  if (!o.valid)
    lines.push(
      L
        ? "Die Datei ist NICHT versandfertig — Befunde beheben und erneut erzeugen."
        : "The file is NOT ready to send — fix the findings and generate again.",
    );
  lines.push(o.disclaimer);
  return lines.join("\n");
}
