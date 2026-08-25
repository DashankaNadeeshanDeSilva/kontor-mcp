import type { Finding } from "../finding.js";
import type { InvoiceModel } from "../model/schema.js";
import { parseInvoice } from "../parse/index.js";
import { detectInvoicePdf } from "../pdf/index.js";
import {
  EN16931_GUIDELINE_ID,
  generateZugferdPdf,
  ZUGFERD_PROFILES,
  type ZugferdProfile,
} from "../pdf/zugferd.js";
import type { Lang } from "../preview/html.js";
import { modelToUbl } from "../serialize/ubl.js";
import { isErrorLevel, type ValidateOptions, validateInvoice } from "../validate/index.js";
import { deriveAmounts } from "./derive.js";
import { type InvoiceInput, type InvoiceInputParsed, InvoiceInputSchema } from "./input.js";
import { inputToModel } from "./model.js";

export { deriveAmounts } from "./derive.js";
export * from "./input.js";
export { inputToModel, PEPPOL_BILLING_PROFILE_ID, XRECHNUNG_CUSTOMIZATION_ID } from "./model.js";

export interface AutoFix {
  code:
    | "LEITWEG-TRIMMED"
    | "VATID-NORMALISED"
    | "IBAN-NORMALISED"
    | "BIC-NORMALISED"
    | "VAT-CATEGORY-S0-TO-Z";
  description: string;
}

export type GenerateTarget = "xrechnung-ubl" | "zugferd-pdf";

export interface GenerateOptions extends ValidateOptions {
  /** Skip the internal validation (returns valid:false, plausible:false and no findings). */
  skipValidation?: boolean;
  /** Output format (default XRechnung 3.0 UBL). */
  target?: GenerateTarget;
  /** ZUGFeRD / Factur-X profile for `zugferd-pdf` (default EN16931). */
  zugferdProfile?: ZugferdProfile;
  /** Language of the visual PDF part (default de). */
  lang?: Lang;
  /** Creation instant written to the PDF (default: current time). Fixed → byte-identical output. */
  now?: Date;
}

export interface GenerateResult {
  /** XRechnung UBL, or — for `zugferd-pdf` — the CII embedded in the PDF. */
  xml: string;
  /** e.g. "xrechnung-3.0-ubl", "zugferd-2.3-en16931". */
  format: string;
  /** ZUGFeRD profile (only for `zugferd-pdf`). */
  profile?: ZugferdProfile;
  /** The PDF/A-3 bytes (only for `zugferd-pdf`). */
  pdf?: Uint8Array;
  /** Official verdict of the internal validation (XSD + EN 16931 + XRechnung). Never assumed. */
  valid: boolean;
  /** No error-level KONTOR-PLAUS-* findings. */
  plausible: boolean;
  findings: Finding[];
  autoFixes: AutoFix[];
  model: InvoiceModel;
}

/**
 * Deterministic auto-fix pre-pass: repairs only what is unambiguous and meaning-preserving
 * (whitespace in identifiers, S with 0 % → Z). Anything else stays as given and is reported by
 * validation (fail-honest, PRD D5).
 */
export function applyAutoFixes(input: InvoiceInputParsed): {
  input: InvoiceInputParsed;
  fixes: AutoFix[];
} {
  const fixes: AutoFix[] = [];
  const out: InvoiceInputParsed = structuredClone(input);

  const normId = (v: string) => v.replace(/[\s.\-/]/g, "").toUpperCase();
  for (const party of ["seller", "buyer"] as const) {
    const v = out[party].vatId;
    if (v && normId(v) !== v) {
      out[party].vatId = normId(v);
      fixes.push({
        code: "VATID-NORMALISED",
        description: `Normalised the ${party} VAT ID "${v}" to "${normId(v)}".`,
      });
    }
  }
  if (out.payment) {
    const iban = out.payment.iban.replace(/\s+/g, "").toUpperCase();
    if (iban !== out.payment.iban) {
      out.payment.iban = iban;
      fixes.push({ code: "IBAN-NORMALISED", description: "Removed spaces from the IBAN (BT-84)." });
    }
    if (out.payment.bic) {
      const bic = out.payment.bic.replace(/\s+/g, "").toUpperCase();
      if (bic !== out.payment.bic) {
        out.payment.bic = bic;
        fixes.push({
          code: "BIC-NORMALISED",
          description: "Normalised the BIC (BT-86) to upper case without spaces.",
        });
      }
    }
  }
  out.lines.forEach((l, i) => {
    if (l.vatCategory === "S" && l.vatRate !== undefined && Number(l.vatRate) === 0) {
      l.vatCategory = "Z";
      fixes.push({
        code: "VAT-CATEGORY-S0-TO-Z",
        description: `Line ${i + 1}: category S with 0 % is not allowed (BR-S-05); changed to Z (zero rated).`,
      });
    }
  });
  return { input: out, fixes };
}

