import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseInvoice } from "../src/index.js";
import { type PlausibilityOptions, runPlausibility } from "../src/plausibility/index.js";

/**
 * Task 2.1 AC: every fixture triggers exactly its intended finding and nothing else on an
 * otherwise-valid invoice. Fixtures are derived from the KoSIT sample (fixtures/spike/valid-ubl.xml)
 * by minimal, explicit string mutations so each case documents precisely what is wrong.
 */
const spike = (name: string) =>
  readFileSync(new URL(`../../../fixtures/spike/${name}`, import.meta.url), "utf8");
const BASE = spike("valid-ubl.xml");
const TODAY = new Date("2016-04-05T12:00:00Z"); // base issue date is 2016-04-04

type Mutation = [from: string, to: string, all?: boolean];
function mutate(xml: string, mutations: Mutation[]): string {
  let out = xml;
  for (const [from, to, all] of mutations) {
    if (!out.includes(from)) throw new Error(`fixture anchor not found: ${from}`);
    out = all ? out.split(from).join(to) : out.replace(from, to);
  }
  return out;
}

function findings(xml: string, opts: PlausibilityOptions = {}) {
  const { invoice } = parseInvoice(xml);
  return runPlausibility(invoice, { today: TODAY, ...opts });
}
const ids = (xml: string, opts?: PlausibilityOptions) => findings(xml, opts).map((f) => f.ruleId);

// ---- shared mutations ----------------------------------------------------------------
// BT-110 (TaxTotal) precedes BT-117 (TaxSubtotal) in the document, so replace-first hits BT-110.
const TAX_AMOUNT = '<cbc:TaxAmount currencyID="EUR">22.04</cbc:TaxAmount>';
const TAX_INCL = '<cbc:TaxInclusiveAmount currencyID="EUR">336.9</cbc:TaxInclusiveAmount>';
const PAYABLE = '<cbc:PayableAmount currencyID="EUR">336.9</cbc:PayableAmount>';
const TAX_EXCL = '<cbc:TaxExclusiveAmount currencyID="EUR">314.86</cbc:TaxExclusiveAmount>';
const TAXABLE = '<cbc:TaxableAmount currencyID="EUR">314.86</cbc:TaxableAmount>';
const IBAN = "<cbc:ID>DE75512108001245126199</cbc:ID>";
const setTaxAndTotals = (tax: string, incl: string): Mutation[] => [
  [TAX_AMOUNT, TAX_AMOUNT.replace("22.04", tax), true],
  [TAX_INCL, TAX_INCL.replace("336.9", incl)],
  [PAYABLE, PAYABLE.replace("336.9", incl)],
];

describe("plausibility layer — clean invoices", () => {
  it("reports nothing on the KoSIT UBL sample", () => {
    expect(ids(BASE)).toEqual([]);
  });
  it("reports nothing on the KoSIT CII sample", () => {
    expect(ids(spike("valid-cii.xml"))).toEqual([]);
  });
  it("every finding carries source, location, bt and bilingual explanation/fixHint", () => {
    const all = findings(mutate(BASE, [[PAYABLE, PAYABLE.replace("336.9", "336.80")]]));
    expect(all).toHaveLength(1);
    const f = all[0];
    expect(f.source).toBe("plausibility");
    expect(f.location).toBe("/totals/payable");
    expect(f.bt).toContain("BT-115");
    expect(f.explanation?.de).toBeTruthy();
    expect(f.explanation?.en).toBeTruthy();
    expect(f.fixHint?.de).toBeTruthy();
    expect(f.fixHint?.en).toBeTruthy();
  });
});

