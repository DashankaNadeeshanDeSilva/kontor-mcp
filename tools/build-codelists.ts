/**
 * Extract the EN 16931 code lists from the pinned EN16931-UBL-codes.sch (validation 1.3.16) into
 * packages/rules/codelists/*.json and attach curated DE/EN names for the codes people actually use.
 * Run: pnpm codelists:build (needs fixtures/_downloads from tools/fetch-artifacts).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SCH = fileURLToPath(
  new URL(
    "../fixtures/_downloads/en16931-ubl/schematron/codelist/EN16931-UBL-codes.sch",
    import.meta.url,
  ),
);
const OUT = fileURLToPath(new URL("../packages/rules/codelists/", import.meta.url));
const SOURCE =
  "EN 16931 validation artefacts 1.3.16 (ConnectingEurope/eInvoicing-EN16931, EUPL-1.2), schematron/codelist/EN16931-UBL-codes.sch";

type L = { de: string; en: string };
const l = (de: string, en: string): L => ({ de, en });

interface ListSpec {
  rule: string;
  standard: string;
  title: L;
  common: Record<string, L>;
}
const LISTS: Record<string, ListSpec> = {
  "invoice-types": {
    rule: "BR-CL-01",
    standard: "UNTDID 1001 (restricted)",
    title: l("Rechnungstypen (BT-3)", "Invoice type codes (BT-3)"),
    common: {
      "380": l("Rechnung", "Commercial invoice"),
      "381": l("Gutschrift", "Credit note"),
      "384": l("Rechnungskorrektur", "Corrected invoice"),
      "389": l("Selbstfakturierte Rechnung (Gutschriftsverfahren)", "Self-billed invoice"),
      "261": l("Selbstfakturierte Gutschrift", "Self-billed credit note"),
      "326": l("Teilrechnung", "Partial invoice"),
      "875": l("Abschlagsrechnung (Bauleistung)", "Partial construction invoice"),
      "876": l("Teilschlussrechnung (Bauleistung)", "Partial final construction invoice"),
      "877": l("Schlussrechnung (Bauleistung)", "Final construction invoice"),
    },
  },
  currencies: {
    rule: "BR-CL-04",
    standard: "ISO 4217 alpha-3",
    title: l("Währungen (BT-5)", "Currencies (BT-5)"),
    common: {
      EUR: l("Euro", "Euro"),
      CHF: l("Schweizer Franken", "Swiss franc"),
      GBP: l("Pfund Sterling", "Pound sterling"),
      USD: l("US-Dollar", "US dollar"),
      PLN: l("Złoty", "Polish złoty"),
      DKK: l("Dänische Krone", "Danish krone"),
      SEK: l("Schwedische Krone", "Swedish krona"),
      CZK: l("Tschechische Krone", "Czech koruna"),
    },
  },
  countries: {
    rule: "BR-CL-14",
    standard: "ISO 3166-1 alpha-2",
    title: l("Ländercodes", "Country codes"),
    common: {
      DE: l("Deutschland", "Germany"),
      AT: l("Österreich", "Austria"),
      CH: l("Schweiz", "Switzerland"),
      FR: l("Frankreich", "France"),
      NL: l("Niederlande", "Netherlands"),
      BE: l("Belgien", "Belgium"),
      IT: l("Italien", "Italy"),
      ES: l("Spanien", "Spain"),
      PL: l("Polen", "Poland"),
      LU: l("Luxemburg", "Luxembourg"),
      DK: l("Dänemark", "Denmark"),
      GB: l("Vereinigtes Königreich", "United Kingdom"),
      US: l("Vereinigte Staaten", "United States"),
    },
  },
  "payment-means": {
    rule: "BR-CL-16",
    standard: "UNTDID 4461",
    title: l("Zahlungsarten (BT-81)", "Payment means codes (BT-81)"),
    common: {
      "1": l("Nicht definiert / Zahlungsart wird noch vereinbart", "Instrument not defined"),
      "10": l("Bar", "In cash"),
      "20": l("Scheck", "Cheque"),
      "30": l("Überweisung (nicht SEPA)", "Credit transfer (non-SEPA)"),
      "31": l("Lastschrift (nicht SEPA)", "Debit transfer (non-SEPA)"),
      "42": l("Zahlung auf Bankkonto", "Payment to bank account"),
      "48": l("Kartenzahlung", "Bank card"),
      "49": l("Lastschrift", "Direct debit"),
      "54": l("Kreditkarte", "Credit card"),
      "55": l("Debitkarte", "Debit card"),
      "57": l("Dauerauftrag", "Standing agreement"),
      "58": l("SEPA-Überweisung", "SEPA credit transfer"),
      "59": l("SEPA-Lastschrift", "SEPA direct debit"),
      "68": l("Online-Zahlungsdienst (z. B. PayPal)", "Online payment service"),
      "97": l("Verrechnung / Aufrechnung", "Clearing between partners"),
      ZZZ: l("Gegenseitig vereinbart / sonstige", "Mutually defined"),
    },
  },
  "vat-categories": {
    rule: "BR-CL-17",
    standard: "UNTDID 5305 (restricted)",
    title: l("Umsatzsteuerkategorien (BT-118, BT-151)", "VAT category codes (BT-118, BT-151)"),
    common: {
      S: l(
        "Regelsteuersatz / ermäßigter Satz (steuerpflichtig)",
        "Standard / reduced rate (taxable)",
      ),
      Z: l("Nullsatz (0 %)", "Zero rated"),
      E: l(
        "Steuerbefreit (mit Befreiungsgrund BT-120/121)",
        "Exempt from tax (reason in BT-120/121)",
      ),
      AE: l(
        "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge, § 13b UStG)",
        "Reverse charge (VAT accounted for by the customer)",
      ),
      K: l("Innergemeinschaftliche Lieferung (steuerfrei)", "Intra-community supply (exempt)"),
      G: l("Ausfuhrlieferung (steuerfrei)", "Export outside the EU (exempt)"),
      O: l("Nicht steuerbar (außerhalb des Anwendungsbereichs)", "Services outside scope of VAT"),
      L: l("Kanarische Inseln (IGIC)", "Canary Islands general indirect tax"),
      M: l(
        "Ceuta und Melilla (IPSI)",
        "Tax for production, services and importation in Ceuta and Melilla",
      ),
    },
  },
  "allowance-reasons": {
    rule: "BR-CL-19",
    standard: "UNTDID 5189",
    title: l("Nachlassgründe (BT-98, BT-140)", "Allowance reason codes (BT-98, BT-140)"),
    common: {
      "41": l("Bonus für vorgezogene Arbeiten", "Bonus for works ahead of schedule"),
      "42": l("Sonstiger Bonus", "Other bonus"),
      "60": l("Herstellerrabatt (Verbraucher)", "Manufacturer's consumer discount"),
      "62": l("Wegen militärischem Status", "Due to military status"),
      "63": l("Wegen Unfall", "Due to an accident"),
      "64": l("Sondervereinbarung", "Special agreement"),
      "65": l("Produktionsfehler-Nachlass", "Production error discount"),
      "66": l("Neue-Filiale-Nachlass", "New outlet discount"),
      "67": l("Musternachlass", "Sample discount"),
      "68": l("Auslaufware-Nachlass", "End-of-range discount"),
      "70": l("Incoterm-Nachlass", "Incoterm discount"),
      "71": l("Umsatzstaffel-Nachlass (Point of Sale)", "Point of sales threshold allowance"),
      "88": l("Materialzuschlag/-abschlag", "Material surcharge/deduction"),
      "95": l("Rabatt", "Discount"),
      "100": l("Sonderrabatt", "Special rebate"),
      "102": l("Langfristiger Festpreis", "Fixed long term"),
      "103": l("Vorübergehend", "Temporary"),
      "104": l("Standard", "Standard"),
      "105": l("Umsatzabhängig", "Yearly turnover"),
    },
  },
  "charge-reasons": {
    rule: "BR-CL-20",
    standard: "UNTDID 7161",
    title: l("Zuschlagsgründe (BT-105, BT-145)", "Charge reason codes (BT-105, BT-145)"),
    common: {
      AA: l("Werbung", "Advertising"),
      AAA: l("Telekommunikation", "Telecommunication"),
      ABK: l("Sonstiges", "Miscellaneous"),
      ABL: l("Zusätzliche Verpackung", "Additional packaging"),
      ADR: l("Sonstige Dienstleistungen", "Other services"),
      ADT: l("Abholung", "Pick-up"),
      FC: l("Fracht", "Freight service"),
      FI: l("Finanzierung", "Financing"),
      LA: l("Etikettierung", "Labelling"),
      PC: l("Verpackung", "Packing"),
      SH: l("Versand und Handling", "Shipping and handling"),
    },
  },
  vatex: {
    rule: "BR-CL-22",
    standard: "CEF VATEX",
    title: l("Befreiungsgründe (BT-121)", "VAT exemption reason codes (BT-121)"),
    common: {
      "VATEX-EU-AE": l("Reverse Charge (Art. 194–199a MwStSystRL)", "Reverse charge"),
      "VATEX-EU-D": l(
        "Innergemeinschaftlicher Erwerb, Reiseleistungen (Art. 306)",
        "Intra-community acquisition from second-hand means of transport / travel agents",
      ),
      "VATEX-EU-F": l(
        "Differenzbesteuerung Gebrauchtgegenstände (Art. 313)",
        "Second-hand goods margin scheme",
      ),
      "VATEX-EU-G": l("Ausfuhr (Art. 146)", "Export outside the EU"),
      "VATEX-EU-I": l(
        "Kunstgegenstände Differenzbesteuerung (Art. 316)",
        "Works of art margin scheme",
      ),
      "VATEX-EU-IC": l("Innergemeinschaftliche Lieferung (Art. 138)", "Intra-community supply"),
      "VATEX-EU-J": l("Sammlungsstücke/Antiquitäten (Art. 316)", "Collector's items and antiques"),
      "VATEX-EU-O": l("Nicht steuerbar", "Not subject to VAT"),
      "VATEX-EU-79-C": l("Steuerbefreit nach Art. 79 (c)", "Exempt based on article 79, point c"),
      "VATEX-EU-132": l(
        "Steuerbefreit nach Art. 132 (dem Gemeinwohl dienende Tätigkeiten)",
        "Exempt based on article 132 (activities in the public interest)",
      ),
    },
  },
  units: {
    rule: "BR-CL-23",
    standard: "UN/ECE Recommendation 20 + Rec 21",
    title: l("Mengeneinheiten (BT-130, BT-150)", "Unit of measure codes (BT-130, BT-150)"),
    common: {
      C62: l("Stück (one/unit)", "One (piece / unit)"),
      H87: l("Stück", "Piece"),
      EA: l("Einzelstück (each)", "Each"),
      XPP: l("Stück (Rec 21: piece)", "Piece (Rec 21)"),
      HUR: l("Stunde", "Hour"),
      MIN: l("Minute", "Minute"),
      DAY: l("Tag", "Day"),
      WEE: l("Woche", "Week"),
      MON: l("Monat", "Month"),
      ANN: l("Jahr", "Year"),
      E48: l("Serviceeinheit", "Service unit"),
      LS: l("Pauschale (lump sum)", "Lump sum"),
      P1: l("Prozent", "Percent"),
      KGM: l("Kilogramm", "Kilogram"),
      GRM: l("Gramm", "Gram"),
      TNE: l("Tonne", "Tonne (metric ton)"),
      MTR: l("Meter", "Metre"),
      CMT: l("Zentimeter", "Centimetre"),
      MMT: l("Millimeter", "Millimetre"),
      KMT: l("Kilometer", "Kilometre"),
      MTK: l("Quadratmeter", "Square metre"),
      MTQ: l("Kubikmeter", "Cubic metre"),
      LTR: l("Liter", "Litre"),
      MLT: l("Milliliter", "Millilitre"),
      KWH: l("Kilowattstunde", "Kilowatt hour"),
      MWH: l("Megawattstunde", "Megawatt hour"),
      SET: l("Satz", "Set"),
      PR: l("Paar", "Pair"),
      DZN: l("Dutzend", "Dozen"),
      XPK: l("Paket", "Package"),
      XCT: l("Karton", "Carton"),
      XPX: l("Palette", "Pallet"),
      XBO: l("Flasche", "Bottle"),
      XBX: l("Box", "Box"),
    },
  },
  eas: {
    rule: "BR-CL-25",
    standard: "CEF EAS (Electronic Address Scheme)",
    title: l(
      "Schemata elektronischer Adressen (BT-34, BT-49)",
      "Electronic address schemes (BT-34, BT-49)",
    ),
    common: {
      EM: l("E-Mail-Adresse", "Electronic mail"),
      "0204": l("Leitweg-ID (Deutschland)", "Leitweg-ID (Germany)"),
      "0088": l("GLN (EAN Location Code)", "GLN (EAN location code)"),
      "0060": l("DUNS-Nummer", "DUNS number"),
      "9930": l("Deutsche USt-IdNr.", "Germany VAT number"),
      "9918": l("IBAN (SWIFT)", "IBAN"),
      "0002": l("SIRENE (Frankreich)", "SIRENE (France)"),
      "0208": l("Unternehmensnummer (Belgien)", "Enterprise number (Belgium)"),
      "9925": l("Belgische USt-IdNr.", "Belgium VAT number"),
      "0198": l("CVR (Dänemark)", "CVR (Denmark)"),
      "0192": l("Organisationsnummer (Norwegen)", "Organisation number (Norway)"),
      "0007": l("Organisationsnummer (Schweden)", "Organisation number (Sweden)"),
      "9910": l("Ungarische USt-IdNr.", "Hungary VAT number"),
      "9931": l("Estnische USt-IdNr.", "Estonia VAT number"),
      "0183": l("UID (Schweiz)", "UID (Switzerland)"),
    },
  },
  "identifier-schemes": {
    rule: "BR-CL-10",
    standard: "ISO 6523 ICD",
    title: l("Identifikatorschemata (schemeID)", "Identifier schemes (schemeID)"),
    common: {
      "0088": l("GLN", "GLN"),
      "0060": l("DUNS", "DUNS"),
      "0204": l("Leitweg-ID", "Leitweg-ID"),
      "0002": l("SIRENE", "SIRENE"),
      "0208": l("Belgische Unternehmensnummer", "Belgian enterprise number"),
      "0183": l("Schweizer UID", "Swiss UID"),
    },
  },
  "mime-types": {
    rule: "BR-CL-24",
    standard: "MIME media types allowed for attachments (BT-125)",
    title: l("Erlaubte Anhangsformate (BT-125)", "Allowed attachment MIME types (BT-125)"),
    common: {
      "application/pdf": l("PDF", "PDF"),
      "image/png": l("PNG-Bild", "PNG image"),
      "image/jpeg": l("JPEG-Bild", "JPEG image"),
      "text/csv": l("CSV", "CSV"),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": l(
        "Excel (xlsx)",
        "Excel (xlsx)",
      ),
      "application/vnd.oasis.opendocument.spreadsheet": l(
        "OpenDocument-Tabelle (ods)",
        "OpenDocument spreadsheet (ods)",
      ),
    },
  },
  "vat-point-date-codes": {
    rule: "BR-CL-06",
    standard: "UNTDID 2005 (restricted)",
    title: l("Codes für das Datum der Steuerentstehung (BT-8)", "VAT point date codes (BT-8)"),
    common: {
      "3": l("Rechnungsdatum", "Invoice document issue date"),
      "35": l("Lieferdatum", "Actual delivery date"),
      "432": l("Zahlungsdatum", "Paid to date"),
    },
  },
};

const sch = readFileSync(SCH, "utf8");
const asserts = new Map<string, string>();
for (const chunk of sch.split("<assert").slice(1)) {
  const id = /\sid="(BR-CL-\d+)"/.exec(chunk)?.[1];
  const test = /^\s*test="([\s\S]*?)"\s+(?:id|flag)=/.exec(chunk)?.[1];
  if (id && test) asserts.set(id, test);
}
mkdirSync(OUT, { recursive: true });
const index: Record<string, { rule: string; standard: string; count: number }> = {};
const problems: string[] = [];
for (const [name, spec] of Object.entries(LISTS)) {
  const test = asserts.get(spec.rule);
  if (!test) throw new Error(`assert ${spec.rule} not found`);
  const codes = [
    ...new Set([
      ...[...test.matchAll(/contains\(\s*' ([^']+) '\s*,\s*concat/g)].flatMap((m) =>
        (m[1] ?? "").trim().split(/\s+/),
      ),
      ...[...test.matchAll(/@mimeCode = '([^']+)'/g)].map((m) => m[1] ?? ""),
    ]),
  ].filter(Boolean);
  if (codes.length === 0) throw new Error(`no codes for ${name}`);
  const unknown = Object.keys(spec.common).filter((c) => !codes.includes(c));
  if (unknown.length) {
    problems.push(`${name}: curated codes not in the official list: ${unknown.join(", ")}`);
    continue;
  }
  writeFileSync(
    `${OUT}${name}.json`,
    `${JSON.stringify({ list: name, title: spec.title, standard: spec.standard, rule: spec.rule, source: SOURCE, count: codes.length, codes, common: spec.common }, null, 2)}\n`,
  );
  index[name] = { rule: spec.rule, standard: spec.standard, count: codes.length };
  console.log(`${name}: ${codes.length} codes, ${Object.keys(spec.common).length} described`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
writeFileSync(`${OUT}index.json`, `${JSON.stringify({ source: SOURCE, lists: index }, null, 2)}\n`);
