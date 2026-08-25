import type { Finding } from "../finding.js";
import type { InvoiceModel } from "../model/schema.js";
import { parseInvoice } from "../parse/index.js";
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

export interface GenerateOptions extends ValidateOptions {
  /** Skip the internal validation (returns valid:false, plausible:false and no findings). */
  skipValidation?: boolean;
}

export interface GenerateResult {
  xml: string;
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

/** T5 generate_invoice: input → XRechnung 3.0 UBL, internally validated (fail-honest). */
export async function generateInvoice(
  raw: InvoiceInput,
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const parsed = InvoiceInputSchema.parse(raw);
  const { input, fixes } = applyAutoFixes(parsed);
  const xml = modelToUbl(inputToModel(input, deriveAmounts(input)));
  const model = parseInvoice(xml).invoice;
  if (options.skipValidation)
    return { xml, valid: false, plausible: false, findings: [], autoFixes: fixes, model };
  const { skipValidation: _s, ...validateOpts } = options;
  const r = await validateInvoice(xml, validateOpts);
  return {
    xml,
    valid: r.valid,
    plausible: !r.findings.some((f) => f.source === "plausibility" && isErrorLevel(f)),
    findings: r.findings,
    autoFixes: fixes,
    model,
  };
}
