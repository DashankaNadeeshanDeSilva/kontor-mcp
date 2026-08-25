import type { Finding, FindingSeverity } from "../finding.js";

/** Static part of every KONTOR-PLAUS-* finding: severity default, bilingual explanation and fix hint. */
interface CatalogueEntry {
  severity: FindingSeverity;
  explanation: { de: string; en: string };
  fixHint: { de: string; en: string };
}

export const CATALOGUE = {
  "KONTOR-PLAUS-LINE-NET": {
    severity: "error",
    explanation: {
      de: "Der Positionsnettobetrag (BT-131) stimmt nicht mit Menge × Nettopreis (÷ Basismenge) abzüglich Positionsnachlässen zuzüglich Positionszuschlägen überein.",
      en: "The line net amount (BT-131) does not equal quantity × net price (÷ base quantity) minus line allowances plus line charges.",
    },
    fixHint: {
      de: "BT-131 aus Menge und Nettopreis neu berechnen oder den Preis korrigieren.",
      en: "Recompute BT-131 from quantity and net price, or correct the price.",
    },
  },
  "KONTOR-PLAUS-SUM-LINES": {
    severity: "error",
    explanation: {
      de: "Die Summe der Positionsnettobeträge (BT-106) weicht von der Summe aller BT-131 ab.",
      en: "The sum of line net amounts (BT-106) differs from the sum of all BT-131.",
    },
    fixHint: {
      de: "BT-106 als exakte Summe aller Positionen setzen.",
      en: "Set BT-106 to the exact sum of all lines.",
    },
  },
  "KONTOR-PLAUS-SUM-TAXEXCL": {
    severity: "error",
    explanation: {
      de: "Der Nettobetrag der Rechnung (BT-109) muss BT-106 − BT-107 (Nachlässe) + BT-108 (Zuschläge) entsprechen.",
      en: "The invoice total without VAT (BT-109) must equal BT-106 − BT-107 (allowances) + BT-108 (charges).",
    },
    fixHint: {
      de: "BT-109 oder die Summen der Nachlässe/Zuschläge korrigieren.",
      en: "Correct BT-109 or the allowance/charge totals.",
    },
  },
  "KONTOR-PLAUS-SUM-TAXINCL": {
    severity: "error",
    explanation: {
      de: "Der Bruttobetrag (BT-112) muss BT-109 + Umsatzsteuergesamtbetrag (BT-110) entsprechen.",
      en: "The invoice total with VAT (BT-112) must equal BT-109 + total VAT amount (BT-110).",
    },
    fixHint: { de: "BT-112 neu berechnen.", en: "Recompute BT-112." },
  },
  "KONTOR-PLAUS-SUM-PAYABLE": {
    severity: "error",
    explanation: {
      de: "Der fällige Betrag (BT-115) muss BT-112 − gezahlter Betrag (BT-113) + Rundungsbetrag (BT-114) entsprechen.",
      en: "The amount due for payment (BT-115) must equal BT-112 − paid amount (BT-113) + rounding amount (BT-114).",
    },
    fixHint: {
      de: "BT-115 neu berechnen bzw. BT-113/BT-114 prüfen.",
      en: "Recompute BT-115 or check BT-113/BT-114.",
    },
  },
  "KONTOR-PLAUS-VAT-BREAKDOWN-BASE": {
    severity: "error",
    explanation: {
      de: "Der steuerbare Betrag einer Umsatzsteueraufschlüsselung (BT-116) muss der Summe der Positionsnettobeträge (± Nachlässe/Zuschläge auf Dokumentebene) mit derselben Kategorie und demselben Steuersatz entsprechen.",
      en: "The taxable amount of a VAT breakdown (BT-116) must equal the sum of line net amounts (± document-level allowances/charges) with the same category and rate.",
    },
    fixHint: {
      de: "BT-116 aus den Positionen dieser Kategorie/dieses Satzes neu berechnen.",
      en: "Recompute BT-116 from the lines of this category/rate.",
    },
  },
  "KONTOR-PLAUS-VAT-BREAKDOWN-AMOUNT": {
    severity: "error",
    explanation: {
      de: "Der Umsatzsteuerbetrag (BT-117) weicht von steuerbarem Betrag × Steuersatz (kaufmännisch auf Cent gerundet) ab. Die amtliche Regel BR-CO-17 toleriert bis zu ±1 Währungseinheit; Kontor prüft centgenau.",
      en: "The VAT amount (BT-117) differs from taxable amount × rate (rounded half-up to cents). The official rule BR-CO-17 tolerates ±1 currency unit; Kontor checks to the cent.",
    },
    fixHint: {
      de: "BT-117 pro Aufschlüsselung neu berechnen; Rundung auf Ebene der Aufschlüsselung, nicht je Position.",
      en: "Recompute BT-117 per breakdown; round at breakdown level, not per line.",
    },
  },
  "KONTOR-PLAUS-VAT-TOTAL": {
    severity: "error",
    explanation: {
      de: "Der Umsatzsteuergesamtbetrag (BT-110) muss der Summe aller BT-117 entsprechen.",
      en: "The total VAT amount (BT-110) must equal the sum of all BT-117.",
    },
    fixHint: {
      de: "BT-110 als Summe der Aufschlüsselungen setzen.",
      en: "Set BT-110 to the sum of the breakdowns.",
    },
  },
  "KONTOR-PLAUS-VAT-RATE-DE": {
    severity: "warning",
    explanation: {
      de: "In Deutschland gelten für Kategorie S nur der Regelsatz 19 % und der ermäßigte Satz 7 %. 16 %/5 % galten nur vom 1.7. bis 31.12.2020.",
      en: "In Germany, category S only allows the standard rate of 19 % and the reduced rate of 7 %. 16 %/5 % applied only from 1 Jul to 31 Dec 2020.",
    },
    fixHint: {
      de: "19 % oder 7 % verwenden, oder eine passende Kategorie (E/AE/K/…) mit Befreiungsgrund angeben.",
      en: "Use 19 % or 7 %, or an appropriate category (E/AE/K/…) with an exemption reason.",
    },
  },
  "KONTOR-PLAUS-VAT-CATEGORY-RATE": {
    severity: "error",
    explanation: {
      de: "Steuersatz und Steuerkategorie passen nicht zusammen: Z/E/AE/K/G/O erfordern 0 %, S erfordert einen Satz > 0.",
      en: "VAT rate and category are inconsistent: Z/E/AE/K/G/O require 0 %, S requires a rate > 0.",
    },
    fixHint: {
      de: "BT-118 (Kategorie) und BT-119 (Satz) angleichen.",
      en: "Align BT-118 (category) and BT-119 (rate).",
    },
  },
  "KONTOR-PLAUS-IBAN": {
    severity: "error",
    explanation: {
      de: "Die IBAN besteht die Prüfziffernprüfung (ISO 13616, mod 97) oder die Längenregel des Landes nicht.",
      en: "The IBAN fails the check-digit test (ISO 13616, mod 97) or the country's length rule.",
    },
    fixHint: {
      de: "IBAN auf Tippfehler prüfen und beim Lieferanten bestätigen lassen.",
      en: "Check the IBAN for typos and confirm with the supplier.",
    },
  },
  "KONTOR-PLAUS-BIC": {
    severity: "warning",
    explanation: {
      de: "Der BIC entspricht nicht dem Format ISO 9362 (8 oder 11 Zeichen: Bank, Land, Ort, optional Filiale).",
      en: "The BIC does not follow ISO 9362 (8 or 11 characters: bank, country, location, optional branch).",
    },
    fixHint: {
      de: "BIC korrigieren oder weglassen (bei SEPA nicht erforderlich).",
      en: "Correct the BIC or omit it (not required for SEPA).",
    },
  },
  "KONTOR-PLAUS-BIC-COUNTRY": {
    severity: "info",
    explanation: {
      de: "Das Land im BIC (Zeichen 5–6) weicht vom Land der IBAN ab. Das ist möglich, aber ungewöhnlich.",
      en: "The country in the BIC (characters 5–6) differs from the IBAN country. Possible, but unusual.",
    },
    fixHint: {
      de: "Bankverbindung beim Lieferanten verifizieren.",
      en: "Verify the bank details with the supplier.",
    },
  },
  "KONTOR-PLAUS-VATID": {
    severity: "error",
    explanation: {
      de: "Die USt-IdNr. entspricht nicht dem Format des Landes (z. B. DE + 9 Ziffern).",
      en: "The VAT identifier does not match the country's format (e.g. DE + 9 digits).",
    },
    fixHint: {
      de: "USt-IdNr. korrigieren; ggf. über das BZSt-Bestätigungsverfahren prüfen.",
      en: "Correct the VAT ID; optionally confirm via the VIES/BZSt confirmation service.",
    },
  },
  "KONTOR-PLAUS-STEUERNUMMER": {
    severity: "warning",
    explanation: {
      de: "Die Steuernummer hat weder das Länderformat (10–11 Ziffern, z. B. 123/456/78901) noch das bundeseinheitliche 13-stellige Format.",
      en: "The tax number matches neither the state format (10–11 digits, e.g. 123/456/78901) nor the federal 13-digit format.",
    },
    fixHint: {
      de: "Steuernummer im Format des Finanzamts angeben.",
      en: "Provide the tax number in the tax office's format.",
    },
  },
  "KONTOR-PLAUS-LEITWEG-FORMAT": {
    severity: "error",
    explanation: {
      de: "Die Leitweg-ID besteht aus Grobadressierung (2–12 Zeichen), optionaler Feinadressierung (bis 30 Zeichen) und 2 Prüfziffern, getrennt durch Bindestriche.",
      en: "A Leitweg-ID consists of a coarse part (2–12 characters), an optional fine part (up to 30 characters) and 2 check digits, separated by hyphens.",
    },
    fixHint: {
      de: "Leitweg-ID aus Auftrag/Ausschreibung des Auftraggebers übernehmen.",
      en: "Copy the Leitweg-ID from the buyer's order or tender.",
    },
  },
  "KONTOR-PLAUS-LEITWEG-CHECK": {
    severity: "error",
    explanation: {
      de: "Die Prüfziffern der Leitweg-ID (ISO 7064 MOD 97-10) stimmen nicht. Rechnungen mit falscher Leitweg-ID werden von öffentlichen Auftraggebern nicht zugestellt.",
      en: "The Leitweg-ID check digits (ISO 7064 MOD 97-10) are wrong. Public-sector buyers cannot route invoices with an invalid Leitweg-ID.",
    },
    fixHint: {
      de: "Leitweg-ID beim Auftraggeber erfragen und exakt übernehmen.",
      en: "Obtain the Leitweg-ID from the buyer and copy it exactly.",
    },
  },
  "KONTOR-PLAUS-DATE-FUTURE": {
    severity: "warning",
    explanation: {
      de: "Das Rechnungsdatum (BT-2) liegt in der Zukunft.",
      en: "The issue date (BT-2) lies in the future.",
    },
    fixHint: { de: "Rechnungsdatum prüfen.", en: "Check the issue date." },
  },
  "KONTOR-PLAUS-DATE-DUE-BEFORE-ISSUE": {
    severity: "error",
    explanation: {
      de: "Das Fälligkeitsdatum (BT-9) liegt vor dem Rechnungsdatum (BT-2).",
      en: "The due date (BT-9) precedes the issue date (BT-2).",
    },
    fixHint: {
      de: "Fälligkeitsdatum oder Zahlungsbedingungen korrigieren.",
      en: "Correct the due date or payment terms.",
    },
  },
  "KONTOR-PLAUS-DATE-PERIOD": {
    severity: "error",
    explanation: {
      de: "Das Ende eines Abrechnungszeitraums liegt vor seinem Beginn.",
      en: "An invoicing period ends before it starts.",
    },
    fixHint: {
      de: "Start- und Enddatum des Zeitraums prüfen.",
      en: "Check the period's start and end dates.",
    },
  },
  "KONTOR-PLAUS-DATE-STALE": {
    severity: "info",
    explanation: {
      de: "Das Rechnungsdatum liegt mehr als ein Jahr zurück.",
      en: "The issue date is more than a year in the past.",
    },
    fixHint: {
      de: "Prüfen, ob die Rechnung bereits verarbeitet wurde.",
      en: "Check whether the invoice has already been processed.",
    },
  },
  "KONTOR-PLAUS-DUPLICATE": {
    severity: "error",
    explanation: {
      de: "Die Rechnungsnummer (BT-1) ist in der vom Aufrufer übergebenen Liste bekannter Rechnungsnummern enthalten.",
      en: "The invoice number (BT-1) appears in the caller-provided list of known invoice numbers.",
    },
    fixHint: {
      de: "Als Dublette behandeln bzw. mit dem Lieferanten klären.",
      en: "Treat as a duplicate or clarify with the supplier.",
    },
  },
} as const satisfies Record<string, CatalogueEntry>;

export type PlausibilityRuleId = keyof typeof CATALOGUE;

export function finding(
  ruleId: PlausibilityRuleId,
  message: string,
  location: string,
  bt: string[],
  severity?: FindingSeverity,
): Finding {
  const entry = CATALOGUE[ruleId];
  return {
    ruleId,
    severity: severity ?? entry.severity,
    source: "plausibility",
    location,
    message,
    explanation: entry.explanation,
    fixHint: entry.fixHint,
    bt,
  };
}