describe("plausibility layer — totals (decimal recompute)", () => {
  it("KONTOR-PLAUS-LINE-NET: line net ≠ quantity × price", () => {
    const xml = mutate(BASE, [
      [
        '<cbc:PriceAmount currencyID="EUR">26.07</cbc:PriceAmount>',
        '<cbc:PriceAmount currencyID="EUR">26.00</cbc:PriceAmount>',
      ],
    ]);
    const [f, ...rest] = findings(xml);
    expect(rest).toEqual([]);
    expect(f.ruleId).toBe("KONTOR-PLAUS-LINE-NET");
    expect(f.severity).toBe("error");
    expect(f.location).toBe("/lines/1/netAmount");
    expect(f.message).toContain("26.07");
    expect(f.message).toContain("26.00");
  });

  it("KONTOR-PLAUS-SUM-LINES: BT-106 ≠ Σ line nets", () => {
    // line 2 becomes 26.09 (consistent price + breakdown), but the declared line total stays 314.86
    const xml = mutate(BASE, [
      [
        '<cbc:LineExtensionAmount currencyID="EUR">26.07</cbc:LineExtensionAmount>',
        '<cbc:LineExtensionAmount currencyID="EUR">26.09</cbc:LineExtensionAmount>',
      ],
      [
        '<cbc:PriceAmount currencyID="EUR">26.07</cbc:PriceAmount>',
        '<cbc:PriceAmount currencyID="EUR">26.09</cbc:PriceAmount>',
      ],
      [TAXABLE, TAXABLE.replace("314.86", "314.88")],
    ]);
    const [f, ...rest] = findings(xml);
    expect(rest).toEqual([]);
    expect(f.ruleId).toBe("KONTOR-PLAUS-SUM-LINES");
    expect(f.message).toContain("314.88");
  });

  it("KONTOR-PLAUS-SUM-TAXEXCL: BT-109 ≠ BT-106 − BT-107 + BT-108", () => {
    const xml = mutate(BASE, [
      [TAX_EXCL, TAX_EXCL.replace("314.86", "314.96")],
      [TAX_INCL, TAX_INCL.replace("336.9", "337.00")],
      [PAYABLE, PAYABLE.replace("336.9", "337.00")],
    ]);
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-SUM-TAXEXCL"]);
  });

  it("KONTOR-PLAUS-SUM-TAXINCL: BT-112 ≠ BT-109 + BT-110", () => {
    const xml = mutate(BASE, [
      [TAX_INCL, TAX_INCL.replace("336.9", "337.00")],
      [PAYABLE, PAYABLE.replace("336.9", "337.00")],
    ]);
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-SUM-TAXINCL"]);
  });

  it("KONTOR-PLAUS-SUM-PAYABLE: BT-115 ≠ BT-112 − BT-113 + BT-114", () => {
    const xml = mutate(BASE, [[PAYABLE, PAYABLE.replace("336.9", "336.80")]]);
    const [f] = findings(xml);
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-SUM-PAYABLE"]);
    expect(f.message).toContain("0.10");
  });
});

describe("plausibility layer — VAT breakdown", () => {
  it("KONTOR-PLAUS-VAT-BREAKDOWN-BASE: taxable amount ≠ Σ line nets of that category/rate", () => {
    const xml = mutate(BASE, [[TAXABLE, TAXABLE.replace("314.86", "314.80")]]); // 314.80 × 7 % still rounds to 22.04
    const [f] = findings(xml);
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-VAT-BREAKDOWN-BASE"]);
    expect(f.location).toBe("/vatBreakdown/0/taxableAmount");
  });

  it("KONTOR-PLAUS-VAT-BREAKDOWN-AMOUNT: VAT off by €0.02 is an error (the official rule tolerates ±1)", () => {
    const xml = mutate(BASE, setTaxAndTotals("22.06", "336.92"));
    const [f, ...rest] = findings(xml);
    expect(rest).toEqual([]);
    expect(f.ruleId).toBe("KONTOR-PLAUS-VAT-BREAKDOWN-AMOUNT");
    expect(f.severity).toBe("error");
    expect(f.message).toContain("22.06");
    expect(f.message).toContain("22.04");
    expect(f.message).toContain("0.02");
  });

  it("KONTOR-PLAUS-VAT-BREAKDOWN-AMOUNT: VAT off by €0.01 is only a warning (rounding difference)", () => {
    const xml = mutate(BASE, setTaxAndTotals("22.05", "336.91"));
    const [f, ...rest] = findings(xml);
    expect(rest).toEqual([]);
    expect(f.ruleId).toBe("KONTOR-PLAUS-VAT-BREAKDOWN-AMOUNT");
    expect(f.severity).toBe("warning");
  });

  it("KONTOR-PLAUS-VAT-TOTAL: BT-110 ≠ Σ BT-117", () => {
    const xml = mutate(BASE, [
      [TAX_AMOUNT, TAX_AMOUNT.replace("22.04", "22.14")],
      [TAX_INCL, TAX_INCL.replace("336.9", "337.00")],
      [PAYABLE, PAYABLE.replace("336.9", "337.00")],
    ]);
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-VAT-TOTAL"]);
  });

  it("KONTOR-PLAUS-VAT-RATE-DE: German seller with 15 % standard rate", () => {
    const xml = mutate(BASE, [
      ["<cbc:Percent>7</cbc:Percent>", "<cbc:Percent>15</cbc:Percent>", true],
      ...setTaxAndTotals("47.23", "362.09"), // 314.86 × 15 % = 47.229
    ]);
    const [f] = findings(xml);
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-VAT-RATE-DE"]);
    expect(f.severity).toBe("warning");
    expect(f.message).toContain("15");
  });

  it("KONTOR-PLAUS-VAT-RATE-DE: 16 % is flagged as the historic 2020 rate", () => {
    const xml = mutate(BASE, [
      ["<cbc:Percent>7</cbc:Percent>", "<cbc:Percent>16</cbc:Percent>", true],
      ...setTaxAndTotals("50.38", "365.24"), // 314.86 × 16 % = 50.3776
    ]);
    const [f] = findings(xml);
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-VAT-RATE-DE"]);
    expect(f.message).toMatch(/2020/);
  });

  it("KONTOR-PLAUS-VAT-CATEGORY-RATE: category E must carry 0 %", () => {
    const xml = mutate(BASE, [["<cbc:ID>S</cbc:ID>", "<cbc:ID>E</cbc:ID>", true]]);
    const [f] = findings(xml);
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-VAT-CATEGORY-RATE"]);
    expect(f.severity).toBe("error");
    expect(f.location).toBe("/vatBreakdown/0/rate");
  });

  it("KONTOR-PLAUS-VAT-CATEGORY-RATE: category S with 0 % (and no extra RATE-DE noise)", () => {
    const xml = mutate(BASE, [
      ["<cbc:Percent>7</cbc:Percent>", "<cbc:Percent>0</cbc:Percent>", true],
      ...setTaxAndTotals("0.00", "314.86"),
    ]);
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-VAT-CATEGORY-RATE"]);
  });
});

