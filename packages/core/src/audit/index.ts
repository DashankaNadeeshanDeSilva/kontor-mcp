import { explainRule } from "@kontor-mcp/rules";
import type { Finding } from "../finding.js";
import type { InvoiceModel } from "../model/schema.js";
import { parseInvoice } from "../parse/index.js";
import {
  isErrorLevel,
  type ValidateOptions,
  type ValidationResult,
  validateInvoice,
} from "../validate/index.js";
import { loadXml, XmlDocument } from "../xml/index.js";
import type { AuditHeader, Recommendation, Verdict } from "./schema.js";

export * from "./schema.js";
export { renderAuditText } from "./text.js";

export const DISCLAIMER = {
  de: "Hinweis: Formale/technische Prüfung nach EN 16931 / XRechnung – keine steuerliche oder rechtliche Beratung.",
  en: "Note: formal/technical checks per EN 16931 / XRechnung – not tax or legal advice.",
} as const;

export interface AuditOptions extends ValidateOptions {
  /** Provenance of the XML when it was extracted from a PDF by the caller. */
  source?: { pdf?: { filename: string; conformanceLevel?: string | undefined } };
}

export interface AuditReport {
  header: AuditHeader;
  verdict: Verdict;
  recommendation: Recommendation;
  rationale: { de: string; en: string };
  findings: { structure: Finding[]; businessRules: Finding[]; plausibility: Finding[] };
  stats: { fatal: number; error: number; warning: number; info: number };
  layers: ValidationResult["layers"];
  timings: ValidationResult["timings"];
  disclaimer: { de: string; en: string };
}

const SEVERITY_ORDER = { fatal: 0, error: 1, warning: 2, info: 3 } as const;

/** Attach KB explanation / fix hint / BTs to official findings that lack them. */
export function enrichFinding(f: Finding): Finding {
  if (f.explanation) return f;
  const r = explainRule(f.ruleId);
  if (!r.found) return f;
  const out: Finding = { ...f, explanation: r.entry.explanation, fixHint: r.entry.fixHint };
  if (!out.bt && r.entry.bt.length) out.bt = r.entry.bt;
  return out;
}

function buildHeader(m: InvoiceModel, r: ValidationResult, opts: AuditOptions): AuditHeader {
  const party = (p: {
    name: string;
    vatId?: string | undefined;
    postalAddress?: { countryCode?: string | undefined } | undefined;
  }) => {
    const out: AuditHeader["seller"] = { name: p.name };
    if (p.vatId) out.vatId = p.vatId;
    if (p.postalAddress?.countryCode) out.countryCode = p.postalAddress.countryCode;
    return out;
  };
  const h: AuditHeader = {
    number: m.number,
    issueDate: m.issueDate,
    typeCode: m.typeCode,
    currency: m.currency,
    seller: party(m.seller),
    buyer: party(m.buyer),
    lineCount: m.lines.length,
    totals: {
      lineExtension: m.totals.lineExtension,
      taxExclusive: m.totals.taxExclusive,
      taxInclusive: m.totals.taxInclusive,
      payable: m.totals.payable,
    },
    taxBreakdown: m.vatBreakdown.map((b) => {
      const e: AuditHeader["taxBreakdown"][number] = {
        categoryCode: b.categoryCode,
        taxableAmount: b.taxableAmount,
        taxAmount: b.taxAmount,
      };
      if (b.rate !== undefined) e.rate = b.rate;
      if (b.exemptionReason) e.exemptionReason = b.exemptionReason;
      return e;
    }),
    format: r.format,
    scenario: r.scenario,
  };
  if (m.dueDate) h.dueDate = m.dueDate;
  if (m.buyerReference) h.buyerReference = m.buyerReference;
  if (m.totals.taxAmount !== undefined) h.totals.taxAmount = m.totals.taxAmount;
  if (m.paymentInstructions) {
    const p = m.paymentInstructions;
    h.payment = {
      meansCode: p.meansTypeCode,
      ibans: (p.creditTransfers ?? []).map((c) => c.account),
    };
    if (p.remittanceInfo) h.payment.remittanceInfo = p.remittanceInfo;
  }
  if (opts.source?.pdf) {
    const pdf: NonNullable<NonNullable<AuditHeader["source"]>["pdf"]> = {
      filename: opts.source.pdf.filename,
    };
    if (opts.source.pdf.conformanceLevel) pdf.conformanceLevel = opts.source.pdf.conformanceLevel;
    h.source = { pdf };
  }
  return h;
}

