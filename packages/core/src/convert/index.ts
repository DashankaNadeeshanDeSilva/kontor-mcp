import { type DetectedFormat, detectFormat, sniffContainer } from "../detect/index.js";
import type { Finding } from "../finding.js";
import type { InvoiceModel } from "../model/schema.js";
import { parseInvoice } from "../parse/index.js";
import { detectInvoicePdf } from "../pdf/index.js";
import { renderHtmlPreview } from "../preview/html.js";
import { modelToCii } from "../serialize/cii.js";
import { modelToUbl } from "../serialize/ubl.js";
import { type ValidateOptions, validateInvoice } from "../validate/index.js";
import { loadXml } from "../xml/index.js";
import { diffModels, type LossEntry } from "./loss.js";

export { btForPath, diffModels, type LossEntry } from "./loss.js";

export const XRECHNUNG_UBL_CUSTOMIZATION_ID =
  "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0";
export const PEPPOL_BILLING_PROCESS_ID = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

export type ConvertTarget = "extract-xml" | "xrechnung-ubl" | "cii" | "html-preview";

export interface ConvertOptions extends ValidateOptions {
  target: ConvertTarget;
  lang?: "de" | "en";
}

export interface ConvertResult {
  target: ConvertTarget;
  mimeType: "application/xml" | "text/html";
  artifact: string;
  sourceFormat: DetectedFormat;
  /** Official verdict of the post-conversion validation (XML targets only). */
  valid?: boolean;
  findings: Finding[];
  lossReport: LossEntry[];
  /** Suggested filename for the artifact. */
  filenameHint: string;
}

const PROFILE_LOSS: Record<string, { de: string; en: string }> = {
  extended: {
    de: "Die Quelle nutzt das Profil EXTENDED (Factur-X/ZUGFeRD). Elemente außerhalb des EN-16931-Kernmodells (z. B. zusätzliche Referenzen, Logistikdaten, Positionsdetails) werden vom semantischen Modell nicht übernommen.",
    en: "The source uses the EXTENDED profile (Factur-X/ZUGFeRD). Elements outside the EN 16931 core model (e.g. extra references, logistics data, line details) are not carried by the semantic model.",
  },
  extension: {
    de: "Die Quelle nutzt die XRechnung-Extension. Elemente der Extension (BR-DEX) werden vom Kernmodell nicht übernommen.",
    en: "The source uses the XRechnung extension. Extension elements (BR-DEX) are not carried by the core model.",
  },
};

/** T6 convert_invoice: XML or ZUGFeRD PDF bytes → target artifact with post-validation and loss report. */
export async function convertInvoice(
  input: Uint8Array | string,
  options: ConvertOptions,
): Promise<ConvertResult> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let xml: Uint8Array;
  let sourceFormat: DetectedFormat;
  if (sniffContainer(bytes) === "pdf") {
    const d = await detectInvoicePdf(bytes);
    xml = d.xml;
    sourceFormat = d.format;
  } else {
    xml = bytes;
    sourceFormat = detectFormat(bytes);
  }
  const lang = options.lang ?? "de";
  const { target, lang: _l, ...validateOpts } = options;

  if (target === "extract-xml") {
    return {
      target,
      mimeType: "application/xml",
      artifact: loadXml(xml, validateOpts).text,
      sourceFormat,
      findings: [],
      lossReport: [],
      filenameHint: "invoice.xml",
    };
  }

  const doc = loadXml(xml, validateOpts);
  const parsed = parseInvoice(doc);
  const source = parsed.invoice;

  if (target === "html-preview") {
    return {
      target,
      mimeType: "text/html",
      artifact: renderHtmlPreview(source, { lang, format: sourceFormat }),
      sourceFormat,
      findings: parsed.warnings,
      lossReport: [],
      filenameHint: `${safeName(source.number)}.html`,
    };
  }

  const model: InvoiceModel = structuredClone(source);
  if (target === "xrechnung-ubl") {
    model.specificationIdentifier = XRECHNUNG_UBL_CUSTOMIZATION_ID;
    model.businessProcess ??= PEPPOL_BILLING_PROCESS_ID;
  }
  const artifact = target === "cii" ? modelToCii(model) : modelToUbl(model);
  const lossReport = diffModels(source, parseInvoice(artifact).invoice);
  const profile =
    sourceFormat.profile === "extended"
      ? "extended"
      : sourceFormat.xrechnungVariant === "extension"
        ? "extension"
        : undefined;
  if (profile)
    lossReport.unshift({
      kind: "profile",
      path: "/",
      message: PROFILE_LOSS[profile] as { de: string; en: string },
    });

  const v = await validateInvoice(artifact, validateOpts);
  return {
    target,
    mimeType: "application/xml",
    artifact,
    sourceFormat,
    valid: v.valid,
    findings: [...parsed.warnings, ...v.findings],
    lossReport,
    filenameHint: `${safeName(source.number)}-${target === "cii" ? "cii" : "xrechnung-ubl"}.xml`,
  };
}

const safeName = (s: string) => s.replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 60) || "invoice";
