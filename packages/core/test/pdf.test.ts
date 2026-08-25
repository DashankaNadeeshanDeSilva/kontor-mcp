import { readFileSync } from "node:fs";
import { AFRelationship, PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { detectInvoicePdf, extractEmbeddedXml, PdfExtractError } from "../src/pdf/index.js";

const zf = (name: string) =>
  readFileSync(new URL(`../../../fixtures/zugferd/${name}`, import.meta.url));
const fx = (name: string) => readFileSync(new URL(`../fixtures/detect/${name}`, import.meta.url));

async function buildPdf(files: Array<[string, Uint8Array]>): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  for (const [name, bytes] of files) {
    await doc.attach(bytes, name, {
      mimeType: "text/xml",
      afRelationship: AFRelationship.Alternative,
    });
  }
  return doc.save({ useObjectStreams: false });
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(PdfExtractError);
  await p.catch((e: PdfExtractError) => expect(e.code).toBe(code));
}

describe("extractEmbeddedXml — ZUGFeRD corpus", () => {
  const corpus: Array<[string, string]> = [
    ["Facture_FR_MINIMUM.pdf", "minimum"],
    ["Facture_FR_BASICWL.pdf", "basicwl"],
    ["Avoir_FR_type381_BASIC.pdf", "basic"],
    ["Facture_FR_EN16931.pdf", "en16931"],
    ["MustangGnuaccountingBeispielRE-20201121_508.pdf", "en16931"],
    ["MustangGnuaccountingBeispielRE-20171118_506.pdf", "extended"],
  ];
  for (const [file, profile] of corpus) {
    it(`extracts factur-x.xml and XMP profile from ${file}`, async () => {
      const r = await extractEmbeddedXml(zf(file));
      expect(r.filename).toBe("factur-x.xml");
      expect(Buffer.from(r.xml).toString("utf8")).toContain("CrossIndustryInvoice");
      expect(r.xmp?.conformanceLevel).toBeDefined();
      const d = await detectInvoicePdf(zf(file));
      expect(d.format).toMatchObject({ container: "pdf", syntax: "cii", profile });
    });
  }

  it("falls back to scanning attachments when the filename is non-standard", async () => {
    const r = await extractEmbeddedXml(zf("wrongFilename.pdf"));
    expect(r.filename).toBe("factur-y.xml");
    expect(r.candidates).toEqual(["factur-y.xml"]);
  });

  it("surfaces a malformed XML declaration inside the PDF as a loader error", async () => {
    const r = await extractEmbeddedXml(zf("factur-x-invalid-xml-encoding-attribute.pdf"));
    expect(r.filename).toBe("factur-x.xml");
    await expect(
      detectInvoicePdf(zf("factur-x-invalid-xml-encoding-attribute.pdf")),
    ).rejects.toThrow(/KONTOR-XML-MALFORMED/);
  });
});

describe("extractEmbeddedXml — synthetic PDFs and failure modes", () => {
  const cii = fx("cii-facturx-basic.xml");
  const ubl = fx("ubl-invoice-en16931.xml");

  it("round-trips a pdf-lib attach() (the generation path of D-022)", async () => {
    const pdf = await buildPdf([["factur-x.xml", cii]]);
    const r = await extractEmbeddedXml(pdf);
    expect(r.filename).toBe("factur-x.xml");
    expect(Buffer.from(r.xml)).toEqual(Buffer.from(cii));
  });

  it("prefers the standard name among multiple attachments and lists the others", async () => {
    const pdf = await buildPdf([
      ["notes.txt", new TextEncoder().encode("hello")],
      ["zugferd-invoice.xml", cii],
      ["other.xml", ubl],
    ]);
    const r = await extractEmbeddedXml(pdf);
    expect(r.filename).toBe("zugferd-invoice.xml");
    expect(r.candidates).toEqual(["zugferd-invoice.xml", "other.xml"]);
  });

  it("rejects a PDF with no invoice attachment (NG3)", async () => {
    const pdf = await buildPdf([["notes.txt", new TextEncoder().encode("hello")]]);
    await expectCode(extractEmbeddedXml(pdf), "KONTOR-PDF-NO-ATTACHMENT");
    await expectCode(extractEmbeddedXml(await buildPdf([])), "KONTOR-PDF-NO-ATTACHMENT");
  });

  it("rejects an encrypted PDF", async () => {
    await expectCode(extractEmbeddedXml(fx("encrypted.pdf")), "KONTOR-PDF-ENCRYPTED");
  });

  it("rejects input above the size cap", async () => {
    await expectCode(
      extractEmbeddedXml(zf("Facture_FR_MINIMUM.pdf"), { maxBytes: 1000 }),
      "KONTOR-PDF-SIZE",
    );
  });

  it("caps decompressed attachment size (decompression bomb)", async () => {
    const bomb = new TextEncoder().encode(`<a>${"x".repeat(2_000_000)}</a>`);
    const pdf = await buildPdf([["factur-x.xml", bomb]]);
    expect(pdf.byteLength).toBeLessThan(100_000);
    await expectCode(
      extractEmbeddedXml(pdf, { maxXmlBytes: 500_000 }),
      "KONTOR-PDF-DECOMPRESS-SIZE",
    );
  });

  it("rejects non-PDF and garbage input", async () => {
    await expectCode(extractEmbeddedXml(ubl), "KONTOR-PDF-NOT-PDF");
    await expectCode(extractEmbeddedXml(fx("garbage.bin")), "KONTOR-PDF-NOT-PDF");
    await expectCode(extractEmbeddedXml(fx("fake.pdf")), "KONTOR-PDF-MALFORMED");
  });
});