function decide(
  r: ValidationResult,
  groups: AuditReport["findings"],
  stats: AuditReport["stats"],
): Pick<AuditReport, "verdict" | "recommendation" | "rationale"> {
  const verdict: Verdict = !r.valid
    ? "invalid"
    : stats.error + stats.warning > 0
      ? "valid_with_warnings"
      : "valid";
  const list = (fs: Finding[]) => {
    const ids = [...new Set(fs.map((f) => f.ruleId))];
    return ids.slice(0, 3).join(", ") + (ids.length > 3 ? ` (+${ids.length - 3})` : "");
  };
  if (!r.valid) {
    const official = [...groups.structure, ...groups.businessRules].filter(isErrorLevel);
    const n = official.length;
    return {
      verdict,
      recommendation: "reject",
      rationale: {
        de: `Die Rechnung verstößt gegen ${n} verbindliche Regel${n === 1 ? "" : "n"} (${list(official)}) und würde vom KoSIT-Validator abgelehnt; sie darf so nicht verarbeitet werden.`,
        en: `The invoice violates ${n} mandatory rule${n === 1 ? "" : "s"} (${list(official)}) and would be rejected by the KoSIT validator; it must not be processed as is.`,
      },
    };
  }
  const plausErrors = groups.plausibility.filter(isErrorLevel);
  if (plausErrors.length) {
    const n = plausErrors.length;
    return {
      verdict,
      recommendation: "review",
      rationale: {
        de: `Formal gültig, aber ${n} Plausibilitätsfehler (${list(plausErrors)}) — vor Zahlung manuell prüfen bzw. beim Lieferanten klären.`,
        en: `Formally valid, but ${n} plausibility error${n === 1 ? "" : "s"} (${list(plausErrors)}) — review manually or clarify with the supplier before payment.`,
      },
    };
  }
  const w = stats.warning;
  return {
    verdict,
    recommendation: "accept",
    rationale: {
      de: w
        ? `Formal gültig und rechnerisch plausibel; ${w} Warnung${w === 1 ? "" : "en"} zur Kenntnis.`
        : "Formal gültig und rechnerisch plausibel; keine Auffälligkeiten.",
      en: w
        ? `Formally valid and arithmetically plausible; ${w} warning${w === 1 ? "" : "s"} to note.`
        : "Formally valid and arithmetically plausible; nothing to flag.",
    },
  };
}

/**
 * T3 audit_invoice: parse + validate (XSD, Schematron, plausibility) and turn the result into a
 * report an AP clerk can act on. Input is invoice XML (extract from PDF first, see detectInvoicePdf).
 */
export async function auditInvoice(
  input: Uint8Array | string | XmlDocument,
  options: AuditOptions = {},
): Promise<AuditReport> {
  const doc = input instanceof XmlDocument ? input : loadXml(input, options);
  const { source: _s, ...validateOpts } = options;
  const r = await validateInvoice(doc, validateOpts);
  const model = parseInvoice(doc).invoice;
  const bySeverity = (a: Finding, b: Finding) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  const enriched = r.findings.map(enrichFinding);
  const groups: AuditReport["findings"] = {
    structure: enriched.filter((f) => f.source === "xsd").sort(bySeverity),
    businessRules: enriched.filter((f) => f.source.startsWith("schematron")).sort(bySeverity),
    plausibility: enriched.filter((f) => f.source === "plausibility").sort(bySeverity),
  };
  const stats = { fatal: 0, error: 0, warning: 0, info: 0 };
  for (const f of enriched) stats[f.severity]++;
  return {
    header: buildHeader(model, r, options),
    ...decide(r, groups, stats),
    findings: groups,
    stats,
    layers: r.layers,
    timings: r.timings,
    disclaimer: DISCLAIMER,
  };
}
