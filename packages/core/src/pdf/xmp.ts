/** XMP packet for PDF/A-3b with the Factur-X / ZUGFeRD extension schema (proven in spike 0.6, D-022). */
import { escapeXml } from "../serialize/xml.js";

/** Factur-X 1.0 / ZUGFeRD 2.x conformance levels as written to `fx:ConformanceLevel`. */
export type FacturXConformanceLevel =
  | "MINIMUM"
  | "BASIC WL"
  | "BASIC"
  | "EN 16931"
  | "EXTENDED"
  | "XRECHNUNG";

export const FACTURX_XMP_NAMESPACE = "urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#";
export const FACTURX_ATTACHMENT_NAME = "factur-x.xml";

export interface XmpInput {
  title: string;
  creator: string;
  creatorTool: string;
  producer: string;
  /** ISO 8601 without milliseconds, e.g. 2026-08-25T10:00:00Z (must equal the Info dictionary dates). */
  date: string;
  conformanceLevel: FacturXConformanceLevel;
}

export function buildFacturXXmp(i: XmpInput): string {
  const e = escapeXml;
  const prop = (name: string, description: string) =>
    `        <rdf:li rdf:parseType="Resource"><pdfaProperty:name>${name}</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>${description}</pdfaProperty:description></rdf:li>`;
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>3</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${e(i.title)}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>${e(i.creator)}</rdf:li></rdf:Seq></dc:creator>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdf:Producer>${e(i.producer)}</pdf:Producer>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:CreatorTool>${e(i.creatorTool)}</xmp:CreatorTool>
   <xmp:CreateDate>${e(i.date)}</xmp:CreateDate>
   <xmp:ModifyDate>${e(i.date)}</xmp:ModifyDate>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
   <pdfaExtension:schemas>
    <rdf:Bag>
     <rdf:li rdf:parseType="Resource">
      <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
      <pdfaSchema:namespaceURI>${FACTURX_XMP_NAMESPACE}</pdfaSchema:namespaceURI>
      <pdfaSchema:prefix>fx</pdfaSchema:prefix>
      <pdfaSchema:property>
       <rdf:Seq>
${prop("DocumentFileName", "name of the embedded XML invoice file")}
${prop("DocumentType", "INVOICE")}
${prop("Version", "The actual version of the Factur-X XML schema")}
${prop("ConformanceLevel", "The conformance level of the embedded Factur-X data")}
       </rdf:Seq>
      </pdfaSchema:property>
     </rdf:li>
    </rdf:Bag>
   </pdfaExtension:schemas>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:fx="${FACTURX_XMP_NAMESPACE}">
   <fx:DocumentType>INVOICE</fx:DocumentType>
   <fx:DocumentFileName>${FACTURX_ATTACHMENT_NAME}</fx:DocumentFileName>
   <fx:Version>1.0</fx:Version>
   <fx:ConformanceLevel>${e(i.conformanceLevel)}</fx:ConformanceLevel>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}
