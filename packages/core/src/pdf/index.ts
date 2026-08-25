/**
 * ZUGFeRD / Factur-X PDF extraction (PRD §5.5 T1, NFR-5 "PDF hardening").
 * Embedded files are untrusted bytes: never executed, decompression capped, XML re-checked by the hardened loader.
 */
import { inflateSync } from "node:zlib";
import {
  decodePDFRawStream,
  EncryptedPDFError,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFStream,
  PDFString,
} from "pdf-lib";
import { type DetectedFormat, detectFormat, sniffContainer } from "../detect/index.js";
import { DEFAULT_MAX_BYTES, loadXml, type XmlLoadOptions } from "../xml/index.js";

export type PdfExtractErrorCode =
  | "KONTOR-PDF-NOT-PDF"
  | "KONTOR-PDF-ENCRYPTED"
  | "KONTOR-PDF-NO-ATTACHMENT"
  | "KONTOR-PDF-SIZE"
  | "KONTOR-PDF-DECOMPRESS-SIZE"
  | "KONTOR-PDF-MALFORMED";

export class PdfExtractError extends Error {
  override readonly name = "PdfExtractError";
  constructor(
    readonly code: PdfExtractErrorCode,
    message: string,
  ) {
    super(`${code}: ${message}`);
  }
}

export interface PdfExtractOptions {
  /** Max PDF size in bytes (default 20 MiB). */
  maxBytes?: number;
  /** Max decompressed size of a single embedded file (default 20 MiB). */
  maxXmlBytes?: number;
}

/** Standard ZUGFeRD / Factur-X / XRechnung attachment names, in preference order. */
export const STANDARD_ATTACHMENT_NAMES = [
  "factur-x.xml",
  "zugferd-invoice.xml",
  "xrechnung.xml",
] as const;

export interface PdfXmpInfo {
  /** e.g. "EN 16931", "BASIC WL", "XRECHNUNG" (verbatim from fx:ConformanceLevel). */
  conformanceLevel?: string;
  documentFileName?: string;
  documentType?: string;
  version?: string;
}

export interface ExtractedXml {
  xml: Uint8Array;
  filename: string;
  /** Names of all embedded files that looked like invoice XML, in document order. */
  candidates: string[];
  xmp?: PdfXmpInfo;
}

interface EmbeddedFile {
  name: string;
  stream: PDFRawStream;
}

function pdfText(v: unknown): string | undefined {
  if (v instanceof PDFString || v instanceof PDFHexString) return v.decodeText();
  return undefined;
}

/** Collect (name, stream) pairs from a file specification dictionary. */
function fileSpec(dict: PDFDict, out: EmbeddedFile[]): void {
  const name =
    pdfText(dict.lookup(PDFName.of("UF"))) ?? pdfText(dict.lookup(PDFName.of("F"))) ?? "";
  const ef = dict.lookupMaybe(PDFName.of("EF"), PDFDict);
  if (!ef) return;
  const stream =
    ef.lookupMaybe(PDFName.of("UF"), PDFStream) ?? ef.lookupMaybe(PDFName.of("F"), PDFStream);
  if (stream instanceof PDFRawStream && !out.some((e) => e.stream === stream))
    out.push({ name, stream });
}

/** Walk a name tree (/Names arrays + /Kids recursion). */
function walkNameTree(node: PDFDict, out: EmbeddedFile[], depth = 0): void {
  if (depth > 32) return;
  const names = node.lookupMaybe(PDFName.of("Names"), PDFArray);
  if (names) {
    for (let i = 1; i < names.size(); i += 2) {
      const spec = names.lookupMaybe(i, PDFDict);
      if (spec) fileSpec(spec, out);
    }
  }
  const kids = node.lookupMaybe(PDFName.of("Kids"), PDFArray);
  if (kids) {
    for (let i = 0; i < kids.size(); i++) {
      const kid = kids.lookupMaybe(i, PDFDict);
      if (kid) walkNameTree(kid, out, depth + 1);
    }
  }
}

function listEmbeddedFiles(doc: PDFDocument): EmbeddedFile[] {
  const out: EmbeddedFile[] = [];
  const names = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  const ef = names?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
  if (ef) walkNameTree(ef, out);
  const af = doc.catalog.lookupMaybe(PDFName.of("AF"), PDFArray);
  if (af) {
    for (let i = 0; i < af.size(); i++) {
      const spec = af.lookupMaybe(i, PDFDict);
      if (spec) fileSpec(spec, out);
    }
  }
  return out;
}

