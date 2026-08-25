/**
 * PDF/A-3b container assembly with an embedded Factur-X/ZUGFeRD XML (spike 0.6, D-022):
 * embedded subsetted fonts, sRGB OutputIntent, XMP with pdfaid + Factur-X extension schema,
 * `factur-x.xml` as /AFRelationship /Alternative, Info ≡ XMP, deterministic trailer /ID.
 */
import { createHash } from "node:crypto";
import { loadPdfAsset, PDF_ASSETS } from "@kontor-mcp/rules";
import fontkit from "@pdf-lib/fontkit";
import { AFRelationship, PDFDocument, PDFHexString, PDFName, PDFString } from "pdf-lib";
import type { Fonts } from "./layout.js";
import { buildFacturXXmp, FACTURX_ATTACHMENT_NAME, type FacturXConformanceLevel } from "./xmp.js";

export const PDF_CREATOR = "Kontor MCP";
export const PDF_PRODUCER = "Kontor MCP (pdf-lib 1.17.1)";

export interface AssembleOptions {
  /** The Factur-X/ZUGFeRD CII XML, UTF-8. */
  xml: string;
  conformanceLevel: FacturXConformanceLevel;
  title: string;
  /** Creation/modification instant; fixed by callers that need byte-identical output. */
  now: Date;
  /** Draws the visual pages. */
  render: (doc: PDFDocument, fonts: Fonts) => void;
}

/** ISO 8601 seconds precision, UTC — the form written to both XMP and the Info dictionary. */
export function isoSeconds(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function assemblePdfA3(o: AssembleOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts: Fonts = {
    regular: await doc.embedFont(loadPdfAsset(PDF_ASSETS.font.regular), {
      subset: true,
      customName: "LiberationSans",
    }),
    bold: await doc.embedFont(loadPdfAsset(PDF_ASSETS.font.bold), {
      subset: true,
      customName: "LiberationSans-Bold",
    }),
  };
  o.render(doc, fonts);

  const now = new Date(Math.floor(o.now.getTime() / 1000) * 1000);
  const iso = isoSeconds(now);
  await doc.attach(Buffer.from(o.xml, "utf8"), FACTURX_ATTACHMENT_NAME, {
    mimeType: "text/xml",
    description: "Factur-X/ZUGFeRD invoice data",
    creationDate: now,
    modificationDate: now,
    afRelationship: AFRelationship.Alternative,
  });

  doc.setTitle(o.title);
  doc.setAuthor(PDF_CREATOR);
  doc.setProducer(PDF_PRODUCER);
  doc.setCreator(PDF_CREATOR);
  doc.setCreationDate(now);
  doc.setModificationDate(now);

  const iccStream = doc.context.flateStream(loadPdfAsset(PDF_ASSETS.icc.name), { N: 3 });
  const intent = doc.context.obj({
    Type: "OutputIntent",
    S: "GTS_PDFA1",
    OutputConditionIdentifier: PDFString.of(PDF_ASSETS.icc.identifier),
    Info: PDFString.of(PDF_ASSETS.icc.identifier),
    RegistryName: PDFString.of(PDF_ASSETS.icc.registry),
    DestOutputProfile: doc.context.register(iccStream),
  });
  doc.catalog.set(PDFName.of("OutputIntents"), doc.context.obj([doc.context.register(intent)]));

  const xmp = buildFacturXXmp({
    title: o.title,
    creator: PDF_CREATOR,
    creatorTool: PDF_CREATOR,
    producer: PDF_PRODUCER,
    date: iso,
    conformanceLevel: o.conformanceLevel,
  });
  const xmpStream = doc.context.stream(Buffer.from(xmp, "utf8"), {
    Type: "Metadata",
    Subtype: "XML",
  });
  doc.catalog.set(PDFName.of("Metadata"), doc.context.register(xmpStream));

  const id = PDFHexString.of(
    createHash("sha256").update(o.xml).update(iso).digest("hex").slice(0, 32),
  );
  doc.context.trailerInfo.ID = doc.context.obj([id, id]);

  return doc.save({ useObjectStreams: false, updateFieldAppearances: false });
}
