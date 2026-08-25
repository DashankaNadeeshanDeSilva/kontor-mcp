import type { Finding } from "../finding.js";
import type { InvoiceModel } from "../model/schema.js";
import { finding } from "./catalogue.js";
import { checkDates } from "./dates.js";
import { checkBankAccounts, checkLeitwegId, checkTaxIdentifiers } from "./identifiers.js";
import { checkTotals, checkVat } from "./money.js";

export { CATALOGUE, type PlausibilityRuleId } from "./catalogue.js";
export { leitwegCheckDigits } from "./identifiers.js";

export interface PlausibilityOptions {
  /** Invoice numbers already known to the caller; a match yields KONTOR-PLAUS-DUPLICATE. */
  knownInvoiceNumbers?: string[];
  /** Reference date for date checks (default: now). */
  today?: Date;
  /** Days an issue date may lie in the future before it is flagged (default 1). */
  futureToleranceDays?: number;
}

/**
 * Layer 3 — plausibility checks on the parsed semantic model (PRD §5.2). Pure and synchronous:
 * no I/O, no network. Findings never change the official validation verdict.
 */
export function runPlausibility(model: InvoiceModel, options: PlausibilityOptions = {}): Finding[] {
  const out: Finding[] = [
    ...checkTotals(model),
    ...checkVat(model),
    ...checkBankAccounts(model),
    ...checkTaxIdentifiers(model),
    ...checkLeitwegId(model),
    ...checkDates(model, {
      today: options.today ?? new Date(),
      futureToleranceDays: options.futureToleranceDays ?? 1,
    }),
  ];
  const known = new Set((options.knownInvoiceNumbers ?? []).map((n) => n.trim()));
  if (known.has(model.number.trim())) {
    out.push(
      finding(
        "KONTOR-PLAUS-DUPLICATE",
        `Invoice number ${model.number.trim()} is already known to the caller`,
        "/number",
        ["BT-1"],
      ),
    );
  }
  return out;
}