/** T5 generate_invoice: input → XRechnung 3.0 UBL or ZUGFeRD PDF/A-3, internally validated (fail-honest). */
export async function generateInvoice(
  raw: InvoiceInput,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const parsed = InvoiceInputSchema.parse(raw);
  const { input, fixes } = applyAutoFixes(parsed);
  const source = inputToModel(input, deriveAmounts(input));
  const {
    skipValidation,
    target = "xrechnung-ubl",
    zugferdProfile = "EN16931",
    lang = "de",
    now = new Date(),
    ...validateOpts
  } = options;
  if (target === "zugferd-pdf") {
    if (!ZUGFERD_PROFILES.includes(zugferdProfile))
      throw new Error(
        `Unknown ZUGFeRD profile "${zugferdProfile}" (expected ${ZUGFERD_PROFILES.join(" | ")}).`,
      );
    return generateZugferd(source, {
      zugferdProfile,
      lang,
      now,
      skipValidation,
      fixes,
      validateOpts,
    });
  }
  const xml = modelToUbl(source);
  const model = parseInvoice(xml).invoice;
  const format = "xrechnung-3.0-ubl";
  if (skipValidation)
    return { xml, format, valid: false, plausible: false, findings: [], autoFixes: fixes, model };
  const r = await validateInvoice(xml, validateOpts);
  return {
    xml,
    format,
    valid: r.valid,
    plausible: isPlausible(r.findings),
    findings: r.findings,
    autoFixes: fixes,
    model,
  };
}

const isPlausible = (findings: Finding[]) =>
  !findings.some((f) => f.source === "plausibility" && isErrorLevel(f));

async function generateZugferd(
  source: InvoiceModel,
  o: {
    zugferdProfile: ZugferdProfile;
    lang: Lang;
    now: Date;
    skipValidation: boolean | undefined;
    fixes: AutoFix[];
    validateOpts: ValidateOptions;
  },
): Promise<GenerateResult> {
  const g = await generateZugferdPdf(source, {
    profile: o.zugferdProfile,
    lang: o.lang,
    now: o.now,
  });
  const base = {
    xml: g.xml,
    format: g.spec.format,
    profile: o.zugferdProfile,
    pdf: g.pdf,
    autoFixes: o.fixes,
    model: parseInvoice(g.xml).invoice,
  };
  if (o.skipValidation) return { ...base, valid: false, plausible: false, findings: g.findings };

  // Fail-honest: validate what a receiver will actually extract from the PDF, not the XML we intended to embed.
  const findings: Finding[] = [...g.findings];
  let containerOk = true;
  try {
    const d = await detectInvoicePdf(g.pdf);
    if (Buffer.from(d.xml).toString("utf8") !== g.xml || d.filename !== "factur-x.xml") {
      containerOk = false;
      findings.push(
        generationError(
          "KONTOR-PDF-ATTACHMENT-MISMATCH",
          "The XML extracted from the generated PDF differs from the XML that was embedded.",
        ),
      );
    }
    if (
      d.xmp?.conformanceLevel !== g.spec.conformanceLevel ||
      d.format.profile !== g.spec.detectedProfile
    ) {
      containerOk = false;
      findings.push(
        generationError(
          "KONTOR-PDF-XMP-MISMATCH",
          `XMP fx:ConformanceLevel "${d.xmp?.conformanceLevel ?? ""}" does not match the requested profile ${o.zugferdProfile}.`,
        ),
      );
    }
  } catch (e) {
    containerOk = false;
    findings.push(
      generationError(
        "KONTOR-PDF-ROUNDTRIP",
        `The generated PDF could not be read back: ${e instanceof Error ? e.message : String(e)}`,
      ),
    );
  }
  // All Factur-X profiles are validated against the EN 16931 CII rules (BASIC is a subset; EXTENDED a superset —
  // no EXTENDED-specific rule set is bundled, which the info finding states).
  const r = await validateInvoice(g.xml, {
    ...o.validateOpts,
    customizationIdOverride: EN16931_GUIDELINE_ID,
  });
  if (o.zugferdProfile === "EXTENDED")
    findings.push({
      ruleId: "KONTOR-PDF-PROFILE-UNCHECKED",
      severity: "info",
      source: "generation",
      location: "/",
      message:
        "Profile EXTENDED: only the EN 16931 core rules were applied; no EXTENDED-specific Schematron is bundled.",
      explanation: {
        de: "Für das Profil EXTENDED wurden nur die EN-16931-Kernregeln geprüft; ein EXTENDED-spezifisches Regelwerk ist nicht gebündelt. Die erzeugte Datei nutzt ausschließlich EN-16931-Elemente.",
        en: "For profile EXTENDED only the EN 16931 core rules were checked; no EXTENDED-specific rule set is bundled. The generated file uses EN 16931 elements only.",
      },
    });
  findings.push(...r.findings);
  return {
    ...base,
    valid: r.valid && containerOk,
    plausible: isPlausible(r.findings),
    findings,
  };
}

function generationError(ruleId: string, message: string): Finding {
  return { ruleId, severity: "error", source: "generation", location: "/", message };
}
