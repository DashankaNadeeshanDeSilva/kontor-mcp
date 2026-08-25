import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InvoiceModelSchema, toAnnotatedJson } from "../src/model/index.js";
import { parseInvoice } from "../src/parse/index.js";

const spike = (name: string) =>
  readFileSync(new URL(`../../../fixtures/spike/${name}`, import.meta.url));

describe("parseInvoice — UBL", () => {
  const { format, invoice } = parseInvoice(spike("valid-ubl.xml"));

  it("detects format and extracts document-level BTs", () => {
    expect(format.syntax).toBe("ubl-invoice");
    expect(invoice.number).toBe("123456XX");
    expect(invoice.issueDate).toBe("2016-04-04");
    expect(invoice.typeCode).toBe("380");
    expect(invoice.currency).toBe("EUR");
    expect(invoice.buyerReference).toBe("04011000-12345-03");
    expect(invoice.specificationIdentifier).toContain("xrechnung_3.0");
  });

  it("extracts parties, lines, totals and VAT breakdown", () => {
    expect(invoice.seller.name).toBe("[Seller name]");
    expect(invoice.seller.postalAddress?.countryCode).toBe("DE");
    expect(invoice.seller.electronicAddress?.value).toBeDefined();
    expect(invoice.lines).toHaveLength(2);
    expect(invoice.lines[0]?.netAmount).toBe("288.79");
    expect(invoice.lines[0]?.quantity).toBe("1");
    expect(invoice.lines[0]?.quantityUnitCode).toBe("XPP");
    expect(invoice.lines[0]?.vat.categoryCode).toBe("S");
    expect(invoice.lines[0]?.vat.rate).toBe("7");
    expect(invoice.lines[0]?.item.classificationIds?.[0]).toMatchObject({
      value: "0721-880X",
      listId: "IB",
    });
    expect(invoice.totals.payable).toBe("336.9");
    expect(invoice.vatBreakdown[0]).toMatchObject({ categoryCode: "S", rate: "7" });
  });

  it("validates against the Zod mirror", () => {
    expect(InvoiceModelSchema.parse(invoice)).toEqual(invoice);
  });

  it("projects to the PRD §5.3 annotated JSON shape", () => {
    const j = toAnnotatedJson(invoice) as Record<string, unknown>;
    expect(j.number).toEqual({ bt: "BT-1", value: "123456XX" });
    expect((j.seller as Record<string, unknown>).bg).toBe("BG-4");
    expect(((j.totals as Record<string, unknown>).payable as Record<string, unknown>).bt).toBe(
      "BT-115",
    );
  });
});

describe("parseInvoice — CII", () => {
  it("normalises CII dates (format 102) to ISO", () => {
    const { invoice } = parseInvoice(spike("valid-cii.xml"));
    expect(invoice.issueDate).toBe("2016-04-04");
    expect(invoice.lines[0]?.period?.start).toBe("2016-01-01");
  });

  it("yields the same semantic model as the UBL twin", () => {
    const ubl = parseInvoice(spike("valid-ubl.xml")).invoice;
    const cii = parseInvoice(spike("valid-cii.xml")).invoice;
    expect(cii).toEqual(ubl);
  });
});

/**
 * Task 1.3 AC: every UBL/CII pair of the official XRechnung test suite parses to deep-equal models.
 * Syntax-specific fringe that legitimately differs between the twins is normalised via `fringe` below and
 * documented in docs/BT-COVERAGE.md.
 */
describe("parseInvoice — official test-suite twins", () => {
  const root = new URL(
    "../../../fixtures/_downloads/xrechnung-testsuite/instances/",
    import.meta.url,
  );
  let pairs: Array<[string, string, string]> = [];
  try {
    for (const dir of readdirSync(root)) {
      const files = readdirSync(new URL(`${dir}/`, root));
      for (const f of files) {
        if (f.endsWith("_ubl.xml")) {
          const twin = f.replace("_ubl.xml", "_uncefact.xml");
          if (files.includes(twin)) pairs.push([dir, f, twin]);
        }
      }
    }
  } catch {
    pairs = [];
  }
  it.skipIf(pairs.length === 0)("finds twin pairs", () => expect(pairs.length).toBeGreaterThan(20));
  for (const [dir, u, c] of pairs) {
    it(`${dir}/${u} ≡ ${c}`, () => {
      const ubl = parseInvoice(readFileSync(new URL(`${dir}/${u}`, root))).invoice;
      const cii = parseInvoice(readFileSync(new URL(`${dir}/${c}`, root))).invoice;
      const skip = TWIN_DATA_DIFFERENCES[u] ?? [];
      expect(fringe(cii, skip)).toEqual(fringe(ubl, skip));
    });
  }
});

/**
 * Twin instances whose *source data* differs (verified by hand against the XML; not mapping errors).
 * Keep in sync with docs/BT-COVERAGE.md "Twin fringe".
 */
const TWIN_DATA_DIFFERENCES: Record<string, string[]> = {
  "01.02a-INVOICE_ubl.xml": ["purchaseOrderReference"],
  "01.08a-INVOICE_ubl.xml": ["purchaseOrderReference"],
  "01.09a-INVOICE_ubl.xml": ["purchaseOrderReference"],
  "01.10a-INVOICE_ubl.xml": ["purchaseOrderReference"],
  "01.11a-INVOICE_ubl.xml": ["purchaseOrderReference"],
  "01.12a-INVOICE_ubl.xml": ["purchaseOrderReference"],
  "01.13a-INVOICE_ubl.xml": ["purchaseOrderReference"],
  "01.20a-INVOICE_ubl.xml": ["seller.postalAddress.line1", "seller.postalAddress.city"],
  "01.21a-INVOICE_ubl.xml": [
    "seller.vatId",
    "paymentInstructions.meansText",
    "vatBreakdown[].exemptionReason",
  ],
  "03.01a-INVOICE_ubl.xml": ["buyer.tradingName"],
  "03.06a-INVOICE_ubl.xml": [
    "seller.postalAddress.city",
    "seller.postalAddress.postCode",
    "buyer.postalAddress.city",
    "buyer.postalAddress.postCode",
  ],
  "03.07a-INVOICE_ubl.xml": ["seller.identifiers", "payee.legalRegistrationId"],
};

const NUMERIC = /^-?\d+(\.\d+)?$/;
/** Optional amounts that one syntax writes as an explicit 0 and the other omits. */
const ZERO_OPTIONAL = new Set([
  "totals.rounding",
  "totals.allowanceTotal",
  "totals.chargeTotal",
  "totals.paid",
]);

/**
 * Normalise syntax-inherent twin differences: numeric formatting ("19" vs "19.00"), explicit-zero optional totals,
 * and the per-file source-data allowlist above.
 */
function fringe(m: unknown, skip: string[], path = ""): unknown {
  if (Array.isArray(m)) return m.map((v) => fringe(v, skip, `${path}[]`));
  if (m !== null && typeof m === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(m)) {
      const p = path ? `${path}.${k}` : k;
      if (skip.includes(p)) continue;
      if (ZERO_OPTIONAL.has(p) && typeof v === "string" && Number(v) === 0) continue;
      out[k] = fringe(v, skip, p);
    }
    return out;
  }
  if (typeof m === "string" && NUMERIC.test(m)) return String(Number(m));
  return m;
}
