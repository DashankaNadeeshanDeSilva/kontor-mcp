import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadXml, XmlLoadError } from "../src/xml/index.js";

const fx = (name: string) => readFileSync(new URL(`../fixtures/detect/${name}`, import.meta.url));

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(XmlLoadError);
    expect((e as XmlLoadError).code).toBe(code);
    return e as XmlLoadError;
  }
  throw new Error(`expected XmlLoadError ${code}`);
}

describe("loadXml (hardened loader, NFR-5)", () => {
  it("parses a well-formed UBL document and exposes the root element", () => {
    const doc = loadXml(fx("ubl-invoice-en16931.xml"));
    expect(doc.root.localName).toBe("Invoice");
    expect(doc.root.namespaceURI).toBe("urn:oasis:names:specification:ubl:schema:xsd:Invoice-2");
  });

  it("strips a UTF-8 BOM", () => {
    expect(loadXml(fx("bom-utf8-ubl.xml")).root.localName).toBe("Invoice");
  });

  it("rejects an XXE attack fixture (external entity) without resolving anything", () => {
    const err = expectCode(() => loadXml(fx("attack-xxe.xml")), "KONTOR-XML-DTD");
    expect(err.message).not.toContain("root:");
  });

  it("rejects a billion-laughs fixture (internal entity expansion)", () => {
    expectCode(() => loadXml(fx("attack-billion-laughs.xml")), "KONTOR-XML-DTD");
  });

  it("rejects malformed XML with line/column", () => {
    const err = expectCode(() => loadXml(fx("malformed.xml")), "KONTOR-XML-MALFORMED");
    expect(err.line).toBeGreaterThan(0);
  });

  it("rejects input above the size cap", () => {
    expectCode(() => loadXml(fx("ubl-invoice-en16931.xml"), { maxBytes: 100 }), "KONTOR-XML-SIZE");
  });

  it("rejects nesting deeper than maxDepth", () => {
    const deep = `${"<a>".repeat(50)}x${"</a>".repeat(50)}`;
    expectCode(() => loadXml(deep, { maxDepth: 20 }), "KONTOR-XML-DEPTH");
    expect(loadXml(deep, { maxDepth: 60 }).root.localName).toBe("a");
  });

  it("rejects empty and non-XML input", () => {
    expectCode(() => loadXml(""), "KONTOR-XML-MALFORMED");
    expectCode(() => loadXml(fx("garbage.bin")), "KONTOR-XML-MALFORMED");
  });

  it("evaluates namespaced XPath (string) against the document", () => {
    const doc = loadXml(fx("ubl-invoice-en16931.xml"));
    expect(doc.string("/ubl:Invoice/cbc:CustomizationID")).toBe("urn:cen.eu:en16931:2017");
    expect(doc.string("/ubl:Invoice/cbc:Missing")).toBe("");
  });
});
