/**
 * Task 0.6 spike: can we assemble a veraPDF-clean PDF/A-3b ZUGFeRD/Factur-X hybrid with pdf-lib alone?
 * Usage: tsx tools/spike-pdfa3.ts <invoice-cii.xml> <out.pdf> [--font path.ttf] [--icc path.icc] [--level EN16931|XRECHNUNG|BASIC]
 * Throwaway-quality; the production version lands in core/src/pdf (Task 2.7).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import { AFRelationship, PDFDocument, PDFHexString, PDFName, PDFString, rgb } from "pdf-lib";

const args = process.argv.slice(2);
const opt = (k: string, d: string) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? (args[i + 1] as string) : d;
};
const [xmlPath, outPath] = args.filter(
  (a) =>
    !a.startsWith("--") &&
    !args.includes(`--${a}`) &&
    !["--font", "--icc", "--level"].some((k) => args[args.indexOf(a) - 1] === k),
);
if (!xmlPath || !outPath) throw new Error("usage: spike-pdfa3 <cii.xml> <out.pdf>");
const fontPath = opt("--font", "/System/Library/Fonts/Supplemental/Arial.ttf");
const iccPath = opt("--icc", "/System/Library/ColorSync/Profiles/sRGB Profile.icc");
const level = opt("--level", "XRECHNUNG");
for (const p of [xmlPath, fontPath, iccPath]) if (!existsSync(p)) throw new Error(`missing ${p}`);

const xml = readFileSync(xmlPath);
const now = new Date();
const iso = now.toISOString().replace(/\.\d{3}Z$/, "Z");

const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const font = await doc.embedFont(readFileSync(fontPath), { subset: true });
const page = doc.addPage([595.28, 841.89]);
const lines = [
  "Rechnung / Invoice (Kontor MCP spike)",
  "Diese PDF-Datei enthält eine maschinenlesbare Rechnung",
  `(ZUGFeRD / Factur-X, factur-x.xml, Profil ${level}).`,
];
lines.forEach((t, i) =>
  page.drawText(t, { x: 56, y: 780 - i * 22, size: i ? 11 : 16, font, color: rgb(0.1, 0.1, 0.1) }),
);

// --- embedded file (Factur-X / ZUGFeRD 2.x): name factur-x.xml, MIME text/xml, AFRelationship Alternative
await doc.attach(xml, "factur-x.xml", {
  mimeType: "text/xml",
  description: "Factur-X/ZUGFeRD-Rechnung",
  creationDate: now,
  modificationDate: now,
  afRelationship: AFRelationship.Alternative,
});

// --- Info dictionary (must agree with XMP for PDF/A)
const title = "Rechnung";
doc.setTitle(title);
doc.setProducer("Kontor MCP (pdf-lib)");
doc.setCreator("Kontor MCP");
doc.setCreationDate(now);
doc.setModificationDate(now);

// --- OutputIntent (sRGB) — required for device-dependent colour in PDF/A
const iccStream = doc.context.flateStream(readFileSync(iccPath), { N: 3 });
const iccRef = doc.context.register(iccStream);
const oi = doc.context.obj({
  Type: "OutputIntent",
  S: "GTS_PDFA1",
  OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
  Info: PDFString.of("sRGB IEC61966-2.1"),
  RegistryName: PDFString.of("http://www.color.org"),
  DestOutputProfile: iccRef,
});
doc.catalog.set(PDFName.of("OutputIntents"), doc.context.obj([doc.context.register(oi)]));

// --- XMP metadata: pdfaid (part 3, conformance B) + Factur-X extension schema
const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>3</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>Kontor MCP</rdf:li></rdf:Seq></dc:creator>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdf:Producer>Kontor MCP (pdf-lib)</pdf:Producer>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:CreatorTool>Kontor MCP</xmp:CreatorTool>
   <xmp:CreateDate>${iso}</xmp:CreateDate>
   <xmp:ModifyDate>${iso}</xmp:ModifyDate>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
   <pdfaExtension:schemas>
    <rdf:Bag>
     <rdf:li rdf:parseType="Resource">
      <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
      <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
      <pdfaSchema:prefix>fx</pdfaSchema:prefix>
      <pdfaSchema:property>
       <rdf:Seq>
        <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>name of the embedded XML invoice file</pdfaProperty:description></rdf:li>
        <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>INVOICE</pdfaProperty:description></rdf:li>
        <rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The actual version of the Factur-X XML schema</pdfaProperty:description></rdf:li>
        <rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The conformance level of the embedded Factur-X data</pdfaProperty:description></rdf:li>
       </rdf:Seq>
      </pdfaSchema:property>
     </rdf:li>
    </rdf:Bag>
   </pdfaExtension:schemas>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
   <fx:DocumentType>INVOICE</fx:DocumentType>
   <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
   <fx:Version>1.0</fx:Version>
   <fx:ConformanceLevel>${level}</fx:ConformanceLevel>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
const xmpStream = doc.context.stream(Buffer.from(xmp, "utf8"), {
  Type: "Metadata",
  Subtype: "XML",
});
doc.catalog.set(PDFName.of("Metadata"), doc.context.register(xmpStream));

// --- trailer /ID (PDF/A-3 requires a file identifier)
const id = PDFHexString.of(
  Buffer.from(`${outPath}${iso}`).toString("hex").slice(0, 32).padEnd(32, "0"),
);
doc.context.trailerInfo.ID = doc.context.obj([id, id]);

// pdf-lib registers the embedded file and catalog /AF at save time (PDFEmbeddedFile.embed).
const bytes = await doc.save({ useObjectStreams: false });
writeFileSync(outPath, bytes);
console.log(`wrote ${outPath} (${bytes.byteLength} bytes)`);
