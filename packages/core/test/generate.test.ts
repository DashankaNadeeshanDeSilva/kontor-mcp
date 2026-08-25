import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  generateInvoice,
  type InvoiceInput,
  InvoiceInputSchema,
  isErrorLevel,
  parseInvoice,
  runPlausibility,
} from "../src/index.js";
import { REFERENCE } from "./fixtures/reference-input.js";

const golden = (name: string) => fileURLToPath(new URL(`./golden/${name}`, import.meta.url));
const TODAY = new Date("2026-08-26T00:00:00Z");

const errorIds = (fs: { ruleId: string; severity: string }[]) =>
  fs.filter((f) => isErrorLevel(f as never)).map((f) => f.ruleId);

describe("generateInvoice (Task 2.3) — reference input", () => {
  it("produces a valid XRechnung 3.0 UBL invoice with exact decimal totals (golden XML)", async () => {
    const r = await generateInvoice(REFERENCE, { plausibility: { today: TODAY } });
    expect(errorIds(r.findings)).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.autoFixes).toEqual([]);
    expect(r.xml).toContain(
      "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0",
    );
    const m = parseInvoice(r.xml).invoice;
    // 10 × 120 = 1200.00 @19 % → 228.00 ; 3 × 33.33 = 99.99 @7 % → 6.9993 → 7.00
    expect(m.totals).toMatchObject({
      lineExtension: "1299.99",
      taxExclusive: "1299.99",
      taxAmount: "235.00",
      taxInclusive: "1534.99",
      payable: "1534.99",
    });
    expect(m.vatBreakdown).toEqual([
      { categoryCode: "S", rate: "19", taxableAmount: "1200.00", taxAmount: "228.00" },
      { categoryCode: "S", rate: "7", taxableAmount: "99.99", taxAmount: "7.00" },
    ]);
    expect(runPlausibility(m, { today: TODAY })).toEqual([]);
    await expect(r.xml).toMatchFileSnapshot(golden("generated-reference.xml"));
  });

  it("the Leitweg-ID path: valid check digits pass, wrong ones surface as a plausibility finding without faking validity", async () => {
    const bad = await generateInvoice(
      { ...REFERENCE, buyerReference: "04011000-12345-04" },
      { plausibility: { today: TODAY } },
    );
    expect(bad.valid).toBe(true); // officially valid — KoSIT does not check the check digits
    expect(bad.findings.map((f) => f.ruleId)).toContain("KONTOR-PLAUS-LEITWEG-CHECK");
    expect(bad.plausible).toBe(false);
    const good = await generateInvoice(REFERENCE, { plausibility: { today: TODAY } });
    expect(good.plausible).toBe(true);
  });
});

describe("generateInvoice — fail-honest contract (PRD D5)", () => {
  it("XRechnung without payment details → valid:false with the BR-DE findings, XML still returned", async () => {
    const { payment: _p, ...noPayment } = REFERENCE;
    const r = await generateInvoice(noPayment, { plausibility: { today: TODAY } });
    expect(r.valid).toBe(false);
    expect(errorIds(r.findings).some((id) => id.startsWith("BR-DE-"))).toBe(true);
    expect(r.xml).toContain("<cbc:ID>RE-2026-0815</cbc:ID>");
  });

  it("dueDate or payment terms are required at the schema boundary (BR-CO-25)", () => {
    const { dueDate: _d, ...rest } = REFERENCE;
    const res = InvoiceInputSchema.safeParse({
      ...rest,
      payment: { iban: "DE75512108001245126199" },
    });
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.error?.issues)).toMatch(/BR-CO-25/);
    expect(
      InvoiceInputSchema.safeParse({
        ...rest,
        payment: { iban: "DE75512108001245126199", terms: "sofort" },
      }).success,
    ).toBe(true);
  });

  it("exempt lines require an exemption reason at the schema boundary", () => {
    const res = InvoiceInputSchema.safeParse({
      ...REFERENCE,
      lines: [
        { description: "Schulung", quantity: 1, netPrice: 100, vatRate: 0, vatCategory: "E" },
      ],
    });
    expect(res.success).toBe(false);
    expect(JSON.stringify(res.error?.issues)).toMatch(/vatExemption/);
  });

  it("exempt (E) and reverse-charge (AE) invoices validate with the reason carried into the breakdown", async () => {
    const r = await generateInvoice(
      {
        ...REFERENCE,
        buyer: { ...REFERENCE.buyer, vatId: "DE987654321" },
        vatExemption: {
          reason: "Steuerschuldnerschaft des Leistungsempfängers",
          code: "VATEX-EU-AE",
        },
        lines: [
          {
            description: "Bauleistung",
            quantity: 1,
            netPrice: 1000,
            vatRate: 0,
            vatCategory: "AE",
          },
        ],
      },
      { plausibility: { today: TODAY } },
    );
    expect(errorIds(r.findings)).toEqual([]);
    expect(r.valid).toBe(true);
    const m = parseInvoice(r.xml).invoice;
    expect(m.vatBreakdown[0]).toMatchObject({
      categoryCode: "AE",
      taxableAmount: "1000.00",
      taxAmount: "0.00",
      exemptionReasonCode: "VATEX-EU-AE",
    });
    expect(m.totals.payable).toBe("1000.00");
  });
});

