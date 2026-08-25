import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  convertInvoice,
  type InvoiceModel,
  modelToCii,
  modelToUbl,
  parseInvoice,
  renderHtmlPreview,
  validateInvoice,
} from "../src/index.js";

const fx = (rel: string) => readFileSync(new URL(`../../../fixtures/${rel}`, import.meta.url));
const golden = (name: string) => new URL(`./golden/${name}`, import.meta.url).pathname;

/**
 * Documented round-trip exceptions (see D-037); everything else must survive UBL ↔ CII unchanged:
 * 1. the specification identifier is pinned by the target;
 * 2. UBL's cac:OrderReference/cbc:ID is mandatory, so a sales-order-only source gains BT-13 = "NA";
 * 3. CII D16B allows one InvoiceReferencedDocument, so BG-3 is truncated to the first entry.
 */
function comparable(m: InvoiceModel): Omit<InvoiceModel, "specificationIdentifier"> {
  const { specificationIdentifier: _s, ...rest } = structuredClone(m);
  if (rest.purchaseOrderReference === "NA" && rest.salesOrderReference)
    rest.purchaseOrderReference = undefined;
  if (rest.precedingInvoices && rest.precedingInvoices.length > 1)
    rest.precedingInvoices = rest.precedingInvoices.slice(0, 1);
  return JSON.parse(JSON.stringify(rest));
}

describe("serializers — UBL ↔ CII via the semantic model (Task 2.4)", () => {
  it("KoSIT UBL sample → CII: model preserved and still XRechnung-valid", async () => {
    const src = parseInvoice(fx("spike/valid-ubl.xml")).invoice;
    const cii = modelToCii(src);
    expect(cii).toContain("<rsm:CrossIndustryInvoice");
    const back = parseInvoice(cii);
    expect(back.format.syntax).toBe("cii");
    expect(comparable(back.invoice)).toEqual(comparable(src));
    const v = await validateInvoice(cii, { skipLayers: ["plausibility"] });
    expect(v.findings.filter((f) => f.severity === "error" || f.severity === "fatal")).toEqual([]);
    expect(v.valid).toBe(true);
  });

  it("KoSIT CII sample → UBL: model preserved and still XRechnung-valid", async () => {
    const src = parseInvoice(fx("spike/valid-cii.xml")).invoice;
    const ubl = modelToUbl(src);
    const back = parseInvoice(ubl);
    expect(back.format.syntax).toBe("ubl-invoice");
    expect(comparable(back.invoice)).toEqual(comparable(src));
    const v = await validateInvoice(ubl, { skipLayers: ["plausibility"] });
    expect(v.findings.filter((f) => f.severity === "error" || f.severity === "fatal")).toEqual([]);
    expect(v.valid).toBe(true);
  });

  it("credit notes (381) serialise as UBL CreditNote and round-trip", () => {
    const src = parseInvoice(fx("spike/valid-ubl.xml")).invoice;
    const cn: InvoiceModel = { ...src, typeCode: "381" };
    const ubl = modelToUbl(cn);
    expect(ubl).toContain("<ubl:CreditNote");
    expect(ubl).toContain("<cbc:CreditedQuantity");
    const back = parseInvoice(ubl);
    expect(back.format.syntax).toBe("ubl-creditnote");
    expect(comparable(back.invoice)).toEqual(comparable(cn));
  });
});

describe("round-trip over the official XRechnung test suite (UBL→CII→UBL, CII→UBL→CII)", () => {
  const root = new URL(
    "../../../fixtures/_downloads/xrechnung-testsuite/instances/",
    import.meta.url,
  );
  const available = existsSync(root);
  const files: string[] = [];
  if (available) {
    for (const e of readdirSync(root, { withFileTypes: true })) {
      if (e.isDirectory())
        for (const f of readdirSync(new URL(`${e.name}/`, root)))
          if (f.endsWith(".xml")) files.push(`${e.name}/${f}`);
          else if (e.name.endsWith(".xml")) files.push(e.name);
    }
  }
  it.skipIf(!available)(
    "preserves the semantic model for every instance and keeps valid sources valid",
    async () => {
      const failures: string[] = [];
      for (const rel of files) {
        const bytes = readFileSync(new URL(rel, root));
        let src: ReturnType<typeof parseInvoice>;
        try {
          src = parseInvoice(bytes);
        } catch {
          continue; // not parseable → not our concern here (conformance suite covers verdicts)
        }
        if (src.warnings.length) continue; // incomplete models cannot be serialised faithfully
        const toCii = src.format.syntax !== "cii";
        const first = toCii ? modelToCii(src.invoice) : modelToUbl(src.invoice);
        const mid = parseInvoice(first).invoice;
        const second = toCii ? modelToUbl(mid) : modelToCii(mid);
        const end = parseInvoice(second).invoice;
        if (JSON.stringify(comparable(end)) !== JSON.stringify(comparable(src.invoice))) {
          failures.push(`${rel}: model changed after round trip`);
          continue;
        }
        // Extension-profile sources carry data outside the core model (e.g. sub-invoice lines whose totals
        // the header depends on); the converted core document cannot be required to validate.
        if (src.format.xrechnungVariant === "extension") continue;
        const srcV = await validateInvoice(bytes, { skipLayers: ["plausibility"] });
        if (srcV.valid) {
          const outV = await validateInvoice(first, { skipLayers: ["plausibility"] });
          if (!outV.valid) {
            failures.push(
              `${rel}: converted ${toCii ? "CII" : "UBL"} invalid: ${outV.findings
                .filter((f) => f.severity !== "info" && f.severity !== "warning")
                .map((f) => f.ruleId)
                .join(",")}`,
            );
          }
        }
      }
      expect(files.length).toBeGreaterThan(10);
      expect(failures).toEqual([]);
    },
    600_000,
  );
});

