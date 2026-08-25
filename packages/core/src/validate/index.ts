/**
 * validateInvoice — PRD §5.2 pipeline: Layer 1 XSD (xmllint-wasm) → Layer 2 Schematron (Saxon-JS, KoSIT scenarios)
 * → merged Finding[] with the KoSIT verdict rule (reject iff any error-level finding). Layer 3 arrives in Task 2.1.
 */
import type { Scenario } from "@kontor-mcp/rules";
import { loadScenarios, loadSef, loadXsdSet } from "@kontor-mcp/rules";
import { type DetectedFormat, detectFormatFromDocument } from "../detect/index.js";
import type { Finding } from "../finding.js";
import { parseInvoice } from "../parse/index.js";
import { type PlausibilityOptions, runPlausibility } from "../plausibility/index.js";
import { loadXml, XmlDocument, type XmlLoadOptions } from "../xml/index.js";
import { selectScenario } from "./scenario.js";
import { runStylesheet } from "./schematron.js";
import { validateXsd } from "./xsd.js";

export type ValidationLayer = "xsd" | "schematron" | "plausibility";
export type LayerStatus = "pass" | "fail" | "skipped";

export interface ValidateOptions extends XmlLoadOptions {
  skipLayers?: ValidationLayer[];
  /** Force a scenario by CustomizationID / guideline ID (PRD T2 `profile_override`). */
  customizationIdOverride?: string;
  /** Options for the Layer-3 plausibility checks (KONTOR-PLAUS-*). */
  plausibility?: PlausibilityOptions;
}

export interface ValidationResult {
  format: DetectedFormat;
  /** Name of the KoSIT scenario applied, or null when none matched. */
  scenario: string | null;
  valid: boolean;
  findings: Finding[];
  layers: Record<ValidationLayer, LayerStatus>;
  /** Milliseconds per layer. */
  timings: Partial<Record<ValidationLayer, number>>;
}

export const isErrorLevel = (f: Finding): boolean =>
  f.severity === "error" || f.severity === "fatal";

export async function validateInvoice(
  input: Uint8Array | string | XmlDocument,
  options: ValidateOptions = {},
): Promise<ValidationResult> {
  const doc = input instanceof XmlDocument ? input : loadXml(input, options);
  const format = detectFormatFromDocument(doc);
  const skip = new Set(options.skipLayers ?? []);
  const scenario: Scenario | undefined = selectScenario(format, options.customizationIdOverride);
  const findings: Finding[] = [];
  const layers: ValidationResult["layers"] = {
    xsd: "skipped",
    schematron: "skipped",
    plausibility: "skipped",
  };
  const timings: ValidationResult["timings"] = {};

  if (!scenario) {
    findings.push({
      ruleId: "KONTOR-SCENARIO-NONE",
      severity: "info",
      source: "plausibility",
      message: `No KoSIT validation scenario matches ${format.syntax ?? "this document"} with customization ID "${format.customizationId ?? ""}"; only XML Schema validation was performed. Business rules (EN 16931 / XRechnung) are available for EN 16931 and XRechnung 3.0 documents.`,
    });
  }

  // Layer 1 — XSD
  if (!skip.has("xsd") && format.syntax) {
    const t0 = performance.now();
    const xsd = await validateXsd(doc.text, format.syntax);
    timings.xsd = Math.round(performance.now() - t0);
    findings.push(...xsd);
    layers.xsd = xsd.length ? "fail" : "pass";
  }

  // Layer 2 — Schematron (KoSIT skips it when the schema step failed)
  if (!skip.has("schematron") && scenario && layers.xsd !== "fail") {
    const t0 = performance.now();
    for (const sheet of scenario.schematron)
      findings.push(...(await runStylesheet(doc.text, sheet, scenario)));
    timings.schematron = Math.round(performance.now() - t0);
    layers.schematron = findings.some((f) => f.source.startsWith("schematron") && isErrorLevel(f))
      ? "fail"
      : "pass";
  }

  // Layer 3 — plausibility on the semantic model (never changes the official verdict)
  if (!skip.has("plausibility") && format.syntax && layers.xsd !== "fail") {
    const t0 = performance.now();
    const plaus = runPlausibility(parseInvoice(doc).invoice, options.plausibility);
    timings.plausibility = Math.round(performance.now() - t0);
    findings.push(...plaus);
    layers.plausibility = plaus.some(isErrorLevel) ? "fail" : "pass";
  }

  return {
    format,
    scenario: scenario?.name ?? null,
    valid: !findings.some((f) => f.source !== "plausibility" && isErrorLevel(f)),
    findings,
    layers,
    timings,
  };
}

/** Pre-load SEFs and XSDs so the first tool call is fast (NFR-3). */
export function warmUp(): void {
  for (const s of loadScenarios()) {
    loadXsdSet(s.syntax);
    for (const sheet of s.schematron) loadSef(sheet);
  }
}
