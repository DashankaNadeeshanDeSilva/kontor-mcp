import {
  checkObligations,
  OBLIGATION_STATUS_LABEL,
  ObligationsInputSchema,
  type ObligationsReport,
} from "@kontor-mcp/core";
import { z } from "zod";
import { type Lang, LangSchema, ToolError } from "../input.js";

export const ObligationsToolInputSchema = ObligationsInputSchema.extend({ lang: LangSchema });

const LocalizedSchema = z.object({ de: z.string(), en: z.string() });
const SourceSchema = z.object({ title: z.string(), url: z.string(), quote: z.string().optional() });
export const ObligationsOutputSchema = z.object({
  asOf: z.string(),
  obligations: z.array(
    z.object({
      id: z.string(),
      status: z.enum([
        "required",
        "transitional",
        "conditional",
        "exempt",
        "not-required",
        "out-of-scope",
      ]),
      title: LocalizedSchema,
      rationale: LocalizedSchema,
      from: z.string().optional(),
      until: z.string().optional(),
      formats: z.array(z.string()).optional(),
      leitwegIdRequired: z.boolean().optional(),
      sources: z.array(SourceSchema),
    }),
  ),
  summary: z.string(),
  lastVerified: z
    .string()
    .describe("Date the embedded legal parameters were last verified against the primary sources"),
  verifiedBy: z.string(),
  disclaimer: z.string(),
});
export type ObligationsOutput = z.infer<typeof ObligationsOutputSchema>;

export function runObligations(input: z.infer<typeof ObligationsToolInputSchema>): {
  output: ObligationsOutput;
  text: string;
} {
  const { lang, ...rest } = input;
  let r: ObligationsReport;
  try {
    r = checkObligations(rest);
  } catch (e) {
    throw new ToolError(e instanceof Error ? e.message : String(e));
  }
  const output: ObligationsOutput = {
    asOf: r.asOf,
    obligations: r.obligations,
    summary: r.summary[lang],
    lastVerified: r.lastVerified,
    verifiedBy: r.verifiedBy,
    disclaimer: r.disclaimer[lang],
  };
  return { output, text: render(r, lang) };
}

function render(r: ObligationsReport, lang: Lang): string {
  const L = lang === "de";
  const lines = [
    `${L ? "E-Rechnungspflichten zum" : "E-invoicing obligations as of"} ${r.asOf} — ${L ? "Rolle" : "role"}: ${r.input.role}, ${L ? "Gegenüber" : "counterparty"}: ${r.input.counterparty}`,
  ];
  const sources = new Map<string, string>();
  for (const o of r.obligations) {
    lines.push(
      "",
      `${OBLIGATION_STATUS_LABEL[lang][o.status]} — ${o.title[lang]}${o.from ? ` (${L ? "ab" : "from"} ${o.from}${o.until ? ` ${L ? "bis" : "until"} ${o.until}` : ""})` : ""}`,
    );
    lines.push(o.rationale[lang]);
    if (o.formats?.length) lines.push(`${L ? "Formate" : "Formats"}: ${o.formats.join(" · ")}`);
    if (o.leitwegIdRequired)
      lines.push(
        L
          ? "Leitweg-ID des Auftraggebers in BT-10 (Buyer Reference) erforderlich."
          : "The buyer's Leitweg-ID is required in BT-10 (Buyer Reference).",
      );
    for (const s of o.sources) sources.set(s.url, s.title);
  }
  lines.push("", L ? "Quellen:" : "Sources:");
  for (const [url, title] of sources) lines.push(`- ${title} — ${url}`);
  lines.push(
    `${L ? "Rechtsstand geprüft am" : "Legal parameters verified on"} ${r.lastVerified} (${r.verifiedBy})`,
    r.disclaimer[lang],
  );
  return lines.join("\n");
}
