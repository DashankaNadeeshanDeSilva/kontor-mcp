import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DetectError,
  DetectedFormatSchema,
  detectFormat,
  sniffContainer,
} from "../src/detect/index.js";

const fx = (name: string) => readFileSync(new URL(`../fixtures/detect/${name}`, import.meta.url));
const spike = (name: string) =>
  readFileSync(new URL(`../../../fixtures/spike/${name}`, import.meta.url));

describe("sniffContainer", () => {
  it("recognises PDF magic bytes", () => expect(sniffContainer(fx("fake.pdf"))).toBe("pdf"));
  it("recognises XML (with BOM)", () => expect(sniffContainer(fx("bom-utf8-ubl.xml"))).toBe("xml"));
  it("returns unknown for garbage and empty input", () => {
    expect(sniffContainer(fx("garbage.bin"))).toBe("unknown");
    expect(sniffContainer(new Uint8Array())).toBe("unknown");
  });
});

describe("detectFormat", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    [
      "ubl-invoice-en16931.xml",
      {
        syntax: "ubl-invoice",
        standard: "en16931",
        cius: null,
        profile: null,
        version: null,
        profileId: "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0",
      },
    ],
    [
      "ubl-creditnote-xrechnung.xml",
      { syntax: "ubl-creditnote", cius: "xrechnung", xrechnungVariant: "base", version: "3.0" },
    ],
    [
      "ubl-invoice-xrechnung-extension.xml",
      { syntax: "ubl-invoice", cius: "xrechnung", xrechnungVariant: "extension", version: "3.0" },
    ],
    [
      "cii-xrechnung-cvd.xml",
      { syntax: "cii", cius: "xrechnung", xrechnungVariant: "cvd", version: "3.0" },
    ],
    ["cii-zugferd-xrechnung.xml", { syntax: "cii", cius: "xrechnung", profile: null }],
    [
      "cii-facturx-minimum.xml",
      { syntax: "cii", standard: "unknown", profile: "minimum", cius: null },
    ],
    ["cii-facturx-basicwl.xml", { profile: "basicwl", standard: "unknown" }],
    ["cii-facturx-basic.xml", { profile: "basic", standard: "en16931" }],
    ["cii-facturx-en16931.xml", { profile: "en16931", standard: "en16931", cius: null }],
    ["cii-facturx-extended.xml", { profile: "extended", standard: "en16931" }],
  ];
  for (const [file, expected] of cases) {
    it(`detects ${file}`, () => {
      const f = detectFormat(fx(file));
      expect(f).toMatchObject({ container: "xml", ...expected });
      expect(DetectedFormatSchema.parse(f)).toEqual(f);
    });
  }

  it("detects the official spike fixtures (UBL + CII XRechnung 3.0)", () => {
    expect(detectFormat(spike("valid-ubl.xml"))).toMatchObject({
      syntax: "ubl-invoice",
      cius: "xrechnung",
      version: "3.0",
    });
    expect(detectFormat(spike("valid-cii.xml"))).toMatchObject({
      syntax: "cii",
      cius: "xrechnung",
      version: "3.0",
    });
  });

  it("carries the raw customizationId through", () => {
    expect(detectFormat(fx("cii-xrechnung-cvd.xml")).customizationId).toContain("cvd_0.9");
  });

  it("returns container=pdf without parsing for PDF bytes", () => {
    expect(detectFormat(fx("fake.pdf"))).toMatchObject({ container: "pdf", syntax: null });
  });

  it("throws DetectError for an unsupported root element", () => {
    expect(() => detectFormat(fx("unknown-root.xml"))).toThrow(DetectError);
    try {
      detectFormat(fx("unknown-root.xml"));
    } catch (e) {
      expect((e as DetectError).code).toBe("KONTOR-DETECT-UNSUPPORTED");
    }
  });

  it("propagates loader rejection for the XXE fixture", () => {
    expect(() => detectFormat(fx("attack-xxe.xml"))).toThrow(/KONTOR-XML-DTD/);
  });

  it("throws DetectError for garbage", () => {
    expect(() => detectFormat(fx("garbage.bin"))).toThrow(DetectError);
  });
});
