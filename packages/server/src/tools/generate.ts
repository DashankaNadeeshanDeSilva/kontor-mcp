import {
  enrichFinding,
  generateInvoice,
  InvoiceInputSchema,
  ZUGFERD_PROFILES,
} from "@kontor-mcp/core";
import { z } from "zod";
import { type Lang, LangSchema, resolveOutputPath, writeOutput } from "../input.js";
import { DISCLAIMER, toToolError } from "./shared.js";
import { FindingSchema } from "./validate.js";

export const GenerateInputSchema = z.object({
  invoice: InvoiceInputSchema.describe(
    "Invoice data. Amounts are derived server-side (decimal-safe): line nets, VAT breakdown per category/rate, totals.",
  ),
  target: z
    .enum(["xrechnung-ubl", "zugferd-pdf"])
    .default("xrechnung-ubl")
    .describe(
      "Output format: `xrechnung-ubl` (XRechnung 3.0 UBL XML, default — required for German public-sector buyers) or `zugferd-pdf` (ZUGFeRD 2.3 / Factur-X PDF/A-3 with embedded factur-x.xml — the hybrid format for B2B).",
    ),
  zugferd_profile: z
    .enum(ZUGFERD_PROFILES)
    .default("EN16931")
    .describe(
      "ZUGFeRD/Factur-X profile for target zugferd-pdf: EN16931 (default, full EN 16931 content), BASIC (subset — terms outside BASIC are dropped from the XML and reported), EXTENDED.",
    ),
  output_path: z
    .string()
    .optional()
    .describe(
      "Optional absolute path on the server's local filesystem to write the result to (.xml for xrechnung-ubl, .pdf for zugferd-pdf). Existing files are not overwritten unless overwrite=true. For zugferd-pdf the PDF is returned as pdf_base64 only when no output_path is given.",
    ),
  overwrite: z.boolean().default(false),
  lang: LangSchema,
});

export const GenerateOutputSchema = z.object({
  xml: z.string().describe("XRechnung UBL, or the CII XML embedded in the ZUGFeRD PDF"),
  format: z.string().describe("xrechnung-3.0-ubl | zugferd-2.3-<profile>"),
  profile: z.enum(ZUGFERD_PROFILES).optional(),
  pdf_base64: z
    .string()
    .optional()
    .describe("The PDF/A-3 (base64) for target zugferd-pdf when no output_path was given"),
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

export async function runGenerate(
  input: z.infer<typeof GenerateInputSchema>,
): Promise<{ output: GenerateOutput; text: string }> {
  // Resolve the target first so a bad path fails before any work is done.
  const isPdf = input.target === "zugferd-pdf";
  const target = input.output_path
    ? resolveOutputPath(input.output_path, [isPdf ? ".pdf" : ".xml"], input.overwrite)
    : undefined;
  let r: Awaited<ReturnType<typeof generateInvoice>>;
  try {
    r = await generateInvoice(input.invoice, {
      target: input.target,
      zugferdProfile: input.zugferd_profile,
      lang: input.lang,
    });
  } catch (e) {
    throw toToolError(e);
  }
  const output: GenerateOutput = {
    xml: r.xml,
    format: r.format,
    ...(r.profile ? { profile: r.profile } : {}),
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
    writeOutput(target, isPdf && r.pdf ? r.pdf : r.xml);
    output.writtenTo = target;
  } else if (isPdf && r.pdf) {
    output.pdf_base64 = Buffer.from(r.pdf).toString("base64");
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
  const what = o.format.startsWith("zugferd")
    ? `ZUGFeRD 2.3 / Factur-X ${o.profile ?? ""} (PDF/A-3)`.trim()
    : "XRechnung 3.0 (UBL)";
  const lines = [`${what} ${L ? "erzeugt" : "generated"}: ${number} — ${status}`];
  lines.push(
    `${L ? "Netto" : "Net"} ${o.totals.taxExclusive} · ${L ? "USt" : "VAT"} ${o.totals.taxAmount ?? "0.00"} · ${L ? "Brutto" : "Gross"} ${o.totals.taxInclusive} · ${L ? "Zahlbetrag" : "Due"} ${o.totals.payable} ${currency}`,
    `${L ? "USt-Aufschlüsselung" : "VAT breakdown"}: ${o.taxBreakdown.map((b) => `${b.categoryCode} ${b.rate ?? "–"} %: ${b.taxableAmount} → ${b.taxAmount}`).join(" | ")}`,
  );
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
  else if (o.pdf_base64)
    lines.push(
      L
        ? "PDF als pdf_base64 zurückgegeben (output_path angeben, um die Datei direkt zu speichern)."
        : "PDF returned as pdf_base64 (pass output_path to have it written to disk).",
    );
  if (!o.valid)
    lines.push(
      L
        ? "Die Datei ist NICHT versandfertig — Befunde beheben und erneut erzeugen."
        : "The file is NOT ready to send — fix the findings and generate again.",
    );
  lines.push(o.disclaimer);
  return lines.join("\n");
}
