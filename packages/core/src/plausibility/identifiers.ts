import { electronicFormatIBAN, isValidBIC, isValidIBAN } from "ibantools";
import type { Finding } from "../finding.js";
import type { InvoiceModel } from "../model/schema.js";
import { finding } from "./catalogue.js";

// ---- bank accounts -------------------------------------------------------------------------

function checkAccount(
  account: string,
  bic: string | undefined,
  loc: string,
  ibanBt: string,
  bicBt: string,
  out: Finding[],
): void {
  const iban = electronicFormatIBAN(account) ?? "";
  // Only IBAN-shaped values are checked; national account numbers (allowed by EN 16931) are left alone.
  const looksLikeIban = /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(iban);
  const ibanValid = looksLikeIban && isValidIBAN(iban);
  if (looksLikeIban && !ibanValid) {
    out.push(
      finding(
        "KONTOR-PLAUS-IBAN",
        `IBAN ${account.trim()} fails the mod-97 checksum or country length rule`,
        `${loc}/account`,
        [ibanBt],
      ),
    );
  }
  if (bic === undefined) return;
  const bicNorm = bic.replace(/\s+/g, "").toUpperCase();
  if (!isValidBIC(bicNorm)) {
    out.push(
      finding(
        "KONTOR-PLAUS-BIC",
        `BIC ${bic.trim()} is not a valid ISO 9362 code (8 or 11 characters)`,
        `${loc}/bic`,
        [bicBt],
      ),
    );
    return;
  }
  if (ibanValid && bicNorm.slice(4, 6) !== iban.slice(0, 2)) {
    out.push(
      finding(
        "KONTOR-PLAUS-BIC-COUNTRY",
        `BIC country ${bicNorm.slice(4, 6)} differs from IBAN country ${iban.slice(0, 2)}`,
        `${loc}/bic`,
        [bicBt, ibanBt],
      ),
    );
  }
}

export function checkBankAccounts(m: InvoiceModel): Finding[] {
  const out: Finding[] = [];
  const p = m.paymentInstructions;
  if (!p) return out;
  (p.creditTransfers ?? []).forEach((ct, i) => {
    checkAccount(
      ct.account,
      ct.bic,
      `/paymentInstructions/creditTransfers/${i}`,
      "BT-84",
      "BT-86",
      out,
    );
  });
  if (p.directDebit?.debitedAccount) {
    checkAccount(
      p.directDebit.debitedAccount,
      undefined,
      "/paymentInstructions/directDebit/debitedAccount",
      "BT-91",
      "",
      out,
    );
  }
  return out;
}

// ---- VAT identifiers -----------------------------------------------------------------------

