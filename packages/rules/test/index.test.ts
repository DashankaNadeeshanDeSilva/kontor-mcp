import { describe, expect, it } from "vitest";
import { loadScenarios, loadSef, loadXsdSet, RULES_PACKAGE } from "../src/index.js";

describe("@kontor-mcp/rules artifacts", () => {
  it("exports its package name", () => expect(RULES_PACKAGE).toBe("@kontor-mcp/rules"));

  it("bundles the 11 KoSIT scenarios with customLevel overrides (D-017)", () => {
    const s = loadScenarios();
    expect(s).toHaveLength(11);
    const ext = s.find((x) => x.name.includes("Extension (UBL Invoice)"));
    expect(ext?.customLevels["BR-CL-10"]).toBe("information");
    expect(ext?.schematron).toEqual(["EN16931-UBL-validation", "XRechnung-UBL-validation"]);
    expect(s.filter((x) => x.syntax === "cii")).toHaveLength(4);
  });

  it("loads and caches a gzipped SEF", () => {
    const a = loadSef("XRechnung-UBL-validation") as { N?: string };
    expect(a).toBeTypeOf("object");
    expect(loadSef("XRechnung-UBL-validation")).toBe(a);
  });

  it("loads XSD sets with the relative layout the imports expect", () => {
    const ubl = loadXsdSet("ubl-invoice");
    expect(ubl.main.fileName).toBe("maindoc/UBL-Invoice-2.1.xsd");
    expect(ubl.preload.map((f) => f.fileName)).toContain(
      "common/UBL-CommonBasicComponents-2.1.xsd",
    );
    expect(loadXsdSet("cii").preload).toHaveLength(3);
  });
});
