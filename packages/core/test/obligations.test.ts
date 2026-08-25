import { describe, expect, it } from "vitest";
import { checkObligations, type ObligationsInput, type ObligationsReport } from "../src/index.js";

const byId = (r: ObligationsReport, id: string) => r.obligations.find((o) => o.id === id);

/** Table-driven scenarios (Task 2.5 AC): each answer must carry sources + lastVerified + disclaimer. */
const CASES: Array<{
  name: string;
  input: ObligationsInput;
  expect: (r: ObligationsReport) => void;
}> = [
  {
    name: "freelancer invoicing a federal authority in 2026 → XRechnung + Leitweg-ID required",
    input: { role: "issuer", counterparty: "b2g", date: "2026-03-01" },
    expect: (r) => {
      const o = byId(r, "b2g-issue-xrechnung");
      expect(o?.status).toBe("required");
      expect(o?.from).toBe("2020-11-27");
      expect(o?.leitwegIdRequired).toBe(true);
      expect(o?.formats).toContain("XRechnung");
      expect(o?.sources.some((s) => s.url.includes("erechv"))).toBe(true);
    },
  },
  {
    name: "federal direct order of 800 € net → exempt under § 3 Abs. 3 E-RechV",
    input: { role: "issuer", counterparty: "b2g", date: "2026-03-01", direct_order_net_eur: 800 },
    expect: (r) => {
      expect(byId(r, "b2g-issue-xrechnung")?.status).toBe("exempt");
      expect(byId(r, "b2g-issue-xrechnung")?.rationale.de).toMatch(/1\.000/);
    },
  },
  {
    name: "small B2B receiver in 2026 → must be able to receive since 2025-01-01",
    input: {
      role: "receiver",
      counterparty: "b2b",
      date: "2026-06-01",
      annual_revenue_eur: 50_000,
    },
    expect: (r) => {
      const o = byId(r, "b2b-receive");
      expect(o?.status).toBe("required");
      expect(o?.from).toBe("2025-01-01");
      expect(r.obligations.find((o) => o.id.startsWith("b2b-issue"))).toBeUndefined();
    },
  },
  {
    name: "receiver in mid-2024 → not yet required, start date named",
    input: { role: "receiver", counterparty: "b2b", date: "2024-06-01" },
    expect: (r) => {
      const o = byId(r, "b2b-receive");
      expect(o?.status).toBe("not-required");
      expect(o?.from).toBe("2025-01-01");
    },
  },
  {
    name: "issuer > 800k in 2027 → e-invoice required",
    input: {
      role: "issuer",
      counterparty: "b2b",
      date: "2027-03-01",
      annual_revenue_eur: 1_200_000,
    },
    expect: (r) => {
      const o = byId(r, "b2b-issue");
      expect(o?.status).toBe("required");
      expect(o?.from).toBe("2027-01-01");
      expect(o?.formats).toEqual(
        expect.arrayContaining(["XRechnung", "ZUGFeRD ≥ 2.0.1 (not MINIMUM / BASIC-WL)"]),
      );
    },
  },
  {
    name: "issuer ≤ 800k in 2027 → transitional until 2027-12-31",
    input: { role: "issuer", counterparty: "b2b", date: "2027-03-01", annual_revenue_eur: 800_000 },
    expect: (r) => {
      const o = byId(r, "b2b-issue");
      expect(o?.status).toBe("transitional");
      expect(o?.until).toBe("2027-12-31");
      expect(o?.rationale.en).toMatch(/800,000/);
    },
  },
  {
    name: "issuer in 2027 with unknown revenue → conditional, both branches explained",
    input: { role: "issuer", counterparty: "b2b", date: "2027-03-01" },
    expect: (r) => {
      const o = byId(r, "b2b-issue");
      expect(o?.status).toBe("conditional");
      expect(o?.rationale.de).toMatch(/800\.000/);
      expect(o?.rationale.en).toMatch(/prior.year/i);
    },
  },
  {
    name: "issuer in 2028 → required regardless of revenue",
    input: { role: "issuer", counterparty: "b2b", date: "2028-01-15", annual_revenue_eur: 10_000 },
    expect: (r) => {
      expect(byId(r, "b2b-issue")?.status).toBe("required");
      expect(byId(r, "b2b-issue")?.from).toBe("2028-01-01");
    },
  },
  {
    name: "issuer in 2025/2026 → transitional until 2026-12-31, and receiving is already required",
    input: { role: "issuer", counterparty: "b2b", date: "2025-09-01" },
    expect: (r) => {
      expect(byId(r, "b2b-issue")?.status).toBe("transitional");
      expect(byId(r, "b2b-issue")?.until).toBe("2026-12-31");
      expect(byId(r, "b2b-receive")?.status).toBe("required");
    },
  },
  {
    name: "Kleinunternehmer issuer in 2028 → permanently exempt from issuing (§ 34a UStDV), must still receive",
    input: {
      role: "issuer",
      counterparty: "b2b",
      date: "2028-05-01",
      small_business_19_ustg: true,
    },
    expect: (r) => {
      const o = byId(r, "b2b-issue");
      expect(o?.status).toBe("exempt");
      expect(o?.until).toBeUndefined();
      expect(o?.sources.some((s) => s.url.includes("ustdv_1980/__34a"))).toBe(true);
      expect(byId(r, "b2b-receive")?.status).toBe("required");
    },
  },
  {
    name: "cross-border B2B issuer in 2028 → not required (mandate needs both parties established in Germany)",
    input: { role: "issuer", counterparty: "b2b", date: "2028-05-01", cross_border: true },
    expect: (r) => {
      expect(byId(r, "b2b-issue")?.status).toBe("not-required");
      expect(byId(r, "b2b-issue")?.rationale.en).toMatch(/established/i);
    },
  },
  {
    name: "B2C issuer in 2028 → not required",
    input: { role: "issuer", counterparty: "b2c", date: "2028-05-01" },
    expect: (r) => {
      expect(byId(r, "b2c-issue")?.status).toBe("not-required");
    },
  },
  {
    name: "Kleinbetragsrechnung 200 € gross in 2028 → exempt (§ 33 UStDV, no time limit)",
    input: { role: "issuer", counterparty: "b2b", date: "2028-05-01", invoice_gross_eur: 200 },
    expect: (r) => {
      const o = byId(r, "b2b-issue");
      expect(o?.status).toBe("exempt");
      expect(o?.until).toBeUndefined();
      expect(o?.rationale.en).toMatch(/250/);
    },
  },
  {
    name: "supply exempt under § 4 Nr. 8–29 UStG → exempt",
    input: { role: "issuer", counterparty: "b2b", date: "2028-05-01", exempt_supply_4_8_29: true },
    expect: (r) => expect(byId(r, "b2b-issue")?.status).toBe("exempt"),
  },
  {
    name: "public-sector receiver → out of scope, pointer given",
    input: { role: "receiver", counterparty: "b2g", date: "2026-01-01" },
    expect: (r) => {
      expect(byId(r, "b2g-receive")?.status).toBe("out-of-scope");
      expect(byId(r, "b2g-receive")?.rationale.en).toMatch(/E-RechV|Land/);
    },
  },
];

describe("checkObligations (Task 2.5) — table-driven scenarios", () => {
  for (const c of CASES) {
    it(c.name, () => {
      const r = checkObligations(c.input);
      c.expect(r);
      expect(r.obligations.length).toBeGreaterThan(0);
      for (const o of r.obligations) {
        expect(o.sources.length, `${o.id} has sources`).toBeGreaterThan(0);
        for (const s of o.sources) expect(s.url).toMatch(/^https:\/\//);
        expect(o.rationale.de).toBeTruthy();
        expect(o.rationale.en).toBeTruthy();
      }
      expect(r.lastVerified).toBe("2026-08-25");
      expect(r.summary.de).toBeTruthy();
      expect(r.summary.en).toContain("not tax or legal advice");
      expect(r.disclaimer.de).toMatch(/keine steuerliche/);
    });
  }

  it("defaults the reference date to today and echoes the normalised input", () => {
    const r = checkObligations({ role: "issuer", counterparty: "b2b" });
    expect(r.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.input.counterparty).toBe("b2b");
  });

  it("rejects an invalid date", () => {
    expect(() =>
      checkObligations({ role: "issuer", counterparty: "b2b", date: "2027-13-01" }),
    ).toThrow();
  });
});
