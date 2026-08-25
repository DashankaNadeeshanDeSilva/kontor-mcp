import { Decimal } from "decimal.js";
import type { Finding, FindingSeverity } from "../finding.js";
import type { InvoiceModel } from "../model/schema.js";
import { finding } from "./catalogue.js";

/** Commercial rounding (kaufmännisch) to cents, as used by German invoicing practice. */
const D = Decimal.clone({ rounding: Decimal.ROUND_HALF_UP, precision: 40 });
type Dec = InstanceType<typeof D>;

const ZERO = new D(0);
const CENT = new D("0.01");

/** Parse an amount string; undefined for absent or non-numeric values (XSD reports those). */
function dec(v: string | undefined): Dec | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  try {
    const d = new D(v.trim());
    return d.isFinite() ? d : undefined;
  } catch {
    return undefined;
  }
}
const fmt = (d: Dec) => d.toFixed(2);
const round2 = (d: Dec) => d.toDecimalPlaces(2);
const sum = (xs: (Dec | undefined)[]) => xs.reduce<Dec>((acc, x) => (x ? acc.plus(x) : acc), ZERO);

/**
 * Severity for a recomputation difference: exact match → none; one cent → warning (legitimate
 * rounding difference); more → error.
 */
function deltaSeverity(delta: Dec): FindingSeverity | undefined {
  const abs = delta.abs();
  if (abs.isZero()) return undefined;
  return abs.lte(CENT) ? "warning" : "error";
}

/** Group key for VAT breakdown matching: category + normalised rate ("S|19"). */
function vatKey(category: string, rate: string | undefined): string {
  const r = dec(rate) ?? ZERO;
  return `${category.trim()}|${r.toString()}`;
}

export function checkTotals(m: InvoiceModel): Finding[] {
  const out: Finding[] = [];

  // --- lines: BT-131 = qty × price ÷ baseQty − allowances + charges ---------------------
  m.lines.forEach((line, i) => {
    const qty = dec(line.quantity);
    const price = dec(line.price.netPrice);
    const declared = dec(line.netAmount);
    if (!qty || !price || !declared) return;
    const baseQty = dec(line.price.baseQuantity) ?? new D(1);
    if (baseQty.isZero()) return;
    const gross = qty.times(price).div(baseQty);
    const allowances = sum((line.allowances ?? []).map((a) => dec(a.amount)));
    const charges = sum((line.charges ?? []).map((c) => dec(c.amount)));
    const expected = round2(gross.minus(allowances).plus(charges));
    const delta = declared.minus(expected);
    const sev = deltaSeverity(delta);
    if (sev) {
      out.push(
        finding(
          "KONTOR-PLAUS-LINE-NET",
          `Line ${i + 1} net amount ${fmt(declared)} differs from computed ${fmt(expected)} (${line.quantity} × ${line.price.netPrice}) by ${fmt(delta.abs())}`,
          `/lines/${i}/netAmount`,
          ["BT-131", "BT-129", "BT-146"],
          sev,
        ),
      );
    }
  });

  const t = m.totals;
  const lineExt = dec(t.lineExtension);
  const lineSum = sum(m.lines.map((l) => dec(l.netAmount)));
  if (lineExt && !lineExt.eq(lineSum)) {
    out.push(
      finding(
        "KONTOR-PLAUS-SUM-LINES",
        `Sum of line net amounts ${fmt(lineSum)} ≠ declared BT-106 ${fmt(lineExt)} (difference ${fmt(lineExt.minus(lineSum).abs())})`,
        "/totals/lineExtension",
        ["BT-106", "BT-131"],
      ),
    );
  }

  const allowanceTotal = dec(t.allowanceTotal) ?? ZERO;
  const chargeTotal = dec(t.chargeTotal) ?? ZERO;
  const taxExcl = dec(t.taxExclusive);
  if (lineExt && taxExcl) {
    const expected = lineExt.minus(allowanceTotal).plus(chargeTotal);
    if (!taxExcl.eq(expected)) {
      out.push(
        finding(
          "KONTOR-PLAUS-SUM-TAXEXCL",
          `BT-109 ${fmt(taxExcl)} ≠ BT-106 ${fmt(lineExt)} − BT-107 ${fmt(allowanceTotal)} + BT-108 ${fmt(chargeTotal)} = ${fmt(expected)}`,
          "/totals/taxExclusive",
          ["BT-109", "BT-106", "BT-107", "BT-108"],
        ),
      );
    }
  }

  const breakdownVat = sum(m.vatBreakdown.map((b) => dec(b.taxAmount)));
  const taxAmount = dec(t.taxAmount);
  if (taxAmount && !taxAmount.eq(breakdownVat)) {
    out.push(
      finding(
        "KONTOR-PLAUS-VAT-TOTAL",
        `Total VAT BT-110 ${fmt(taxAmount)} ≠ sum of breakdown VAT amounts ${fmt(breakdownVat)}`,
        "/totals/taxAmount",
        ["BT-110", "BT-117"],
      ),
    );
  }

  const taxIncl = dec(t.taxInclusive);
  if (taxExcl && taxIncl) {
    const vat = taxAmount ?? breakdownVat;
    const expected = taxExcl.plus(vat);
    if (!taxIncl.eq(expected)) {
      out.push(
        finding(
          "KONTOR-PLAUS-SUM-TAXINCL",
          `BT-112 ${fmt(taxIncl)} ≠ BT-109 ${fmt(taxExcl)} + BT-110 ${fmt(vat)} = ${fmt(expected)}`,
          "/totals/taxInclusive",
          ["BT-112", "BT-109", "BT-110"],
        ),
      );
    }
  }

  const payable = dec(t.payable);
  if (taxIncl && payable) {
    const paid = dec(t.paid) ?? ZERO;
    const rounding = dec(t.rounding) ?? ZERO;
    const expected = taxIncl.minus(paid).plus(rounding);
    if (!payable.eq(expected)) {
      out.push(
        finding(
          "KONTOR-PLAUS-SUM-PAYABLE",
          `BT-115 ${fmt(payable)} ≠ BT-112 ${fmt(taxIncl)} − BT-113 ${fmt(paid)} + BT-114 ${fmt(rounding)} = ${fmt(expected)} (difference ${fmt(payable.minus(expected).abs())})`,
          "/totals/payable",
          ["BT-115", "BT-112", "BT-113", "BT-114"],
        ),
      );
    }
  }
  return out;
}