describe("convertInvoice — targets, post-validation, lossReport", () => {
  it("extract-xml returns the embedded XML of a ZUGFeRD PDF unchanged", async () => {
    const r = await convertInvoice(fx("zugferd/MustangGnuaccountingBeispielRE-20201121_508.pdf"), {
      target: "extract-xml",
    });
    expect(r.mimeType).toBe("application/xml");
    expect(r.artifact).toContain("<rsm:CrossIndustryInvoice");
    expect(r.sourceFormat.container).toBe("pdf");
    expect(r.lossReport).toEqual([]);
  });

  it("ZUGFeRD EN 16931 PDF → xrechnung-ubl is post-validated honestly and reports the pinned ID", async () => {
    const r = await convertInvoice(fx("zugferd/MustangGnuaccountingBeispielRE-20201121_508.pdf"), {
      target: "xrechnung-ubl",
    });
    expect(r.artifact).toContain("<ubl:Invoice");
    expect(r.artifact).toContain("xrechnung_3.0");
    expect(typeof r.valid).toBe("boolean");
    expect(r.findings.length).toBeGreaterThan(0); // a Factur-X invoice lacks XRechnung-specific terms (e.g. BT-10)
    expect(r.lossReport.some((l) => l.kind === "changed" && l.bt === "BT-24")).toBe(true);
  });

  it("EXTENDED-profile source → lossReport names the profile loss", async () => {
    const r = await convertInvoice(fx("zugferd/MustangGnuaccountingBeispielRE-20171118_506.pdf"), {
      target: "xrechnung-ubl",
    });
    expect(r.sourceFormat.profile).toBe("extended");
    expect(r.lossReport.some((l) => l.kind === "profile")).toBe(true);
    expect(
      r.lossReport.every(
        (l) => typeof l.message.de === "string" && typeof l.message.en === "string",
      ),
    ).toBe(true);
  });

  it("UBL → cii keeps the EN 16931 / XRechnung identifier and reports no loss", async () => {
    const r = await convertInvoice(fx("spike/valid-ubl.xml"), { target: "cii" });
    expect(r.artifact).toContain("xrechnung_3.0");
    expect(r.valid).toBe(true);
    expect(r.lossReport).toEqual([]);
  });

  it("html-preview is self-contained, escaped and bilingual", async () => {
    const de = await convertInvoice(fx("spike/valid-ubl.xml"), {
      target: "html-preview",
      lang: "de",
    });
    expect(de.mimeType).toBe("text/html");
    expect(de.artifact).toMatch(/^<!doctype html>/i);
    expect(de.artifact).not.toMatch(/<script|https?:\/\//i);
    expect(de.artifact).toContain("Rechnung");
    expect(de.artifact).toContain("123456XX");
    expect(de.artifact).toContain("Zeitschrift [...]");
    expect(de.artifact).toContain("336,90"); // DE number format
    const en = await convertInvoice(fx("spike/valid-ubl.xml"), {
      target: "html-preview",
      lang: "en",
    });
    expect(en.artifact).toContain("Invoice");
    expect(en.artifact).toContain("336.90");
    await expect(de.artifact).toMatchFileSnapshot(golden("preview-valid-ubl.de.html"));
  });

  it("html-preview escapes hostile content", () => {
    const m = parseInvoice(fx("spike/valid-ubl.xml")).invoice;
    m.seller.name = '<img src=x onerror="alert(1)"> & Co';
    const html = renderHtmlPreview(m, { lang: "en" });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; Co");
  });

  it("renders all ZUGFeRD/Factur-X fixtures without throwing", async () => {
    for (const f of [
      "Facture_FR_BASICWL.pdf",
      "Facture_FR_EN16931.pdf",
      "Avoir_FR_type381_BASIC.pdf",
      "MustangGnuaccountingBeispielRE-20171118_506.pdf",
    ]) {
      const r = await convertInvoice(fx(`zugferd/${f}`), { target: "html-preview", lang: "en" });
      expect(r.artifact.length).toBeGreaterThan(500);
    }
  });
});
