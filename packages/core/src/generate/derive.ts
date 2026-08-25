import { Decimal } from "decimal.js";
import type { InvoiceInputParsed } from "./input.js";

const D = Decimal.clone({ rounding: Decimal.ROUND_HALF_UP, precision: 40 });
type Dec = InstanceType<typeof D>;
const round2 = (d: Dec) => d.toDecimalPlaces(2);

export interface DerivedLine {
  index: number;
  quantity: string;
  netPrice: string;
  netAmount: string; // BT-131, 2 decimals
  vatCategory: string;
  vatRate: string; // e.g. "19", "7", "0"
}
export interface DerivedBreakdown {
  categoryCode: string;
  rate: string;
  taxableAmount: string;
  taxAmount: string;
}
export interface Derived {
  lines: DerivedLine[];
  breakdown: DerivedBreakdown[];
  totals: {
    lineExtension: string;
    taxExclusive: string;
    taxAmount: string;
    taxInclusive: string;
    payable: string;
  };
}

/** Deterministic, decimal-safe derivation of all amounts (the inverse of the plausibility checks). */
export function deriveAmounts(input: InvoiceInputParsed): Derived {
  const lines: DerivedLine[] = input.lines.map((l, index) => {
    const qty = new D(l.quantity);
    const price = new D(l.netPrice);
    const rate = new D(l.vatRate ?? (l.vatCategory === "S" ? 19 : 0));
    return {
      index,
      quantity: qty.toString(),
      netPrice: price.toString(),
      netAmount: round2(qty.times(price)).toFixed(2),
      vatCategory: l.vatCategory,
      vatRate: rate.toString(),
    };
  });

  const groups = new Map<string, { categoryCode: string; rate: Dec; taxable: Dec }>();
  for (const l of lines) {
    const key = `${l.vatCategory}|${l.vatRate}`;
    const g = groups.get(key) ?? {
      categoryCode: l.vatCategory,
      rate: new D(l.vatRate),
      taxable: new D(0),
    };
    g.taxable = g.taxable.plus(l.netAmount);
    groups.set(key, g);
  }
  const breakdown: DerivedBreakdown[] = [...groups.values()].map((g) => ({
    categoryCode: g.categoryCode,
    rate: g.rate.toString(),
    taxableAmount: g.taxable.toFixed(2),
    // Only the standard category carries tax; Z/E/AE/K/G are 0 by definition (BR-Z-09, BR-E-09, …).
    taxAmount:
      g.categoryCode === "S" ? round2(g.taxable.times(g.rate).div(100)).toFixed(2) : "0.00",
  }));

  const lineExtension = lines.reduce((acc, l) => acc.plus(l.netAmount), new D(0));
  const taxAmount = breakdown.reduce((acc, b) => acc.plus(b.taxAmount), new D(0));
  const taxInclusive = lineExtension.plus(taxAmount);
  return {
    lines,
    breakdown,
    totals: {
      lineExtension: lineExtension.toFixed(2),
      taxExclusive: lineExtension.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      taxInclusive: taxInclusive.toFixed(2),
      payable: taxInclusive.toFixed(2),
    },
  };
}
