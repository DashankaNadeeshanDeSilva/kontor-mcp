/**
 * Hardened XML loader — the ONLY XML entry point in Kontor (PRD NFR-5).
 *
 * Guards run on the raw text before any parser sees it, so they also protect
 * downstream engines (Saxon-JS, xmllint-wasm) that re-parse the same text:
 *   - size cap                         → KONTOR-XML-SIZE
 *   - any DOCTYPE / DTD (XXE, billion laughs) → KONTOR-XML-DTD
 *   - element nesting depth            → KONTOR-XML-DEPTH
 *   - well-formedness (xmldom, fatal)  → KONTOR-XML-MALFORMED
 * No network, no file system, no entity resolution — ever.
 */
import { DOMParser, type Document, type Element } from "@xmldom/xmldom";
import xpath from "xpath";

export type XmlLoadErrorCode =
  | "KONTOR-XML-SIZE"
  | "KONTOR-XML-DTD"
  | "KONTOR-XML-DEPTH"
  | "KONTOR-XML-MALFORMED";

export class XmlLoadError extends Error {
  override readonly name = "XmlLoadError";
  constructor(
    readonly code: XmlLoadErrorCode,
    message: string,
    readonly line?: number,
    readonly column?: number,
  ) {
    super(`${code}: ${message}`);
  }
}

export interface XmlLoadOptions {
  /** Maximum accepted input size in bytes (default 20 MiB, PRD §5.4). */
  maxBytes?: number;
  /** Maximum element nesting depth (default 256). */
  maxDepth?: number;
}

export const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
export const DEFAULT_MAX_DEPTH = 256;

/** Namespace prefixes usable in every XPath evaluated through {@link XmlDocument}. */
export const XML_NAMESPACES: Readonly<Record<string, string>> = {
  ubl: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  cn: "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2",
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  rsm: "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
  ram: "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
  udt: "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
  qdt: "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
};

const select = xpath.useNamespaces({ ...XML_NAMESPACES });

/** A parsed, verified XML document plus namespace-aware XPath 1.0 helpers. */
export class XmlDocument {
  constructor(
    readonly dom: Document,
    readonly root: Element,
    /** Exact text that was parsed (BOM stripped) — hand this to Saxon-JS / xmllint. */
    readonly text: string,
  ) {}

  /** `string()` value of the first match, or "" when nothing matches. */
  string(expr: string, context: Node | Element = this.dom as unknown as Node): string {
    return String(select(`string(${expr})`, context as never, false));
  }

  /** All matching nodes (elements/attributes/text). */
  nodes(expr: string, context: Node | Element = this.dom as unknown as Node): Node[] {
    return select(expr, context as never, false) as unknown as Node[];
  }

  /** First matching element, or undefined. */
  element(expr: string, context?: Node | Element): Element | undefined {
    return this.nodes(expr, context)[0] as Element | undefined;
  }
}

const UTF8 = new TextDecoder("utf-8", { fatal: false });
const UTF16LE = new TextDecoder("utf-16le");
const UTF16BE = new TextDecoder("utf-16be");

/** Decode bytes → string honouring BOMs; strips the BOM. */
export function decodeXmlBytes(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return UTF8.decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe)
    return UTF16LE.decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff)
    return UTF16BE.decode(bytes.subarray(2));
  // BOM-less UTF-16 (first char '<' = 0x3C)
  if (bytes.length >= 2 && bytes[0] === 0x3c && bytes[1] === 0x00) return UTF16LE.decode(bytes);
  if (bytes.length >= 2 && bytes[0] === 0x00 && bytes[1] === 0x3c) return UTF16BE.decode(bytes);
  return UTF8.decode(bytes);
}

/** Cheap tag-depth scan; ignores comments/CDATA/PIs. Returns max depth or -1 if too deep. */
function scanDepth(text: string, maxDepth: number): number {
  let depth = 0;
  let max = 0;
  const n = text.length;
  let i = 0;
  while (i < n) {
    const lt = text.indexOf("<", i);
    if (lt < 0) break;
    const c = text.charCodeAt(lt + 1);
    if (c === 0x21 /* ! */) {
      if (text.startsWith("<![CDATA[", lt)) {
        const end = text.indexOf("]]>", lt);
        i = end < 0 ? n : end + 3;
      } else if (text.startsWith("<!--", lt)) {
        const end = text.indexOf("-->", lt);
        i = end < 0 ? n : end + 3;
      } else {
        i = lt + 2;
      }
      continue;
    }
    if (c === 0x3f /* ? */) {
      const end = text.indexOf("?>", lt);
      i = end < 0 ? n : end + 2;
      continue;
    }
    const gt = text.indexOf(">", lt);
    if (gt < 0) break;
    if (c === 0x2f /* / */) {
      depth--;
    } else if (text.charCodeAt(gt - 1) !== 0x2f) {
      depth++;
      if (depth > max) max = depth;
      if (max > maxDepth) return -1;
    }
    i = gt + 1;
  }
  return max;
}

export function loadXml(input: Uint8Array | string, options: XmlLoadOptions = {}): XmlDocument {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;

  const byteLength =
    typeof input === "string" ? Buffer.byteLength(input, "utf8") : input.byteLength;
  if (byteLength > maxBytes) {
    throw new XmlLoadError("KONTOR-XML-SIZE", `input is ${byteLength} bytes; limit is ${maxBytes}`);
  }
  let text = typeof input === "string" ? input : decodeXmlBytes(input);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  if (text.trim().length === 0) throw new XmlLoadError("KONTOR-XML-MALFORMED", "input is empty");
  if (/<!DOCTYPE/i.test(text)) {
    throw new XmlLoadError(
      "KONTOR-XML-DTD",
      "DOCTYPE/DTD declarations are not allowed (XXE / entity-expansion hardening)",
    );
  }
  if (scanDepth(text, maxDepth) < 0) {
    throw new XmlLoadError("KONTOR-XML-DEPTH", `element nesting exceeds ${maxDepth}`);
  }

  let firstError: { message: string; line?: number; column?: number } | undefined;
  const parser = new DOMParser({
    locator: true,
    onError(level, message, context) {
      if (level === "warning" || firstError) return;
      const loc = (
        context as { locator?: { lineNumber?: number; columnNumber?: number } } | undefined
      )?.locator;
      firstError = { message: message.split("\n")[0] ?? message };
      if (loc?.lineNumber !== undefined) firstError.line = loc.lineNumber;
      if (loc?.columnNumber !== undefined) firstError.column = loc.columnNumber;
      throw new XmlLoadError(
        "KONTOR-XML-MALFORMED",
        firstError.message,
        firstError.line,
        firstError.column,
      );
    },
  });
  let dom: Document;
  try {
    dom = parser.parseFromString(text, "text/xml");
  } catch (e) {
    if (e instanceof XmlLoadError) throw e;
    const loc = (e as { locator?: { lineNumber?: number; columnNumber?: number } }).locator;
    throw new XmlLoadError(
      "KONTOR-XML-MALFORMED",
      firstError?.message ?? (e as Error).message,
      firstError?.line ?? loc?.lineNumber,
      firstError?.column ?? loc?.columnNumber,
    );
  }
  if (firstError) {
    throw new XmlLoadError(
      "KONTOR-XML-MALFORMED",
      firstError.message,
      firstError.line,
      firstError.column,
    );
  }
  const root = dom.documentElement;
  if (!root) throw new XmlLoadError("KONTOR-XML-MALFORMED", "no root element");
  return new XmlDocument(dom, root, text);
}
