import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditInvoice, detectInvoicePdf, renderAuditText } from "../src/index.js";

const fx = (rel: string) => readFileSync(new URL(`../../../fixtures/${rel}`, import.meta.url));
const TODAY = new Date("2016-04-05T00:00:00Z");
const golden = (name: string) => new URL(`./golden/${name}`, import.meta.url).pathname;

/** Golden reports must be stable: drop timings before comparing. */
const stable = (r: Awaited<ReturnType<typeof auditInvoice>>) => {
  const { timings: _t, ...rest } = r;
  return `${JSON.stringify(rest, null, 2)}\n`;
};

describe("auditInvoice (Task 2.2)", () => {
  it("clean XRechnung UBL → accept, header facts incl. tax breakdown, golden report", async () => {
    const r = await auditInvoice(fx("spike/valid-ubl.xml"), { plausibility: { today: TODAY } });
    expect(r.verdict).toBe("valid"); // BR-DE-TMP-32 is info-level only
    expect(r.recommendation).toBe("accept");
    expect(r.header.number).toBe("123456XX");
    expect(r.header.totals.payable).toBe("336.9");
    expect(r.header.taxBreakdown).toEqual([
      { categoryCode: "S", rate: "7", taxableAmount: "314.86", taxAmount: "22.04" },
    ]);
    expect(r.header.payment?.ibans).toEqual(["DE75512108001245126199"]);
    expect(r.findings.plausibility).toEqual([]);
    expect(r.rationale.de).toBeTruthy();
    await expect(stable(r)).toMatchFileSnapshot(golden("clean-ubl.json"));
  });

  it("broken Leitweg-ID + VAT math → officially valid but recommendation review, golden report", async () => {
    const r = await auditInvoice(fx("plausibility/broken-leitweg-vat-math.xml"), {
      plausibility: { today: TODAY },
    });
    expect(r.verdict).toBe("valid_with_warnings");
    expect(r.recommendation).toBe("review");
    const ids = r.findings.plausibility.map((f) => f.ruleId);
    expect(ids).toEqual(["KONTOR-PLAUS-VAT-BREAKDOWN-AMOUNT", "KONTOR-PLAUS-LEITWEG-CHECK"]);
    expect(r.rationale.en).toMatch(/2 plausibility error/);
    // KB enrichment on the official finding
    const tmp32 = r.findings.businessRules.find((f) => f.ruleId === "BR-DE-TMP-32");
    expect(tmp32?.explanation?.de).toBeTruthy();
    await expect(stable(r)).toMatchFileSnapshot(golden("broken-leitweg-vat-math.json"));
  });

  it("ZUGFeRD PDF (extracted XML) → golden report with pdf provenance", async () => {
    const pdf = await detectInvoicePdf(
      fx("zugferd/MustangGnuaccountingBeispielRE-20201121_508.pdf"),
    );
    const r = await auditInvoice(pdf.xml, {
      plausibility: { today: new Date("2020-11-22T00:00:00Z") },
      source: { pdf: { filename: pdf.filename, conformanceLevel: pdf.xmp?.conformanceLevel } },
    });
    expect(r.header.source?.pdf?.filename).toBeTruthy();
    expect(r.header.format.syntax).toBe("cii");
    expect(["accept", "review", "reject"]).toContain(r.recommendation);
    await expect(stable(r)).toMatchFileSnapshot(golden("zugferd-pdf.json"));
  });

  it("missing BT-10 → reject with the BR-DE-15 rationale", async () => {
    const r = await auditInvoice(fx("spike/invalid-ubl-missing-buyerref.xml"), {
      plausibility: { today: TODAY },
    });
    expect(r.verdict).toBe("invalid");
    expect(r.recommendation).toBe("reject");
    expect(r.findings.businessRules.map((f) => f.ruleId)).toContain("BR-DE-15");
    expect(r.rationale.en).toMatch(/BR-DE-15/);
  });

  it("known duplicate number → review even when everything else is clean", async () => {
    const r = await auditInvoice(fx("spike/valid-ubl.xml"), {
      plausibility: { today: TODAY, knownInvoiceNumbers: ["123456XX"] },
    });
    expect(r.recommendation).toBe("review");
    expect(r.rationale.en).toMatch(/duplicate/i);
  });

  it("renders a compact DE/EN text with the tax breakdown in the header", async () => {
    const r = await auditInvoice(fx("plausibility/broken-leitweg-vat-math.xml"), {
      plausibility: { today: TODAY },
    });
    const de = renderAuditText(r, "de");
    const en = renderAuditText(r, "en");
    expect(de).toMatch(/Empfehlung: PRÜFEN/);
    expect(de).toMatch(/S 7 %: 314,86 → 22,06/);
    expect(en).toMatch(/Recommendation: REVIEW/);
    expect(en).toMatch(/S 7 %: 314.86 → 22.06/);
    expect(en).toContain("KONTOR-PLAUS-LEITWEG-CHECK");
    expect(en).toContain("not tax or legal advice");
  });
});