describe("plausibility layer — identifiers", () => {
  it("KONTOR-PLAUS-IBAN: mod-97 checksum failure", () => {
    const xml = mutate(BASE, [[IBAN, "<cbc:ID>DE75512108001245126190</cbc:ID>"]]);
    const [f] = findings(xml);
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-IBAN"]);
    expect(f.severity).toBe("error");
    expect(f.location).toBe("/paymentInstructions/creditTransfers/0/account");
    expect(f.bt).toEqual(["BT-84"]);
  });

  it("KONTOR-PLAUS-BIC: malformed BIC", () => {
    const xml = mutate(BASE, [
      [
        IBAN,
        `${IBAN}\n            <cac:FinancialInstitutionBranch><cbc:ID>DEUT</cbc:ID></cac:FinancialInstitutionBranch>`,
      ],
    ]);
    // sanity: the mutation must yield a single credit transfer with both fields
    expect(parseInvoice(xml).invoice.paymentInstructions?.creditTransfers?.[0]?.bic).toBe("DEUT");
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-BIC"]);
  });

  it("KONTOR-PLAUS-BIC-COUNTRY: BIC country differs from IBAN country (info)", () => {
    const xml = mutate(BASE, [
      [
        IBAN,
        `${IBAN}\n            <cac:FinancialInstitutionBranch><cbc:ID>BARCGB22</cbc:ID></cac:FinancialInstitutionBranch>`,
      ],
    ]);
    const [f] = findings(xml);
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-BIC-COUNTRY"]);
    expect(f.severity).toBe("info");
    expect(f.message).toContain("GB");
  });

  it("KONTOR-PLAUS-VATID: German VAT ID with 8 digits (spaces are tolerated)", () => {
    const xml = mutate(BASE, [
      ["<cbc:CompanyID>DE 123456789</cbc:CompanyID>", "<cbc:CompanyID>DE 12345678</cbc:CompanyID>"],
    ]);
    const [f] = findings(xml);
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-VATID"]);
    expect(f.severity).toBe("error");
    expect(f.location).toBe("/seller/vatId");
    expect(f.bt).toEqual(["BT-31"]);
  });

  it("KONTOR-PLAUS-VATID: unknown country prefix is a warning", () => {
    const xml = mutate(BASE, [
      ["<cbc:CompanyID>DE 123456789</cbc:CompanyID>", "<cbc:CompanyID>XX123456789</cbc:CompanyID>"],
    ]);
    const [f] = findings(xml);
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-VATID"]);
    expect(f.severity).toBe("warning");
  });

  it("KONTOR-PLAUS-STEUERNUMMER: implausible German tax number", () => {
    const xml = mutate(BASE, [
      [
        "</cac:PartyTaxScheme>",
        "</cac:PartyTaxScheme><cac:PartyTaxScheme><cbc:CompanyID>12/345</cbc:CompanyID><cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>",
      ],
    ]);
    const [f] = findings(xml);
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-STEUERNUMMER"]);
    expect(f.severity).toBe("warning");
    expect(f.bt).toEqual(["BT-32"]);
  });

  it("Steuernummer in state (123/456/78901) and federal 13-digit formats pass", () => {
    for (const nr of ["123/456/78901", "12/345/67890", "1234567890123"]) {
      const xml = mutate(BASE, [
        [
          "</cac:PartyTaxScheme>",
          `</cac:PartyTaxScheme><cac:PartyTaxScheme><cbc:CompanyID>${nr}</cbc:CompanyID><cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`,
        ],
      ]);
      expect(ids(xml)).toEqual([]);
    }
  });
});

