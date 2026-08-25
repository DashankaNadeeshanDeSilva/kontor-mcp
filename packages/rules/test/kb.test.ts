import { describe, expect, it } from "vitest";
import { explainRule, kbStats, lintKb, suggestRuleIds } from "../src/index.js";

describe("rule knowledge base (Task 1.5, PRD T4)", () => {
  it("returns a curated DE+EN entry for BR-DE-15", () => {
    const r = explainRule("BR-DE-15");
    expect(r.found).toBe(true);
    if (!r.found) return;
    expect(r.entry.curated).toBe(true);
    expect(r.entry.source).toBe("xrechnung");
    expect(r.entry.severity).toBe("error");
    expect(r.entry.bt).toContain("BT-10");
    expect(r.entry.explanation.de).toMatch(/Leitweg/);
    expect(r.entry.explanation.en).toMatch(/buyer reference/i);
    expect(r.entry.fixHint.de.length).toBeGreaterThan(20);
    expect(r.entry.fixHint.en.length).toBeGreaterThan(20);
    expect(r.entry.officialText).toContain("[BR-DE-15]");
  });

  it("returns a generated baseline entry for an uncurated EN 16931 rule", () => {
    const r = explainRule("BR-52");
    expect(r.found).toBe(true);
    if (!r.found) return;
    expect(r.entry.curated).toBe(false);
    expect(r.entry.source).toBe("en16931");
    expect(r.entry.bt).toEqual(["BG-24", "BT-122"]);
    expect(r.entry.officialText).toMatch(/Supporting document reference/);
    expect(r.entry.syntaxes).toEqual(["cii", "ubl"]);
    expect(r.entry.test?.ubl).toContain("cbc:ID");
  });

  it("normalises sloppy ids (case, spaces, underscores)", () => {
    expect(explainRule(" br_de 15 ").found).toBe(true);
    expect(explainRule("br-co-10").found).toBe(true);
  });

  it("suggests nearest matches for an unknown id", () => {
    const r = explainRule("BR-DE-99");
    expect(r.found).toBe(false);
    if (r.found) return;
    expect(r.suggestions.length).toBeGreaterThan(0);
    expect(r.suggestions.every((s) => s.startsWith("BR-DE-"))).toBe(true);
    expect(suggestRuleIds("BR-KO-16")).toContain("BR-CO-16");
  });

  it("KB lint: every BR-DE-* rule has a curated entry and every curated id exists in the rule sets", () => {
    const problems = lintKb();
    expect(problems).toEqual([]);
  });

  it("exposes stats for list_capabilities", () => {
    const s = kbStats();
    expect(s.total).toBeGreaterThan(900);
    expect(s.curated).toBeGreaterThanOrEqual(40);
  });
});