/** EU VAT number formats after the two-letter prefix (VIES structures, incl. Northern Ireland XI). */
const VAT_FORMATS: Record<string, RegExp> = {
  AT: /^U\d{8}$/,
  BE: /^[01]\d{9}$/,
  BG: /^\d{9,10}$/,
  CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/,
  DE: /^\d{9}$/,
  DK: /^\d{8}$/,
  EE: /^\d{9}$/,
  EL: /^\d{9}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^\d{8}$/,
  FR: /^[A-Z0-9]{2}\d{9}$/,
  HR: /^\d{11}$/,
  HU: /^\d{8}$/,
  IE: /^(\d{7}[A-Z]{1,2}|\d[A-Z+*]\d{5}[A-Z])$/,
  IT: /^\d{11}$/,
  LT: /^(\d{9}|\d{12})$/,
  LU: /^\d{8}$/,
  LV: /^\d{11}$/,
  MT: /^\d{8}$/,
  NL: /^\d{9}B\d{2}$/,
  PL: /^\d{10}$/,
  PT: /^\d{9}$/,
  RO: /^\d{2,10}$/,
  SE: /^\d{12}$/,
  SI: /^\d{8}$/,
  SK: /^\d{10}$/,
  XI: /^(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
};

function checkVatId(value: string, loc: string, bt: string, role: string, out: Finding[]): void {
  const norm = value.toUpperCase().replace(/[\s.\-/]/g, "");
  const prefix = norm.slice(0, 2);
  const rest = norm.slice(2);
  const re = /^[A-Z]{2}$/.test(prefix) ? VAT_FORMATS[prefix] : undefined;
  if (!/^[A-Z]{2}$/.test(prefix)) {
    out.push(
      finding(
        "KONTOR-PLAUS-VATID",
        `${role} VAT ID "${value}" does not start with a two-letter country prefix`,
        loc,
        [bt],
      ),
    );
  } else if (!re) {
    out.push(
      finding(
        "KONTOR-PLAUS-VATID",
        `${role} VAT ID "${value}" has an unrecognised country prefix ${prefix}`,
        loc,
        [bt],
        "warning",
      ),
    );
  } else if (!re.test(rest)) {
    out.push(
      finding(
        "KONTOR-PLAUS-VATID",
        `${role} VAT ID "${value}" does not match the ${prefix} format`,
        loc,
        [bt],
      ),
    );
  }
}

export function checkTaxIdentifiers(m: InvoiceModel): Finding[] {
  const out: Finding[] = [];
  if (m.seller.vatId) checkVatId(m.seller.vatId, "/seller/vatId", "BT-31", "Seller", out);
  if (m.buyer.vatId) checkVatId(m.buyer.vatId, "/buyer/vatId", "BT-48", "Buyer", out);
  if (m.sellerTaxRepresentative?.vatId) {
    checkVatId(
      m.sellerTaxRepresentative.vatId,
      "/sellerTaxRepresentative/vatId",
      "BT-63",
      "Tax representative",
      out,
    );
  }
  // German Steuernummer: 10–11 digits in state notation (123/456/78901) or 13-digit federal scheme.
  const stnr = m.seller.taxRegistrationId;
  if (stnr !== undefined && m.seller.postalAddress?.countryCode?.trim().toUpperCase() === "DE") {
    const digits = stnr.replace(/\D/g, "").length;
    const onlyAllowedChars = /^[\d\s/]+$/.test(stnr.trim());
    if (!onlyAllowedChars || ![10, 11, 13].includes(digits)) {
      out.push(
        finding(
          "KONTOR-PLAUS-STEUERNUMMER",
          `Seller tax number "${stnr}" has ${digits} digits; expected 10–11 (state format) or 13 (federal format)`,
          "/seller/taxRegistrationId",
          ["BT-32"],
        ),
      );
    }
  }
  return out;
}

// ---- Leitweg-ID ----------------------------------------------------------------------------

/**
 * Detection heuristic: numeric coarse part, optional alphanumeric fine part, two check digits,
 * hyphen-separated. A numeric coarse part is what real Leitweg-IDs (derived from the amtlicher
 * Regionalschlüssel) look like; requiring it keeps ordinary buyer references like "PO-2026-08" out.
 */
const LEITWEG_SHAPE = /^(\d+)-(?:([0-9A-Z]*)-)?(\d{2})$/;

/** ISO 7064 MOD 97-10 check digits over the coarse + fine parts (letters A–Z → 10–35). */
export function leitwegCheckDigits(body: string): string {
  let n = 0n;
  for (const ch of body) n = n * (ch >= "A" ? 100n : 10n) + BigInt(Number.parseInt(ch, 36));
  const check = 98n - ((n * 100n) % 97n);
  return check.toString().padStart(2, "0");
}

export function checkLeitwegId(m: InvoiceModel): Finding[] {
  const out: Finding[] = [];
  const ref = m.buyerReference?.trim();
  if (!ref) return out;
  const match = LEITWEG_SHAPE.exec(ref.toUpperCase());
  if (!match) return out;
  const coarse = match[1] ?? "";
  const fine = match[2] ?? "";
  const check = match[3] ?? "";
  if (coarse.length < 2 || coarse.length > 12 || fine.length > 30) {
    out.push(
      finding(
        "KONTOR-PLAUS-LEITWEG-FORMAT",
        `Buyer reference "${ref}" looks like a Leitweg-ID but violates its structure (coarse part 2–12 characters, fine part ≤ 30)`,
        "/buyerReference",
        ["BT-10"],
      ),
    );
    return out;
  }
  const expected = leitwegCheckDigits(coarse + fine);
  if (expected !== check) {
    out.push(
      finding(
        "KONTOR-PLAUS-LEITWEG-CHECK",
        `Leitweg-ID ${ref} has invalid check digits ${check} (ISO 7064 MOD 97-10 expects ${expected})`,
        "/buyerReference",
        ["BT-10"],
      ),
    );
  }
  return out;
}