describe("plausibility layer — Leitweg-ID", () => {
  const ref = (v: string) =>
    mutate(BASE, [
      [
        "<cbc:BuyerReference>04011000-12345-03</cbc:BuyerReference>",
        `<cbc:BuyerReference>${v}</cbc:BuyerReference>`,
      ],
    ]);

  it("KONTOR-PLAUS-LEITWEG-CHECK: wrong ISO 7064 MOD 97-10 check digits", () => {
    const [f] = findings(ref("04011000-12345-04"));
    expect(ids(ref("04011000-12345-04"))).toEqual(["KONTOR-PLAUS-LEITWEG-CHECK"]);
    expect(f.severity).toBe("error");
    expect(f.location).toBe("/buyerReference");
    expect(f.bt).toEqual(["BT-10"]);
    expect(f.message).toContain("03"); // expected check digits
  });

  it("KONTOR-PLAUS-LEITWEG-FORMAT: fine-addressing part longer than 30 characters", () => {
    const xml = ref("04011000-1234567890123456789012345678901-03");
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-LEITWEG-FORMAT"]);
  });

  it("Leitweg-ID without fine addressing is validated too", () => {
    // 99133333 → ISO 7064 MOD 97-10 check digits 62 (98 − (99133333 × 100 mod 97))
    expect(ids(ref("991-33333-62"))).toEqual([]);
    expect(ids(ref("991-33333-63"))).toEqual(["KONTOR-PLAUS-LEITWEG-CHECK"]);
  });

  it("ordinary buyer references are not mistaken for Leitweg-IDs", () => {
    expect(ids(ref("Bestellung 4711"))).toEqual([]);
    expect(ids(ref("PO-2026-08"))).toEqual([]);
  });
});

describe("plausibility layer — dates", () => {
  it("KONTOR-PLAUS-DATE-FUTURE: issue date beyond tolerance", () => {
    const xml = mutate(BASE, [
      ["<cbc:IssueDate>2016-04-04</cbc:IssueDate>", "<cbc:IssueDate>2016-04-10</cbc:IssueDate>"],
    ]);
    const [f] = findings(xml);
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-DATE-FUTURE"]);
    expect(f.severity).toBe("warning");
    expect(f.bt).toEqual(["BT-2"]);
  });

  it("issue date of tomorrow is within the default tolerance", () => {
    const xml = mutate(BASE, [
      ["<cbc:IssueDate>2016-04-04</cbc:IssueDate>", "<cbc:IssueDate>2016-04-06</cbc:IssueDate>"],
    ]);
    expect(ids(xml)).toEqual([]);
  });

  it("KONTOR-PLAUS-DATE-DUE-BEFORE-ISSUE", () => {
    const xml = mutate(BASE, [
      ["<cbc:InvoiceTypeCode>", "<cbc:DueDate>2016-04-01</cbc:DueDate><cbc:InvoiceTypeCode>"],
    ]);
    const [f] = findings(xml);
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-DATE-DUE-BEFORE-ISSUE"]);
    expect(f.severity).toBe("error");
    expect(f.bt).toEqual(["BT-9", "BT-2"]);
  });

  it("KONTOR-PLAUS-DATE-PERIOD: line period ends before it starts", () => {
    const xml = mutate(BASE, [
      ["<cbc:EndDate>2016-12-31</cbc:EndDate>", "<cbc:EndDate>2015-12-31</cbc:EndDate>"],
    ]);
    const [f] = findings(xml);
    expect(ids(xml)).toEqual(["KONTOR-PLAUS-DATE-PERIOD"]);
    expect(f.location).toBe("/lines/0/period");
  });

  it("KONTOR-PLAUS-DATE-STALE: issue date more than a year ago (info)", () => {
    const [f] = findings(BASE, { today: new Date("2018-01-01T00:00:00Z") });
    expect(ids(BASE, { today: new Date("2018-01-01T00:00:00Z") })).toEqual([
      "KONTOR-PLAUS-DATE-STALE",
    ]);
    expect(f.severity).toBe("info");
  });
});

describe("plausibility layer — duplicates", () => {
  it("KONTOR-PLAUS-DUPLICATE: invoice number in the caller-provided list", () => {
    const opts = { knownInvoiceNumbers: ["RE-1", " 123456XX "] };
    const [f] = findings(BASE, opts);
    expect(ids(BASE, opts)).toEqual(["KONTOR-PLAUS-DUPLICATE"]);
    expect(f.severity).toBe("error");
    expect(f.bt).toEqual(["BT-1"]);
    expect(f.message).toContain("123456XX");
  });

  it("no finding when the list does not contain the number", () => {
    expect(ids(BASE, { knownInvoiceNumbers: ["RE-1"] })).toEqual([]);
  });
});
