import { explainRule } from "@kontor-mcp/rules";
import { z } from "zod";
import { type Lang, LangSchema } from "../input.js";
import { DISCLAIMER } from "./shared.js";

export const ExplainInputSchema = z.object({
  rule_id: z.string().min(1).describe("Rule identifier, e.g. BR-DE-15, BR-CO-10, BR-S-08"),
  lang: LangSchema,
});

const LocalizedSchema = z.object({ de: z.string(), en: z.string() });
export const ExplainOutputSchema = z.object({
  found: z.boolean(),
  ruleId: z.string(),
  entry: z
    .object({
      ruleId: z.string(),
      source: z.enum(["en16931", "xrechnung"]),
      severity: z.enum(["error", "warning", "info"]),
      officialText: z.string(),
      syntaxes: z.array(z.enum(["ubl", "cii"])),
      test: z.record(z.string(), z.string()).optional(),
      bt: z.array(z.string()),
      curated: z.boolean(),
      explanation: LocalizedSchema,
      fixHint: LocalizedSchema,
      commonCauses: z.object({ de: z.array(z.string()), en: z.array(z.string()) }).optional(),
    })
    .optional(),
  suggestions: z.array(z.string()).optional(),
  disclaimer: z.string(),
});
export type ExplainOutput = z.infer<typeof ExplainOutputSchema>;

export function runExplain(input: z.infer<typeof ExplainInputSchema>): {
  output: ExplainOutput;
  text: string;
} {
  const r = explainRule(input.rule_id);
  const lang: Lang = input.lang;
  const L = lang === "de";
  if (!r.found) {
    const output: ExplainOutput = {
      found: false,
      ruleId: r.ruleId,
      suggestions: r.suggestions,
      disclaimer: DISCLAIMER[lang],
    };
    const text = `${L ? "Unbekannte Regel" : "Unknown rule"} ${r.ruleId}. ${L ? "Meinten Sie" : "Did you mean"}: ${r.suggestions.join(", ")}?`;
    return { output, text };
  }
  const e = r.entry;
  const output: ExplainOutput = {
    found: true,
    ruleId: e.ruleId,
    entry: { ...e, test: e.test as Record<string, string> },
    disclaimer: DISCLAIMER[lang],
  };
  const lines = [
    `${e.ruleId} (${e.source === "xrechnung" ? "XRechnung" : "EN 16931"}, ${L ? "Standard-Schweregrad" : "default severity"}: ${e.severity}${e.curated ? "" : L ? ", automatisch generiert" : ", auto-generated"})`,
    `${L ? "Offizieller Text" : "Official text"}: ${e.officialText}`,
    `${L ? "Erklärung" : "Explanation"}: ${e.explanation[lang]}`,
    `${L ? "Behebung" : "Fix"}: ${e.fixHint[lang]}`,
  ];
  if (e.bt.length) lines.push(`${L ? "Betroffene Felder" : "Related terms"}: ${e.bt.join(", ")}`);
  if (e.commonCauses)
    lines.push(`${L ? "Häufige Ursachen" : "Common causes"}: ${e.commonCauses[lang].join("; ")}`);
  lines.push(DISCLAIMER[lang]);
  return { output, text: lines.join("\n") };
}
