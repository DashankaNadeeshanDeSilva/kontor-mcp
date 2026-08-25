/**
 * ZUGFeRD 2.3 / Factur-X 1.0 profile matrix and PDF generation (Task 2.7, PRD T5 `zugferd-pdf`).
 * The profile is applied to a copy of the semantic model (guideline id + pruning of fields the
 * profile does not allow); the CII writer itself stays profile-agnostic (D-037).
 */
import type { PDFDocument } from "pdf-lib";
import type { Finding } from "../finding.js";
import type { InvoiceModel } from "../model/schema.js";
import type { Lang } from "../preview/html.js";
import { modelToCii } from "../serialize/cii.js";
import type { Fonts } from "./layout.js";
import { assemblePdfA3 } from "./pdfa3.js";
import { invoiceTitle, renderInvoicePages } from "./render.js";
import type { FacturXConformanceLevel } from "./xmp.js";

export const ZUGFERD_PROFILES = ["EN16931", "BASIC", "EXTENDED"] as const;
export type ZugferdProfile = (typeof ZUGFERD_PROFILES)[number];

export const EN16931_GUIDELINE_ID = "urn:cen.eu:en16931:2017";

export interface ProfileSpec {
  guidelineId: string;
  conformanceLevel: FacturXConformanceLevel;
  /** Value of `DetectedFormat.profile` our reader derives from the XMP — used for the round-trip check. */
  detectedProfile: "en16931" | "basic" | "extended";
  label: string;
  format: string;
}

export const ZUGFERD_PROFILE_SPECS: Record<ZugferdProfile, ProfileSpec> = {
  EN16931: {
    guidelineId: EN16931_GUIDELINE_ID,
    conformanceLevel: "EN 16931",
    detectedProfile: "en16931",
    label: "ZUGFeRD 2.3 / Factur-X EN 16931",
    format: "zugferd-2.3-en16931",
  },
  BASIC: {
    guidelineId: `${EN16931_GUIDELINE_ID}#compliant#urn:factur-x.eu:1p0:basic`,
    conformanceLevel: "BASIC",
    detectedProfile: "basic",
    label: "ZUGFeRD 2.3 / Factur-X BASIC",
    format: "zugferd-2.3-basic",
  },
  EXTENDED: {
    guidelineId: `${EN16931_GUIDELINE_ID}#conformant#urn:factur-x.eu:1p0:extended`,
    conformanceLevel: "EXTENDED",
    detectedProfile: "extended",
    label: "ZUGFeRD 2.3 / Factur-X EXTENDED",
    format: "zugferd-2.3-extended",
  },
};

interface Drop {
  bt: string;
  name: string;
  apply: (m: InvoiceModel) => boolean;
}

/** Business terms outside the Factur-X BASIC profile that our model can carry (Factur-X 1.0.07 profile tables). */
const BASIC_DROPS: Drop[] = [
  { bt: "BG-6", name: "seller contact", apply: (m) => del(m.seller, "contact") },
  { bt: "BG-9", name: "buyer contact", apply: (m) => del(m.buyer, "contact") },
  { bt: "BT-11", name: "project reference", apply: (m) => del(m, "projectReference") },
  {
    bt: "BT-15",
    name: "receiving advice reference",
    apply: (m) => del(m, "receivingAdviceReference"),
  },
  { bt: "BT-17", name: "tender or lot reference", apply: (m) => del(m, "tenderOrLotReference") },
  {
    bt: "BT-18",
    name: "invoiced object identifier",
    apply: (m) => del(m, "invoicedObjectIdentifier"),
  },
  {
    bt: "BG-24",
    name: "additional supporting documents",
    apply: (m) => del(m, "additionalDocuments"),
  },
  {
    bt: "BT-85",
    name: "payment account name",
    apply: (m) =>
      (m.paymentInstructions?.creditTransfers ?? [])
        .map((c) => del(c, "accountName"))
        .some(Boolean),
  },
  {
    bt: "BT-86",
    name: "payment service provider identifier (BIC)",
    apply: (m) =>
      (m.paymentInstructions?.creditTransfers ?? []).map((c) => del(c, "bic")).some(Boolean),
  },
  {
    bt: "BT-128",
    name: "line object identifier",
    apply: (m) => lines(m, (l) => del(l, "objectIdentifier")),
  },
  {
    bt: "BT-132",
    name: "order line reference",
    apply: (m) => lines(m, (l) => del(l, "orderLineReference")),
  },
  {
    bt: "BT-133",
    name: "line accounting reference",
    apply: (m) => lines(m, (l) => del(l, "accountingReference")),
  },
  {
    bt: "BT-154",
    name: "item description",
    apply: (m) => lines(m, (l) => del(l.item, "description")),
  },
  {
    bt: "BT-155",
    name: "item seller identifier",
    apply: (m) => lines(m, (l) => del(l.item, "sellerId")),
  },
  {
    bt: "BT-156",
    name: "item buyer identifier",
    apply: (m) => lines(m, (l) => del(l.item, "buyerId")),
  },
  {
    bt: "BT-158",
    name: "item classification",
    apply: (m) => lines(m, (l) => del(l.item, "classificationIds")),
  },
  {
    bt: "BT-159",
    name: "item origin country",
    apply: (m) => lines(m, (l) => del(l.item, "originCountry")),
  },
  {
    bt: "BG-32",
    name: "item attributes",
    apply: (m) => lines(m, (l) => del(l.item, "attributes")),
  },
];