describe("generateInvoice — deterministic auto-fix pass", () => {
  it("normalises identifiers and repairs S/0 % to Z, reporting every fix", async () => {
    const r = await generateInvoice(
      {
        ...REFERENCE,
        buyerReference: " 04011000-12345-03 ",
        seller: { ...REFERENCE.seller, vatId: "DE 123 456 789" },
        payment: { iban: "DE75 5121 0800 1245 1261 99", terms: "Zahlbar sofort." },
        lines: [
          { description: "Zuschuss", quantity: 1, netPrice: 50, vatRate: 0, vatCategory: "S" },
        ],
      },
      { plausibility: { today: TODAY } },
    );
    expect(r.valid).toBe(true);
    expect(r.plausible).toBe(true);
    const fixes = r.autoFixes.map((f) => f.code).sort();
    expect(fixes).toEqual(["IBAN-NORMALISED", "VAT-CATEGORY-S0-TO-Z", "VATID-NORMALISED"]);
    expect(parseInvoice(r.xml).invoice.buyerReference).toBe("04011000-12345-03"); // trimmed at the schema boundary
    const m = parseInvoice(r.xml).invoice;
    expect(m.seller.vatId).toBe("DE123456789");
    expect(m.paymentInstructions?.creditTransfers?.[0]?.account).toBe("DE75512108001245126199");
    expect(m.vatBreakdown).toEqual([
      { categoryCode: "Z", rate: "0", taxableAmount: "50.00", taxAmount: "0.00" },
    ]);
  });
});

describe("generateInvoice — property test: 50 seeded random inputs are all valid and plausible", () => {
  // mulberry32 — tiny deterministic PRNG so failures are reproducible by seed
  const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)] as T;

  function randomInput(seed: number): InvoiceInput {
    const r = rng(seed);
    const nLines = 1 + Math.floor(r() * 6);
    const exempt = r() < 0.2;
    const lines: InvoiceInput["lines"] = [];
    for (let i = 0; i < nLines; i++) {
      const cat = exempt && r() < 0.5 ? "E" : pick(r, ["S", "S", "S", "Z"] as const);
      const rate = cat === "S" ? pick(r, [19, 7]) : 0;
      // prices with 2–4 decimals and quantities with up to 3 decimals stress the rounding
      const price = Number((r() * 999).toFixed(pick(r, [2, 2, 3, 4])));
      const qty = Number((r() * 20 + 0.001).toFixed(pick(r, [0, 1, 3])));
      lines.push({
        description: `Position ${i + 1}`,
        quantity: qty || 1,
        unit: pick(r, ["C62", "HUR", "DAY", "KGM"]),
        netPrice: price,
        vatRate: rate,
        vatCategory: cat,
      });
    }
    const base: InvoiceInput = {
      ...REFERENCE,
      number: `R-${seed}`,
      buyerReference: pick(r, ["04011000-12345-03", "991-33333-62", "Bestellung 4711"]),
      lines,
    };
    if (r() < 0.5) base.dueDate = "2026-09-30";
    else base.dueDate = undefined as unknown as string;
    if (exempt) base.vatExemption = { reason: "Steuerbefreit nach § 4 UStG" };
    if (r() < 0.3) base.notes = ["Vielen Dank für Ihren Auftrag."];
    return base;
  }

  it("all 50 pass the full pipeline including plausibility", async () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 50; seed++) {
      const input = randomInput(seed);
      const r = await generateInvoice(input, { plausibility: { today: TODAY } });
      if (!r.valid || !r.plausible) {
        failures.push(
          `seed ${seed}: ${r.findings
            .filter((f) => f.severity !== "info")
            .map((f) => `${f.ruleId} ${f.message}`)
            .join(" | ")}`,
        );
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it("seeds 1–10 also pass as ZUGFeRD PDF/A-3 (EN16931 / BASIC alternating) with a clean round trip", async () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const r = await generateInvoice(randomInput(seed), {
        target: "zugferd-pdf",
        zugferdProfile: seed % 2 ? "EN16931" : "BASIC",
        now: TODAY,
        plausibility: { today: TODAY },
      });
      const errors = r.findings.filter((f) => isErrorLevel(f));
      if (!r.valid || !r.pdf || errors.length)
        failures.push(`seed ${seed}: ${errors.map((f) => `${f.ruleId} ${f.message}`).join(" | ")}`);
    }
    expect(failures).toEqual([]);
  }, 120_000);
});