const ZERO_RATE_CATEGORIES = new Set(["Z", "E", "AE", "K", "G", "O"]);
const DE_RATES = ["19", "7"].map((r) => new D(r));
const DE_HISTORIC_2020 = ["16", "5"].map((r) => new D(r));
/** Temporary German rates of the 2020 stimulus package applied to invoices issued 1 Jul–31 Dec 2020. */
const inH2_2020 = (issueDate: string) => issueDate >= "2020-07-01" && issueDate <= "2020-12-31";

export function checkVat(m: InvoiceModel): Finding[] {
  const out: Finding[] = [];
  const sellerIsDE = m.seller.postalAddress?.countryCode?.trim().toUpperCase() === "DE";
  const allowedDeRates = inH2_2020(m.issueDate.trim())
    ? [...DE_RATES, ...DE_HISTORIC_2020]
    : DE_RATES;

  // Net amounts per category/rate group across lines and document-level allowances/charges.
  const groupNet = new Map<string, Dec>();
  const add = (key: string, v: Dec | undefined, sign: 1 | -1) => {
    if (!v) return;
    groupNet.set(key, (groupNet.get(key) ?? ZERO).plus(sign === 1 ? v : v.neg()));
  };
  for (const line of m.lines)
    add(vatKey(line.vat.categoryCode, line.vat.rate), dec(line.netAmount), 1);
  for (const a of m.allowances ?? []) add(vatKey(a.vatCategoryCode, a.vatRate), dec(a.amount), -1);
  for (const c of m.charges ?? []) add(vatKey(c.vatCategoryCode, c.vatRate), dec(c.amount), 1);

  m.vatBreakdown.forEach((b, i) => {
    const category = b.categoryCode.trim();
    const rate = dec(b.rate);
    const taxable = dec(b.taxableAmount);
    const taxAmount = dec(b.taxAmount);
    const loc = `/vatBreakdown/${i}`;
    const label = `${category}/${rate ? rate.toString() : "–"} %`;

    // category ↔ rate consistency
    if (ZERO_RATE_CATEGORIES.has(category) && rate && !rate.isZero()) {
      out.push(
        finding(
          "KONTOR-PLAUS-VAT-CATEGORY-RATE",
          `VAT category ${category} must carry 0 %, found ${rate.toString()} %`,
          `${loc}/rate`,
          ["BT-118", "BT-119"],
        ),
      );
    } else if (category === "S" && rate && rate.isZero()) {
      out.push(
        finding(
          "KONTOR-PLAUS-VAT-CATEGORY-RATE",
          "VAT category S (standard rate) must carry a rate greater than 0 %",
          `${loc}/rate`,
          ["BT-118", "BT-119"],
        ),
      );
    } else if (
      sellerIsDE &&
      category === "S" &&
      rate?.gt(0) &&
      !allowedDeRates.some((r) => r.eq(rate))
    ) {
      const historic = DE_HISTORIC_2020.some((r) => r.eq(rate));
      out.push(
        finding(
          "KONTOR-PLAUS-VAT-RATE-DE",
          historic
            ? `Rate ${rate.toString()} % was the temporary German rate of 1 Jul–31 Dec 2020 and is no longer valid`
            : `Rate ${rate.toString()} % is not a current German standard/reduced rate (19 % / 7 %)`,
          `${loc}/rate`,
          ["BT-119", "BT-40"],
        ),
      );
    }

    // taxable amount = Σ net of the group
    if (taxable) {
      const expected = groupNet.get(vatKey(category, b.rate)) ?? ZERO;
      if (!taxable.eq(expected)) {
        out.push(
          finding(
            "KONTOR-PLAUS-VAT-BREAKDOWN-BASE",
            `Taxable amount ${fmt(taxable)} for ${label} ≠ sum of line nets (± document allowances/charges) ${fmt(expected)}`,
            `${loc}/taxableAmount`,
            ["BT-116", "BT-131"],
          ),
        );
      }
    }

    // VAT amount = taxable × rate, rounded half-up to cents
    if (taxable && taxAmount && rate) {
      const expected = round2(taxable.times(rate).div(100));
      const delta = taxAmount.minus(expected);
      const sev = deltaSeverity(delta);
      if (sev) {
        out.push(
          finding(
            "KONTOR-PLAUS-VAT-BREAKDOWN-AMOUNT",
            `VAT amount ${fmt(taxAmount)} for ${label} differs from computed ${fmt(expected)} (${fmt(taxable)} × ${rate.toString()} %) by ${fmt(delta.abs())}`,
            `${loc}/taxAmount`,
            ["BT-117", "BT-116", "BT-119"],
            sev,
          ),
        );
      }
    }
  });
  return out;
}