function del<T extends object, K extends keyof T>(o: T | undefined, k: K): boolean {
  if (!o || o[k] === undefined) return false;
  delete o[k];
  return true;
}
function lines(m: InvoiceModel, f: (l: InvoiceModel["lines"][number]) => boolean): boolean {
  return m.lines.map(f).some(Boolean);
}

/** Copy of the model with the profile's guideline id and — for BASIC — unsupported terms removed (reported). */
export function applyZugferdProfile(
  source: InvoiceModel,
  profile: ZugferdProfile,
): { model: InvoiceModel; findings: Finding[] } {
  const model = structuredClone(source);
  model.specificationIdentifier = ZUGFERD_PROFILE_SPECS[profile].guidelineId;
  // BT-23 business process is XRechnung/Peppol-specific; Factur-X leaves it out.
  delete model.businessProcess;
  const findings: Finding[] = [];
  if (profile === "BASIC") {
    for (const d of BASIC_DROPS) {
      if (!d.apply(model)) continue;
      findings.push({
        ruleId: "KONTOR-GEN-PROFILE-DROPPED",
        severity: "warning",
        source: "generation",
        location: "/",
        bt: [d.bt],
        message: `${d.bt} (${d.name}) is not part of the Factur-X BASIC profile and was omitted from the XML.`,
        explanation: {
          de: `${d.bt} (${d.name}) ist im Factur-X-Profil BASIC nicht vorgesehen und wurde nicht in die XML übernommen. Die Angabe steht nur im sichtbaren PDF-Teil.`,
          en: `${d.bt} (${d.name}) is not defined in the Factur-X BASIC profile and was left out of the XML. The value appears only in the visual PDF part.`,
        },
        fixHint: {
          de: "Profil EN16931 wählen, wenn die Angabe maschinenlesbar sein muss.",
          en: "Choose profile EN16931 if the value must be machine-readable.",
        },
      });
    }
  }
  return { model, findings };
}

export interface ZugferdPdfOptions {
  profile: ZugferdProfile;
  lang: Lang;
  now: Date;
}

export interface ZugferdPdfResult {
  pdf: Uint8Array;
  xml: string;
  model: InvoiceModel;
  findings: Finding[];
  spec: ProfileSpec;
}

/** Semantic model → profile-specific CII → visual pages → PDF/A-3 with factur-x.xml. */
export async function generateZugferdPdf(
  source: InvoiceModel,
  o: ZugferdPdfOptions,
): Promise<ZugferdPdfResult> {
  const spec = ZUGFERD_PROFILE_SPECS[o.profile];
  const { model, findings } = applyZugferdProfile(source, o.profile);
  const xml = modelToCii(model);
  const pdf = await assemblePdfA3({
    xml,
    conformanceLevel: spec.conformanceLevel,
    title: invoiceTitle(model, o.lang),
    now: o.now,
    render: (doc: PDFDocument, fonts: Fonts) =>
      renderInvoicePages(doc, fonts, model, { lang: o.lang, formatLabel: spec.label }),
  });
  return { pdf, xml, model, findings, spec };
}