/** Decode a stream with a hard cap on the decompressed size. */
function decodeStream(stream: PDFRawStream, maxBytes: number): Uint8Array {
  const filter = stream.dict.lookup(PDFName.of("Filter"));
  const parms = stream.dict.lookup(PDFName.of("DecodeParms"));
  const raw = stream.contents;
  if (raw.byteLength > maxBytes)
    throw new PdfExtractError("KONTOR-PDF-DECOMPRESS-SIZE", "embedded file exceeds size cap");
  if (filter === undefined) return raw;
  if (filter === PDFName.of("FlateDecode") && !(parms instanceof PDFDict)) {
    try {
      return new Uint8Array(inflateSync(raw, { maxOutputLength: maxBytes }));
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "ERR_BUFFER_TOO_LARGE") {
        throw new PdfExtractError(
          "KONTOR-PDF-DECOMPRESS-SIZE",
          `embedded file inflates beyond ${maxBytes} bytes`,
        );
      }
      throw new PdfExtractError(
        "KONTOR-PDF-MALFORMED",
        `cannot inflate embedded file: ${(e as Error).message}`,
      );
    }
  }
  // Other filters: pdf-lib's decoders (raw already ≤ cap; non-Flate filters expand ≤ ~2×, RunLength ≤ 128×).
  let decoded: Uint8Array;
  try {
    decoded = decodePDFRawStream(stream).decode();
  } catch (e) {
    throw new PdfExtractError(
      "KONTOR-PDF-MALFORMED",
      `cannot decode embedded file: ${(e as Error).message}`,
    );
  }
  if (decoded.byteLength > maxBytes)
    throw new PdfExtractError("KONTOR-PDF-DECOMPRESS-SIZE", "embedded file exceeds size cap");
  return decoded;
}

const INVOICE_ROOT = /<(?:[\w-]+:)?(?:CrossIndustryInvoice|Invoice|CreditNote)[\s>]/;

function looksLikeInvoiceXml(bytes: Uint8Array): boolean {
  if (sniffContainer(bytes) !== "xml") return false;
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 4096));
  return INVOICE_ROOT.test(head);
}

const XMP_LOCAL_NAMES: Record<string, keyof PdfXmpInfo> = {
  ConformanceLevel: "conformanceLevel",
  DocumentFileName: "documentFileName",
  DocumentType: "documentType",
  Version: "version",
};

function readXmp(doc: PDFDocument, maxBytes: number): PdfXmpInfo | undefined {
  const meta = doc.catalog.lookupMaybe(PDFName.of("Metadata"), PDFStream);
  if (!(meta instanceof PDFRawStream)) return undefined;
  let text: string;
  try {
    text = new TextDecoder().decode(decodeStream(meta, maxBytes));
  } catch {
    return undefined;
  }
  // XMP packets may end with padding/trailer junk; take the packet only.
  const start = text.indexOf("<x:xmpmeta");
  const end = text.lastIndexOf("</x:xmpmeta>");
  if (start < 0 || end < 0) return undefined;
  let xmp: ReturnType<typeof loadXml>;
  try {
    xmp = loadXml(text.slice(start, end + "</x:xmpmeta>".length));
  } catch {
    return undefined;
  }
  const info: PdfXmpInfo = {};
  // Factur-X ns: urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#  · ZUGFeRD 1: urn:ferd:pdfa:CrossIndustryDocument:invoice:1p0#
  for (const node of xmp.nodes(
    "//*[starts-with(namespace-uri(), 'urn:factur-x:') or starts-with(namespace-uri(), 'urn:ferd:') or starts-with(namespace-uri(), 'urn:zugferd:')]",
  )) {
    const el = node as unknown as { localName: string; textContent: string | null };
    const key = XMP_LOCAL_NAMES[el.localName];
    if (key && el.textContent) info[key] = el.textContent.trim();
  }
  // Attribute form (rdf:Description fx:ConformanceLevel="...")
  for (const node of xmp.nodes(
    "//@*[starts-with(namespace-uri(), 'urn:factur-x:') or starts-with(namespace-uri(), 'urn:ferd:') or starts-with(namespace-uri(), 'urn:zugferd:')]",
  )) {
    const at = node as unknown as { localName: string; value: string };
    const key = XMP_LOCAL_NAMES[at.localName];
    if (key && !info[key]) info[key] = at.value.trim();
  }
  return Object.keys(info).length ? info : undefined;
}

