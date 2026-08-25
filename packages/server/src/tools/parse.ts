import {
  DetectedFormatSchema,
  InvoiceModelSchema,
  parseInvoice,
  toAnnotatedJson,
} from "@kontor-mcp/core";
import { z } from "zod";
import { DocumentInputSchema, type Lang, LangSchema, resolveInput } from "../input.js";
import { loadDocument, toToolError } from "./shared.js";

export const ParseInputSchema = DocumentInputSchema.extend({ lang: LangSchema });
export const ParseOutputSchema = z.object({
  format: DetectedFormatSchema,
  invoice: InvoiceModelSchema,
  /** PRD §5.3 shape: every value wrapped as {bt, value}, groups carry {bg}. */
  invoiceAnnotated: z.record(z.string(), z.unknown()),
  pdf: z
    .object({
      filename: z.string(),
      candidates: z.array(z.string()),
      conformanceLevel: z.string().optional(),
    })
    .optional(),
  warnings: z.array(z.record(z.string(), z.unknown())),
});
export type ParseOutput = z.infer<typeof ParseOutputSchema>;

export async function runParse(
  input: z.infer<typeof ParseInputSchema>,
): Promise<{ output: ParseOutput; text: string }> {
  const { bytes } = resolveInput(input);
  const doc = await loadDocument(bytes);
  let result: ReturnType<typeof parseInvoice>;
  try {
    result = parseInvoice(doc.xml);
  } catch (e) {
    throw toToolError(e);
  }
  const format = doc.format ?? result.format;
  const output: ParseOutput = {
    format,
    invoice: result.invoice,
    invoiceAnnotated: toAnnotatedJson(result.invoice) as Record<string, unknown>,
    warnings: result.warnings as unknown as Record<string, unknown>[],
  };
  if (doc.pdf) output.pdf = doc.pdf;
  return { output, text: summarize(output, input.lang) };
}

function summarize(o: ParseOutput, lang: Lang): string {
  const inv = o.invoice;
  const f = o.format;
  const fmt = [
    f.container === "pdf" ? "ZUGFeRD/Factur-X PDF" : "XML",
    f.syntax?.toUpperCase(),
    f.cius === "xrechnung"
      ? `XRechnung ${f.version ?? ""}${f.xrechnungVariant && f.xrechnungVariant !== "base" ? ` (${f.xrechnungVariant})` : ""}`
      : f.standard === "en16931"
        ? "EN 16931"
        : null,
    f.profile ? `profile ${f.profile.toUpperCase()}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const L = lang === "de";
  const lines = [
    `${L ? "Format" : "Format"}: ${fmt}`,
    `${L ? "Rechnung" : "Invoice"} ${inv.number} (${L ? "Typ" : "type"} ${inv.typeCode}) ${L ? "vom" : "issued"} ${inv.issueDate}${inv.dueDate ? `, ${L ? "fällig" : "due"} ${inv.dueDate}` : ""}`,
    `${L ? "Verkäufer" : "Seller"}: ${inv.seller.name}${inv.seller.vatId ? ` (${inv.seller.vatId})` : ""} → ${L ? "Käufer" : "Buyer"}: ${inv.buyer.name}${inv.buyerReference ? ` · ${L ? "Käuferreferenz/Leitweg-ID" : "buyer reference/Leitweg-ID"} ${inv.buyerReference}` : ""}`,
    `${inv.lines.length} ${L ? "Positionen" : "lines"} · ${L ? "netto" : "net"} ${inv.totals.taxExclusive} · ${L ? "brutto" : "gross"} ${inv.totals.taxInclusive} · ${L ? "zahlbar" : "payable"} ${inv.totals.payable} ${inv.currency}`,
  ];
  if (o.pdf)
    lines.push(
      `${L ? "Eingebettete Datei" : "Embedded file"}: ${o.pdf.filename}${o.pdf.conformanceLevel ? ` (${o.pdf.conformanceLevel})` : ""}`,
    );
  if (o.warnings.length)
    lines.push(`${o.warnings.length} ${L ? "Parser-Hinweise" : "parser warnings"}`);
  return lines.join("\n");
}
