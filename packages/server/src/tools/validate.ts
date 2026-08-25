import { DetectedFormatSchema, enrichFinding, validateInvoice } from "@kontor-mcp/core";
import { bundledStandards } from "@kontor-mcp/rules";
import { z } from "zod";
import { DocumentInputSchema, type Lang, LangSchema, resolveInput } from "../input.js";
import { DISCLAIMER, loadDocument, toToolError } from "./shared.js";

export const ValidateInputSchema = DocumentInputSchema.extend({
  profile_override: z
    .string()
    .optional()
    .describe("Force a rule set by CustomizationID / guideline identifier"),
  skip_layers: z
    .array(z.enum(["xsd", "schematron", "plausibility"]))
    .optional()
    .describe("Validation layers to skip"),
  lang: LangSchema,
});

const LocalizedSchema = z.object({ de: z.string(), en: z.string() });
export const FindingSchema = z.object({
  ruleId: z.string(),
  severity: z.enum(["fatal", "error", "warning", "info"]),
  source: z.enum(["xsd", "schematron-en16931", "schematron-xrechnung", "plausibility"]),
  location: z.string().optional(),
  message: z.string(),
  explanation: LocalizedSchema.optional(),
  fixHint: LocalizedSchema.optional(),
  bt: z.array(z.string()).optional(),
});

export const ValidateOutputSchema = z.object({
  verdict: z.enum(["valid", "invalid", "valid_with_warnings"]),
  findings: z.array(FindingSchema),
  stats: z.object({ fatal: z.number(), error: z.number(), warning: z.number(), info: z.number() }),
  ruleSets: z.array(z.object({ name: z.string(), version: z.string() })),
  format: DetectedFormatSchema,
  scenario: z.string().nullable(),
  layers: z.object({
    xsd: z.enum(["pass", "fail", "skipped"]),
    schematron: z.enum(["pass", "fail", "skipped"]),
    plausibility: z.enum(["pass", "fail", "skipped"]),
  }),
  timingsMs: z.object({
    xsd: z.number().optional(),
    schematron: z.number().optional(),
    plausibility: z.number().optional(),
  }),
  disclaimer: z.string(),
});
export type ValidateOutput = z.infer<typeof ValidateOutputSchema>;

const SEVERITY_ORDER = { fatal: 0, error: 1, warning: 2, info: 3 } as const;

export async function runValidate(
  input: z.infer<typeof ValidateInputSchema>,
): Promise<{ output: ValidateOutput; text: string }> {
  const { bytes } = resolveInput(input);
  const doc = await loadDocument(bytes);
  let r: Awaited<ReturnType<typeof validateInvoice>>;
  try {
    const opts: Parameters<typeof validateInvoice>[1] = {};
    if (input.skip_layers) opts.skipLayers = input.skip_layers;
    if (input.profile_override) opts.customizationIdOverride = input.profile_override;
    r = await validateInvoice(doc.xml, opts);
  } catch (e) {
    throw toToolError(e);
  }
  const findings = r.findings
    .map(enrichFinding)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const stats = { fatal: 0, error: 0, warning: 0, info: 0 };
  for (const f of findings) stats[f.severity]++;
  // Plausibility errors never make the official verdict "invalid" (KoSIT parity), but they must surface.
  const verdict = !r.valid
    ? "invalid"
    : stats.error + stats.warning > 0
      ? "valid_with_warnings"
      : "valid";
  const ruleSets: ValidateOutput["ruleSets"] = [];
  if (r.layers.xsd !== "skipped")
    ruleSets.push({
      name: r.format.syntax === "cii" ? "UN/CEFACT CII XSD" : "OASIS UBL XSD",
      version: r.format.syntax === "cii" ? bundledStandards.ciiXsd : bundledStandards.ublXsd,
    });
  if (r.layers.schematron !== "skipped") {
    ruleSets.push({ name: "EN 16931 Schematron", version: bundledStandards.en16931 });
    if (r.format.cius === "xrechnung")
      ruleSets.push({
        name: "XRechnung Schematron",
        version: bundledStandards.xrechnungSchematron,
      });
  }
  const output: ValidateOutput = {
    verdict,
    findings: findings as z.infer<typeof FindingSchema>[],
    stats,
    ruleSets,
    format: doc.format ?? r.format,
    scenario: r.scenario,
    layers: r.layers,
    timingsMs: r.timings,
    disclaimer: DISCLAIMER[input.lang],
  };
  return { output, text: summarize(output, input.lang) };
}

function summarize(o: ValidateOutput, lang: Lang): string {
  const L = lang === "de";
  const head = {
    valid: L ? "GÜLTIG" : "VALID",
    valid_with_warnings: L ? "GÜLTIG (mit Warnungen)" : "VALID (with warnings)",
    invalid: L ? "UNGÜLTIG" : "INVALID",
  }[o.verdict];
  const lines = [
    `${head} — ${o.scenario ?? (L ? "kein KoSIT-Szenario (nur XSD)" : "no KoSIT scenario (XSD only)")}`,
    `${o.stats.fatal} fatal · ${o.stats.error} ${L ? "Fehler" : "errors"} · ${o.stats.warning} ${L ? "Warnungen" : "warnings"} · ${o.stats.info} Info`,
  ];
  for (const f of o.findings.slice(0, 25)) {
    const expl = f.explanation?.[lang];
    lines.push(
      `- [${f.severity}] ${f.ruleId}${f.location ? ` @ ${f.location}` : ""}: ${expl ?? f.message}`,
    );
    if (f.fixHint?.[lang]) lines.push(`    ↳ ${L ? "Fix" : "Fix"}: ${f.fixHint[lang]}`);
  }
  if (o.findings.length > 25) lines.push(`… ${o.findings.length - 25} ${L ? "weitere" : "more"}`);
  lines.push(o.disclaimer);
  return lines.join("\n");
}
