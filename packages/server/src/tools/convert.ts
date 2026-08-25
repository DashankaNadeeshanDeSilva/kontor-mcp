import {
  type ConvertResult,
  convertInvoice,
  DetectedFormatSchema,
  enrichFinding,
} from "@kontor-mcp/core";
import { z } from "zod";
import {
  DocumentInputSchema,
  type Lang,
  LangSchema,
  resolveInput,
  resolveOutputPath,
  writeOutput,
} from "../input.js";
import { DISCLAIMER, toToolError } from "./shared.js";
import { FindingSchema } from "./validate.js";

export const ConvertInputSchema = DocumentInputSchema.extend({
  target: z
    .enum(["extract-xml", "xrechnung-ubl", "cii", "html-preview"])
    .describe(
      "extract-xml: bare XML out of a ZUGFeRD/Factur-X PDF · xrechnung-ubl: XRechnung 3.0 UBL via the semantic model · cii: UN/CEFACT CII (keeps the source's EN 16931 identifier) · html-preview: self-contained human-readable HTML",
    ),
  output_path: z
    .string()
    .optional()
    .describe(
      "Optional absolute path to write the artifact to (.xml for XML targets, .html for the preview); never overwrites unless overwrite=true.",
    ),
  overwrite: z.boolean().default(false),
  lang: LangSchema,
});

const LossEntrySchema = z.object({
  kind: z.enum(["dropped", "changed", "added", "profile"]),
  bt: z.string().optional(),
  path: z.string(),
  sourceValue: z.string().optional(),
  resultValue: z.string().optional(),
  message: z.object({ de: z.string(), en: z.string() }),
});

export const ConvertOutputSchema = z.object({
  target: z.enum(["extract-xml", "xrechnung-ubl", "cii", "html-preview"]),
  mimeType: z.enum(["application/xml", "text/html"]),
  artifact: z.string(),
  filenameHint: z.string(),
  sourceFormat: DetectedFormatSchema,
  valid: z.boolean().optional().describe("Post-conversion validation verdict (XML targets)"),
  findings: z.array(FindingSchema),
  lossReport: z.array(LossEntrySchema),
  writtenTo: z.string().optional(),
  disclaimer: z.string(),
});
export type ConvertOutput = z.infer<typeof ConvertOutputSchema>;

export async function runConvert(
  input: z.infer<typeof ConvertInputSchema>,
): Promise<{ output: ConvertOutput; text: string }> {
  const ext = input.target === "html-preview" ? [".html", ".htm"] : [".xml"];
  const target = input.output_path
    ? resolveOutputPath(input.output_path, ext, input.overwrite)
    : undefined;
  const { bytes } = resolveInput(input);
  let r: ConvertResult;
  try {
    r = await convertInvoice(bytes, { target: input.target, lang: input.lang });
  } catch (e) {
    throw toToolError(e);
  }
  const output: ConvertOutput = {
    target: r.target,
    mimeType: r.mimeType,
    artifact: r.artifact,
    filenameHint: r.filenameHint,
    sourceFormat: r.sourceFormat,
    findings: r.findings.map(enrichFinding) as ConvertOutput["findings"],
    lossReport: r.lossReport,
    disclaimer: DISCLAIMER[input.lang],
  };
  if (r.valid !== undefined) output.valid = r.valid;
  if (target) {
    writeOutput(target, r.artifact);
    output.writtenTo = target;
  }
  return { output, text: summarize(output, input.lang) };
}

function summarize(o: ConvertOutput, lang: Lang): string {
  const L = lang === "de";
  const src = [
    o.sourceFormat.container.toUpperCase(),
    o.sourceFormat.syntax?.toUpperCase(),
    o.sourceFormat.profile ? `Factur-X ${o.sourceFormat.profile.toUpperCase()}` : undefined,
    o.sourceFormat.cius === "xrechnung" ? `XRechnung ${o.sourceFormat.version ?? ""}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const lines = [
    `${L ? "Konvertiert" : "Converted"}: ${src} → ${o.target} (${o.mimeType}, ${o.artifact.length} ${L ? "Zeichen" : "chars"})`,
  ];
  if (o.valid !== undefined) {
    const errs = o.findings.filter((f) => f.severity === "error" || f.severity === "fatal");
    lines.push(
      `${L ? "Prüfung des Ergebnisses" : "Post-conversion validation"}: ${o.valid ? (L ? "GÜLTIG" : "VALID") : L ? "UNGÜLTIG" : "INVALID"} — ${errs.length} ${L ? "Fehler" : "errors"}`,
    );
    for (const f of errs.slice(0, 10))
      lines.push(`- [${f.severity}] ${f.ruleId}: ${f.explanation?.[lang] ?? f.message}`);
  }
  if (o.lossReport.length) {
    lines.push(`${L ? "Verlustbericht" : "Loss report"} (${o.lossReport.length}):`);
    for (const l of o.lossReport.slice(0, 15))
      lines.push(`- ${l.kind}${l.bt ? ` ${l.bt}` : ""}: ${l.message[lang]}`);
    if (o.lossReport.length > 15)
      lines.push(`… ${o.lossReport.length - 15} ${L ? "weitere" : "more"}`);
  } else if (o.target !== "extract-xml" && o.target !== "html-preview") {
    lines.push(
      L
        ? "Verlustbericht: keine Verluste — das semantische Modell blieb vollständig erhalten."
        : "Loss report: no loss — the semantic model survived completely.",
    );
  }
  if (o.writtenTo) lines.push(`${L ? "Gespeichert unter" : "Written to"}: ${o.writtenTo}`);
  if (o.target === "html-preview")
    lines.push(
      L
        ? "Die Vorschau ist eine eigenständige HTML-Datei ohne Skripte oder externe Ressourcen."
        : "The preview is a self-contained HTML file without scripts or external resources.",
    );
  lines.push(o.disclaimer);
  return lines.join("\n");
}
