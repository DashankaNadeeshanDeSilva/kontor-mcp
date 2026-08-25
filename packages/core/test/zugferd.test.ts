import { fileURLToPath } from "node:url";
import { decodePDFRawStream, PDFDocument, PDFName, type PDFRawStream, PDFStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  detectInvoicePdf,
  generateInvoice,
  type InvoiceInput,
  isErrorLevel,
  parseInvoice,
  validateInvoice,
} from "../src/index.js";
import { REFERENCE } from "./fixtures/reference-input.js";

const golden = (name: string) => fileURLToPath(new URL(`./golden/${name}`, import.meta.url));
const TODAY = new Date("2026-08-26T00:00:00Z");
const NOW = new Date("2026-08-25T10:00:00Z");
const opts = { plausibility: { today: TODAY }, now: NOW } as const;
function pdfOf(r: { pdf?: Uint8Array }): Uint8Array {
  if (!r.pdf) throw new Error("no pdf in result");
  return r.pdf;
}
const errorIds = (fs: { ruleId: string; severity: string }[]) =>
  fs.filter((f) => isErrorLevel(f as never)).map((f) => f.ruleId);

/** Structural facts about a generated PDF, read back with pdf-lib low-level objects. */
async function inspect(pdf: Uint8Array) {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const cat = doc.catalog;
  const meta = cat.lookup(PDFName.of("Metadata"), PDFStream) as PDFRawStream;
  const xmp = Buffer.from(decodePDFRawStream(meta).decode()).toString("utf8");
  const intents = cat.lookup(PDFName.of("OutputIntents"));
  const af = cat.lookup(PDFName.of("AF"));
  const text = Buffer.from(pdf).toString("latin1");
  return {
    pages: doc.getPageCount(),
    xmp,
    hasOutputIntent: intents !== undefined,
    hasAf: af !== undefined,
    title: doc.getTitle(),
    producer: doc.getProducer(),
    creator: doc.getCreator(),
    afRelationshipAlternative: /\/AFRelationship\s*\/Alternative/.test(text),
    embeddedFile: /\/F\s*\(factur-x\.xml\)/.test(text),
    mime: /\/Subtype\s*\/text#2Fxml/.test(text),
    hasEmbeddedFilesTree: /\/EmbeddedFiles/.test(text),
    fontsEmbedded: /\/FontFile2/.test(text),
    hasId: /\/ID\s*\[\s*</.test(text),
  };
}

describe("generateInvoice target zugferd-pdf (Task 2.7) — EN 16931 profile", () => {
  it("returns a valid PDF/A-3 with factur-x.xml and the embedded CII as golden", async () => {
    const r = await generateInvoice(REFERENCE, { target: "zugferd-pdf", ...opts });
    expect(r.format).toBe("zugferd-2.3-en16931");
    expect(r.profile).toBe("EN16931");
    expect(errorIds(r.findings)).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.pdf).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(pdfOf(r).subarray(0, 5)).toString()).toBe("%PDF-");
    expect(r.xml).toContain("<ram:ID>urn:cen.eu:en16931:2017</ram:ID>");
    expect(r.xml).toContain("CrossIndustryInvoice");
    await expect(r.xml).toMatchFileSnapshot(golden("generated-zugferd-en16931.xml"));
    expect(r.model.totals.payable).toBe("1534.99");
  });

  it("has the PDF/A-3 structure: OutputIntent, XMP with pdfaid + Factur-X schema, AF, embedded font, /ID", async () => {
    const r = await generateInvoice(REFERENCE, { target: "zugferd-pdf", ...opts });
    const s = await inspect(pdfOf(r));
    expect(s).toMatchObject({
      pages: 1,
      hasOutputIntent: true,
      hasAf: true,
      afRelationshipAlternative: true,
      embeddedFile: true,
      mime: true,
      hasEmbeddedFilesTree: true,
      fontsEmbedded: true,
      hasId: true,
      creator: "Kontor MCP",
    });
    expect(s.title).toBe("Rechnung RE-2026-0815");
    expect(s.xmp).toContain("<pdfaid:part>3</pdfaid:part>");
    expect(s.xmp).toContain("<pdfaid:conformance>B</pdfaid:conformance>");
    expect(s.xmp).toContain("urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#");
    expect(s.xmp).toContain("<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>");
    expect(s.xmp).toContain("<fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>");
    expect(s.xmp).toContain("<fx:DocumentType>INVOICE</fx:DocumentType>");
    expect(s.xmp).toContain("<fx:Version>1.0</fx:Version>");
    expect(s.xmp).toContain(
      '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">Rechnung RE-2026-0815</rdf:li>',
    );
    expect(s.xmp).toContain("<xmp:CreateDate>2026-08-25T10:00:00Z</xmp:CreateDate>");
    expect(s.xmp).toContain("<xmp:CreatorTool>Kontor MCP</xmp:CreatorTool>");
    expect(s.xmp).toContain("<pdf:Producer>Kontor MCP");
    expect(s.producer).toBe(s.xmp.match(/<pdf:Producer>([^<]*)</)?.[1]);
  });

  it("round-trips: detectInvoicePdf + full validation of the extracted XML", async () => {
    const r = await generateInvoice(REFERENCE, { target: "zugferd-pdf", ...opts });
    const d = await detectInvoicePdf(pdfOf(r));
    expect(d.filename).toBe("factur-x.xml");
    expect(d.xmp?.conformanceLevel).toBe("EN 16931");
    expect(d.format).toMatchObject({ container: "pdf", syntax: "cii", profile: "en16931" });
    expect(Buffer.from(d.xml).toString("utf8")).toBe(r.xml);
    const v = await validateInvoice(d.xml, { plausibility: { today: TODAY } });
    expect(errorIds(v.findings)).toEqual([]);
    expect(v.valid).toBe(true);
    expect(v.layers.schematron).toBe("pass");
    expect(parseInvoice(d.xml).invoice.totals).toEqual(r.model.totals);
  });

  it("is byte-deterministic for the same input and clock", async () => {
    const a = await generateInvoice(REFERENCE, { target: "zugferd-pdf", ...opts });
    const b = await generateInvoice(REFERENCE, { target: "zugferd-pdf", ...opts });
    expect(Buffer.from(pdfOf(a)).equals(Buffer.from(pdfOf(b)))).toBe(true);
    const c = await generateInvoice(REFERENCE, {
      target: "zugferd-pdf",
      ...opts,
      now: new Date("2026-08-26T10:00:00Z"),
    });
    expect(Buffer.from(pdfOf(a)).equals(Buffer.from(pdfOf(c)))).toBe(false);
  });

  it("renders English labels on request and stays a single page", async () => {
    const r = await generateInvoice(REFERENCE, { target: "zugferd-pdf", lang: "en", ...opts });
    const s = await inspect(pdfOf(r));
    expect(s.title).toBe("Invoice RE-2026-0815");
    expect(s.pages).toBe(1);
  });

  it("paginates long invoices and survives glyphs the font lacks", async () => {
    const long: InvoiceInput = {
      ...REFERENCE,
      lines: Array.from({ length: 70 }, (_, i) => ({
        description: `Position ${i + 1} — Beratung 😀 und Ümlaute € § ß`,
        quantity: 1,
        unit: "HUR",
        netPrice: 100,
        vatRate: 19,
      })),
    };
    const r = await generateInvoice(long, { target: "zugferd-pdf", ...opts });
    expect(r.valid).toBe(true);
    const s = await inspect(pdfOf(r));
    expect(s.pages).toBeGreaterThanOrEqual(3);
  });

  it("keeps the UBL target untouched (format + no pdf)", async () => {
    const r = await generateInvoice(REFERENCE, { plausibility: { today: TODAY } });
    expect(r.format).toBe("xrechnung-3.0-ubl");
    expect(r.pdf).toBeUndefined();
    expect(r.profile).toBeUndefined();
  });
});

