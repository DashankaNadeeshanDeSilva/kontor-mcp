/**
 * Format detection (PRD §5.5 T1 `format`): container, syntax, standard, CIUS, ZUGFeRD/Factur-X profile.
 * Keys match the KoSIT scenario matchers (D-017) so the validation pipeline can reuse them.
 */
import { z } from "zod";
import { loadXml, type XmlDocument, XmlLoadError, type XmlLoadOptions } from "../xml/index.js";

export const DetectedFormatSchema = z.object({
  container: z.enum(["xml", "pdf"]),
  syntax: z.enum(["ubl-invoice", "ubl-creditnote", "cii"]).nullable(),
  standard: z.enum(["en16931", "unknown"]).nullable(),
  cius: z.enum(["xrechnung"]).nullable(),
  xrechnungVariant: z.enum(["base", "extension", "cvd"]).nullable(),
  /** XRechnung version from the customization ID, e.g. "3.0". */
  version: z.string().nullable(),
  profile: z.enum(["minimum", "basicwl", "basic", "en16931", "extended", "xrechnung"]).nullable(),
  /** UBL cbc:CustomizationID or CII GuidelineSpecifiedDocumentContextParameter/ram:ID, verbatim. */
  customizationId: z.string().nullable(),
  /** UBL cbc:ProfileID or CII BusinessProcessSpecifiedDocumentContextParameter/ram:ID, verbatim. */
  profileId: z.string().nullable(),
});
export type DetectedFormat = z.infer<typeof DetectedFormatSchema>;

export type DetectErrorCode = "KONTOR-DETECT-UNSUPPORTED" | "KONTOR-DETECT-NOT-XML";
export class DetectError extends Error {
  override readonly name = "DetectError";
  constructor(
    readonly code: DetectErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
  }
}

export type Container = "xml" | "pdf" | "unknown";

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

export function sniffContainer(bytes: Uint8Array): Container {
  if (bytes.length >= 5 && PDF_MAGIC.every((b, i) => bytes[i] === b)) return "pdf";
  let i = 0;
  // BOMs
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  else if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))
    i = 2;
  for (; i < Math.min(bytes.length, 1024); i++) {
    const b = bytes[i];
    if (b === 0x3c) return "xml";
    if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d || b === 0x00) continue;
    return "unknown";
  }
  return "unknown";
}

const NS_UBL_INVOICE = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
const NS_UBL_CREDITNOTE = "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2";
const NS_CII = "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100";

const EN16931_URN = "urn:cen.eu:en16931:2017";

/** Parse a CustomizationID / Guideline ID into standard / CIUS / profile facets. */
export function classifyCustomizationId(
  id: string | null,
): Pick<DetectedFormat, "standard" | "cius" | "xrechnungVariant" | "version" | "profile"> {
  const out: Pick<
    DetectedFormat,
    "standard" | "cius" | "xrechnungVariant" | "version" | "profile"
  > = {
    standard: null,
    cius: null,
    xrechnungVariant: null,
    version: null,
    profile: null,
  };
  if (!id) return out;
  const v = id.trim();
  out.standard = v.startsWith(EN16931_URN) ? "en16931" : "unknown";

  const xr = /urn:xeinkauf\.de:kosit:xrechnung_(\d+\.\d+)/.exec(v);
  if (xr) {
    out.cius = "xrechnung";
    out.version = xr[1] ?? null;
    if (/urn:xeinkauf\.de:kosit:extension:xrechnung_/.test(v)) out.xrechnungVariant = "extension";
    else if (/urn:xeinkauf\.de:kosit:xrechnung:cvd_/.test(v)) out.xrechnungVariant = "cvd";
    else out.xrechnungVariant = "base";
    return out;
  }
  // Factur-X / ZUGFeRD 2.x profile URNs
  const fx =
    /urn:(?:factur-x\.eu|zugferd\.de):(?:1p0|2p[0-9]):(minimum|basicwl|basic|extended)/.exec(v);
  if (fx) {
    out.profile = fx[1] as DetectedFormat["profile"];
    return out;
  }
  return out;
}

function detectXml(doc: XmlDocument): DetectedFormat {
  const { namespaceURI, localName } = doc.root;
  let syntax: DetectedFormat["syntax"];
  let customizationId: string | null;
  let profileId: string | null;
  if (namespaceURI === NS_UBL_INVOICE && localName === "Invoice") {
    syntax = "ubl-invoice";
    customizationId = doc.string("/ubl:Invoice/cbc:CustomizationID") || null;
    profileId = doc.string("/ubl:Invoice/cbc:ProfileID") || null;
  } else if (namespaceURI === NS_UBL_CREDITNOTE && localName === "CreditNote") {
    syntax = "ubl-creditnote";
    customizationId = doc.string("/cn:CreditNote/cbc:CustomizationID") || null;
    profileId = doc.string("/cn:CreditNote/cbc:ProfileID") || null;
  } else if (namespaceURI === NS_CII && localName === "CrossIndustryInvoice") {
    syntax = "cii";
    const ctx = "/rsm:CrossIndustryInvoice/rsm:ExchangedDocumentContext";
    customizationId =
      doc.string(`${ctx}/ram:GuidelineSpecifiedDocumentContextParameter/ram:ID`) || null;
    profileId =
      doc.string(`${ctx}/ram:BusinessProcessSpecifiedDocumentContextParameter/ram:ID`) || null;
  } else {
    throw new DetectError(
      "KONTOR-DETECT-UNSUPPORTED",
      `unsupported root element {${namespaceURI ?? ""}}${localName}; expected UBL Invoice/CreditNote or CII CrossIndustryInvoice`,
    );
  }
  const facets = classifyCustomizationId(customizationId);
  // Factur-X/ZUGFeRD "EN 16931" (Comfort) profile uses the bare EN URN; it is only a *profile* for CII.
  // The XRECHNUNG profile is asserted from the PDF's XMP (Task 1.2), not from the guideline ID.
  if (syntax === "cii" && customizationId?.trim() === EN16931_URN) facets.profile = "en16931";
  return { container: "xml", syntax, customizationId, profileId, ...facets };
}

/** Detect the format of raw bytes (XML or PDF). For PDF only the container is reported here (extraction: core/src/pdf). */
export function detectFormat(
  input: Uint8Array | string,
  options: XmlLoadOptions = {},
): DetectedFormat {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const container = sniffContainer(bytes);
  if (container === "pdf") {
    return {
      container: "pdf",
      syntax: null,
      standard: null,
      cius: null,
      xrechnungVariant: null,
      version: null,
      profile: null,
      customizationId: null,
      profileId: null,
    };
  }
  if (container === "unknown") {
    throw new DetectError("KONTOR-DETECT-NOT-XML", "input is neither XML nor PDF");
  }
  let doc: XmlDocument;
  try {
    doc = loadXml(bytes, options);
  } catch (e) {
    if (e instanceof XmlLoadError) throw e;
    throw e;
  }
  return detectXml(doc);
}

/** Detect from an already-loaded document (used by parse/validate to avoid double parsing). */
export function detectFormatFromDocument(doc: XmlDocument): DetectedFormat {
  return detectXml(doc);
}
