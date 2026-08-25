import {
  AuditHeaderSchema,
  AuditLayersSchema,
  AuditStatsSchema,
  auditInvoice,
  LocalizedSchema,
  RecommendationSchema,
  renderAuditText,
  VerdictSchema,
} from "@kontor-mcp/core";
import { z } from "zod";
import { DocumentInputSchema, LangSchema, resolveInput } from "../input.js";
import { loadDocument, toToolError } from "./shared.js";
import { FindingSchema } from "./validate.js";

export const AuditInputSchema = DocumentInputSchema.extend({
  known_invoice_numbers: z
    .array(z.string())
    .max(10_000)
    .optional()
    .describe(
      "Invoice numbers already booked/known to the caller; a match yields KONTOR-PLAUS-DUPLICATE and recommendation 'review'. The server stores nothing.",
    ),
  profile_override: z
    .string()
    .optional()
    .describe("Force a rule set by CustomizationID / guideline identifier"),
  lang: LangSchema,
});

export const AuditOutputSchema = z.object({
  header: AuditHeaderSchema,
  verdict: VerdictSchema,
  recommendation: RecommendationSchema,
  rationale: LocalizedSchema,
  findings: z.object({
    structure: z.array(FindingSchema),
    businessRules: z.array(FindingSchema),
    plausibility: z.array(FindingSchema),
  }),
  stats: AuditStatsSchema,
  layers: AuditLayersSchema,
  timingsMs: z.object({
    xsd: z.number().optional(),
    schematron: z.number().optional(),
    plausibility: z.number().optional(),
  }),
  disclaimer: z.string(),
});
export type AuditOutput = z.infer<typeof AuditOutputSchema>;

export async function runAudit(
  input: z.infer<typeof AuditInputSchema>,
): Promise<{ output: AuditOutput; text: string }> {
  const { bytes } = resolveInput(input);
  const doc = await loadDocument(bytes);
  let report: Awaited<ReturnType<typeof auditInvoice>>;
  try {
    const opts: Parameters<typeof auditInvoice>[1] = { plausibility: {} };
    if (input.known_invoice_numbers)
      opts.plausibility = { knownInvoiceNumbers: input.known_invoice_numbers };
    if (input.profile_override) opts.customizationIdOverride = input.profile_override;
    if (doc.pdf) {
      const pdf: { filename: string; conformanceLevel?: string } = { filename: doc.pdf.filename };
      if (doc.pdf.conformanceLevel) pdf.conformanceLevel = doc.pdf.conformanceLevel;
      opts.source = { pdf };
    }
    report = await auditInvoice(doc.xml, opts);
  } catch (e) {
    throw toToolError(e);
  }
  const { timings, disclaimer, ...rest } = report;
  const output: AuditOutput = {
    ...(rest as Omit<AuditOutput, "timingsMs" | "disclaimer">),
    timingsMs: timings,
    disclaimer: disclaimer[input.lang],
  };
  return { output, text: renderAuditText(report, input.lang) };
}