describe("generateInvoice target zugferd-pdf — profile matrix", () => {
  it("BASIC: Factur-X basic URN, XMP BASIC, valid against the EN 16931 rules", async () => {
    const r = await generateInvoice(REFERENCE, {
      target: "zugferd-pdf",
      zugferdProfile: "BASIC",
      ...opts,
    });
    expect(r.format).toBe("zugferd-2.3-basic");
    expect(r.xml).toContain(
      "<ram:ID>urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic</ram:ID>",
    );
    expect(errorIds(r.findings)).toEqual([]);
    expect(r.valid).toBe(true);
    // the reference input carries a seller contact (BG-6) which BASIC does not allow → dropped with a warning
    const dropped = r.findings.filter((f) => f.ruleId === "KONTOR-GEN-PROFILE-DROPPED");
    expect(dropped.length).toBeGreaterThanOrEqual(1);
    expect(dropped[0]?.severity).toBe("warning");
    expect(dropped[0]?.source).toBe("generation");
    expect(dropped.flatMap((f) => f.bt ?? [])).toContain("BG-6");
    expect(r.xml).not.toContain("DefinedTradeContact");
    await expect(r.xml).toMatchFileSnapshot(golden("generated-zugferd-basic.xml"));
    const d = await detectInvoicePdf(pdfOf(r));
    expect(d.xmp?.conformanceLevel).toBe("BASIC");
    expect(d.format.profile).toBe("basic");
    const s = await inspect(pdfOf(r));
    expect(s.xmp).toContain("<fx:ConformanceLevel>BASIC</fx:ConformanceLevel>");
  });

  it("EXTENDED: extended URN, XMP EXTENDED, honest info finding about unbundled EXTENDED rules", async () => {
    const r = await generateInvoice(REFERENCE, {
      target: "zugferd-pdf",
      zugferdProfile: "EXTENDED",
      ...opts,
    });
    expect(r.format).toBe("zugferd-2.3-extended");
    expect(r.xml).toContain(
      "<ram:ID>urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended</ram:ID>",
    );
    expect(r.valid).toBe(true);
    const info = r.findings.find((f) => f.ruleId === "KONTOR-PDF-PROFILE-UNCHECKED");
    expect(info?.severity).toBe("info");
    expect(info?.source).toBe("generation");
    const d = await detectInvoicePdf(pdfOf(r));
    expect(d.xmp?.conformanceLevel).toBe("EXTENDED");
    expect(d.format.profile).toBe("extended");
  });

  it("EN16931 emits no profile-drop warnings for the reference input", async () => {
    const r = await generateInvoice(REFERENCE, { target: "zugferd-pdf", ...opts });
    expect(r.findings.filter((f) => f.ruleId === "KONTOR-GEN-PROFILE-DROPPED")).toEqual([]);
    expect(r.xml).toContain("DefinedTradeContact");
  });

  it("rejects an unknown profile at the boundary", async () => {
    await expect(
      generateInvoice(REFERENCE, { target: "zugferd-pdf", zugferdProfile: "MINIMUM" as never }),
    ).rejects.toThrow(/profile/i);
  });
});
