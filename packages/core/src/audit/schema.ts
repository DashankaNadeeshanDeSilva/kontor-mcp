import { z } from "zod";
import { DetectedFormatSchema } from "../detect/index.js";

const s = z.string();
const os = z.string().optional();
const LocalizedSchema = z.object({ de: s, en: s });

export const AuditPartySchema = z.object({ name: s, vatId: os, countryCode: os });

export const AuditHeaderSchema = z.object({
  number: s,
  issueDate: s,
  dueDate: os,
  typeCode: s,
  currency: s,
  seller: AuditPartySchema,
  buyer: AuditPartySchema,
  buyerReference: os,
  lineCount: z.number().int(),
  totals: z.object({
    lineExtension: s,
    taxExclusive: s,
    taxAmount: os,
    taxInclusive: s,
    payable: s,
  }),
  /** BG-23 VAT breakdown — prominent by design (Desktop verification finding F9). */
  taxBreakdown: z.array(
    z.object({ categoryCode: s, rate: os, taxableAmount: s, taxAmount: s, exemptionReason: os }),
  ),
  payment: z.object({ meansCode: s, ibans: z.array(s), remittanceInfo: os }).optional(),
  format: DetectedFormatSchema,
  scenario: s.nullable(),
  source: z.object({ pdf: z.object({ filename: s, conformanceLevel: os }).optional() }).optional(),
});

export const RecommendationSchema = z.enum(["accept", "reject", "review"]);
export const VerdictSchema = z.enum(["valid", "invalid", "valid_with_warnings"]);
export const LayerStatusSchema = z.enum(["pass", "fail", "skipped"]);
export const AuditLayersSchema = z.object({
  xsd: LayerStatusSchema,
  schematron: LayerStatusSchema,
  plausibility: LayerStatusSchema,
});
export const AuditStatsSchema = z.object({
  fatal: z.number(),
  error: z.number(),
  warning: z.number(),
  info: z.number(),
});
export { LocalizedSchema };

export type AuditHeader = z.infer<typeof AuditHeaderSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