export async function extractEmbeddedXml(
  bytes: Uint8Array,
  options: PdfExtractOptions = {},
): Promise<ExtractedXml> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxXmlBytes = options.maxXmlBytes ?? DEFAULT_MAX_BYTES;
  if (bytes.byteLength > maxBytes) {
    throw new PdfExtractError(
      "KONTOR-PDF-SIZE",
      `input is ${bytes.byteLength} bytes; limit is ${maxBytes}`,
    );
  }
  if (sniffContainer(bytes) !== "pdf")
    throw new PdfExtractError("KONTOR-PDF-NOT-PDF", "input is not a PDF (missing %PDF- header)");

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    // instanceof can fail across pdf-lib's CJS/ESM builds → also match the message.
    if (e instanceof EncryptedPDFError || /encrypted/i.test((e as Error).message))
      throw new PdfExtractError(
        "KONTOR-PDF-ENCRYPTED",
        "PDF is encrypted; decrypt it before processing",
      );
    throw new PdfExtractError("KONTOR-PDF-MALFORMED", `cannot parse PDF: ${(e as Error).message}`);
  }

  let files: EmbeddedFile[];
  try {
    files = listEmbeddedFiles(doc);
  } catch (e) {
    throw new PdfExtractError(
      "KONTOR-PDF-MALFORMED",
      `cannot read PDF catalog: ${(e as Error).message}`,
    );
  }
  if (files.length === 0) {
    throw new PdfExtractError(
      "KONTOR-PDF-NO-ATTACHMENT",
      "PDF has no embedded files — not a ZUGFeRD/Factur-X hybrid invoice",
    );
  }

  // 1) standard names, in preference order
  let chosen: EmbeddedFile | undefined;
  for (const std of STANDARD_ATTACHMENT_NAMES) {
    chosen = files.find((f) => f.name.toLowerCase() === std);
    if (chosen) break;
  }
  // 2) decode candidates lazily; fall back to the first one that looks like an invoice
  const decoded = new Map<EmbeddedFile, Uint8Array>();
  const get = (f: EmbeddedFile) => {
    let d = decoded.get(f);
    if (!d) {
      d = decodeStream(f.stream, maxXmlBytes);
      decoded.set(f, d);
    }
    return d;
  };
  const candidates: string[] = [];
  for (const f of files) {
    if (f === chosen || looksLikeInvoiceXml(get(f))) candidates.push(f.name);
  }
  if (!chosen) chosen = files.find((f) => candidates.includes(f.name));
  if (!chosen) {
    throw new PdfExtractError(
      "KONTOR-PDF-NO-ATTACHMENT",
      `none of the ${files.length} embedded file(s) is an invoice XML (${files.map((f) => f.name || "<unnamed>").join(", ")})`,
    );
  }
  const result: ExtractedXml = { xml: get(chosen), filename: chosen.name, candidates };
  const xmp = readXmp(doc, maxXmlBytes);
  if (xmp) result.xmp = xmp;
  return result;
}

/** Map XMP fx:ConformanceLevel to our profile enum. */
export function profileFromConformanceLevel(level: string | undefined): DetectedFormat["profile"] {
  switch (
    level
      ?.trim()
      .toUpperCase()
      .replace(/[\s_-]+/g, " ")
  ) {
    case "MINIMUM":
      return "minimum";
    case "BASIC WL":
      return "basicwl";
    case "BASIC":
      return "basic";
    case "EN 16931":
    case "COMFORT":
      return "en16931";
    case "EXTENDED":
      return "extended";
    case "XRECHNUNG":
      return "xrechnung";
    default:
      return null;
  }
}

export interface DetectedInvoicePdf extends ExtractedXml {
  format: DetectedFormat;
}

/** Extract the embedded XML and detect its format; the XMP conformance level is authoritative for the ZUGFeRD profile. */
export async function detectInvoicePdf(
  bytes: Uint8Array,
  options: PdfExtractOptions & XmlLoadOptions = {},
): Promise<DetectedInvoicePdf> {
  const extracted = await extractEmbeddedXml(bytes, options);
  const format = detectFormat(extracted.xml, options);
  format.container = "pdf";
  const xmpProfile = profileFromConformanceLevel(extracted.xmp?.conformanceLevel);
  if (xmpProfile) format.profile = xmpProfile;
  return { ...extracted, format };
}
