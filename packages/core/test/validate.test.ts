import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateInvoice } from "../src/validate/index.js";

const fx = (name: string) => readFileSync(new URL(`../fixtures/detect/${name}`, import.meta.url));
const spike = (name: string) =>
  readFileSync(new URL(`../../../fixtures/spike/${name}`, import.meta.url));

describe("validateInvoice — full pipeline (PRD §5.2 layers 1+2)", () => {
  it("accepts a valid XRechnung UBL invoice with the same non-error findings as the KoSIT oracle", async () => {
    const r = await validateInvoice(spike("valid-ubl.xml"));
    expect(r.scenario).toBe("EN16931 XRechnung (UBL Invoice)");
    expect(r.layers).toEqual({ xsd: "pass", schematron: "pass" });
    expect(r.valid).toBe(true);
    const ids = r.findings.map((f) => `${f.ruleId}:${f.severity}`).sort();
    expect(ids).toEqual(["BR-DE-TMP-32:info"]);
    expect(r.findings[0]?.source).toMatch(/^schematron-/);
  });

  it("accepts the CII twin", async () => {
    const r = await validateInvoice(spike("valid-cii.xml"));
    expect(r.valid).toBe(true);
    expect(r.scenario).toBe("EN16931 XRechnung (CII)");
  });

  it("rejects a missing BuyerReference with BR-DE-15 as error, with a readable XPath location", async () => {
    const r = await validateInvoice(spike("invalid-ubl-missing-buyerref.xml"));
    expect(r.valid).toBe(false);
    const f = r.findings.find((x) => x.ruleId === "BR-DE-15");
    expect(f?.severity).toBe("error");
    expect(f?.source).toBe("schematron-xrechnung");
    expect(f?.location).toBe("/ubl:Invoice[1]");
    expect(f?.message).toMatch(/Buyer reference|BuyerReference|Leitweg/i);
  });

  it("reports XSD violations as fatal and skips Schematron (KoSIT behaviour)", async () => {
    const r = await validateInvoice(fx("ubl-xsd-invalid.xml"));
    expect(r.valid).toBe(false);
    expect(r.layers).toEqual({ xsd: "fail", schematron: "skipped" });
    expect(r.findings[0]).toMatchObject({ ruleId: "XSD", severity: "fatal", source: "xsd" });
    expect(r.findings[0]?.message).toContain("NotInSchema");
  });

  it("applies scenario customLevel overrides (Extension: BR-CL-* → info) so the verdict matches the oracle", async () => {
    const r = await validateInvoice(fx("ubl-xrechnung-extension-full.xml"));
    expect(r.scenario).toBe("EN16931 XRechnung Extension (UBL Invoice)");
    const cl = r.findings.filter((f) => /^BR-CL-(10|11|21|24|25|26)$|^BR-CO-16$/.test(f.ruleId));
    expect(cl.length).toBeGreaterThan(0);
    expect(cl.every((f) => f.severity === "info")).toBe(true);
    expect(r.valid).toBe(true);
  });

  it("falls back to XSD-only with an informational finding when no scenario matches", async () => {
    const r = await validateInvoice(fx("cii-facturx-basic.xml"));
    expect(r.scenario).toBeNull();
    expect(r.layers.schematron).toBe("skipped");
    expect(r.findings.some((f) => f.ruleId === "KONTOR-SCENARIO-NONE")).toBe(true);
  });

  it("honours skipLayers", async () => {
    const r = await validateInvoice(spike("invalid-ubl-missing-buyerref.xml"), {
      skipLayers: ["schematron"],
    });
    expect(r.layers).toEqual({ xsd: "pass", schematron: "skipped" });
    expect(r.valid).toBe(true);
  });

  it("is fast when warm (NFR-3: engine cached across calls)", async () => {
    await validateInvoice(spike("valid-ubl.xml"));
    const t0 = performance.now();
    await validateInvoice(spike("valid-ubl.xml"));
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
