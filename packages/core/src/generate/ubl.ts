import type { Derived } from "./derive.js";
import type { InvoiceInputParsed } from "./input.js";

export const XRECHNUNG_CUSTOMIZATION_ID =
  "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0";
export const PEPPOL_BILLING_PROFILE_ID = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Minimal indenting XML builder: `el(name, attrs, children)`; strings are text, `undefined` children are dropped. */
type Node = string | undefined | Node[];
function el(name: string, attrs: Record<string, string> = {}, children: Node[] = []): Node[] {
  const a = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join("");
  const flat = children
    .flat(Number.POSITIVE_INFINITY as 1)
    .filter((c): c is string => c !== undefined);
  if (flat.length === 0) return [`<${name}${a}/>`];
  if (flat.length === 1 && !flat[0]?.startsWith("<"))
    return [`<${name}${a}>${esc(flat[0] ?? "")}</${name}>`];
  return [`<${name}${a}>`, ...flat.map((c) => `  ${c}`), `</${name}>`];
}
const text = (name: string, v: string | undefined, attrs?: Record<string, string>) =>
  v === undefined || v === "" ? undefined : el(name, attrs, [v]);

function address(a: InvoiceInputParsed["seller"]["address"]): Node[] {
  return el("cac:PostalAddress", {}, [
    text("cbc:StreetName", a.street),
    text("cbc:AdditionalStreetName", a.street2),
    text("cbc:CityName", a.city),
    text("cbc:PostalZone", a.postCode),
    el("cac:Country", {}, [text("cbc:IdentificationCode", a.countryCode)]),
  ]);
}

const vatScheme = () => el("cac:TaxScheme", {}, [text("cbc:ID", "VAT")]);

/** Serialise input + derived amounts as XRechnung 3.0 (UBL 2.1 Invoice). */
export function toUblXml(input: InvoiceInputParsed, d: Derived): string {
  const cur = { currencyID: input.currency };
  const s = input.seller;
  const b = input.buyer;
  const p = input.payment;

  const seller = el("cac:AccountingSupplierParty", {}, [
    el("cac:Party", {}, [
      text("cbc:EndpointID", s.email, { schemeID: "EM" }),
      s.tradingName ? el("cac:PartyName", {}, [text("cbc:Name", s.tradingName)]) : undefined,
      address(s.address),
      s.vatId
        ? el("cac:PartyTaxScheme", {}, [text("cbc:CompanyID", s.vatId), vatScheme()])
        : undefined,
      s.taxNumber
        ? el("cac:PartyTaxScheme", {}, [
            text("cbc:CompanyID", s.taxNumber),
            el("cac:TaxScheme", {}, [text("cbc:ID", "FC")]),
          ])
        : undefined,
      el("cac:PartyLegalEntity", {}, [
        text("cbc:RegistrationName", s.name),
        text("cbc:CompanyID", s.legalRegistrationId),
      ]),
      el("cac:Contact", {}, [
        text("cbc:Name", s.contactName),
        text("cbc:Telephone", s.phone),
        text("cbc:ElectronicMail", s.email),
      ]),
    ]),
  ]);

  const buyer = el("cac:AccountingCustomerParty", {}, [
    el("cac:Party", {}, [
      text("cbc:EndpointID", b.email, { schemeID: "EM" }),
      b.identifier ? el("cac:PartyIdentification", {}, [text("cbc:ID", b.identifier)]) : undefined,
      address(b.address),
      b.vatId
        ? el("cac:PartyTaxScheme", {}, [text("cbc:CompanyID", b.vatId), vatScheme()])
        : undefined,
      el("cac:PartyLegalEntity", {}, [text("cbc:RegistrationName", b.name)]),
      b.contactName || b.contactEmail
        ? el("cac:Contact", {}, [
            text("cbc:Name", b.contactName),
            text("cbc:ElectronicMail", b.contactEmail),
          ])
        : undefined,
    ]),
  ]);

  const payment = p
    ? el("cac:PaymentMeans", {}, [
        text("cbc:PaymentMeansCode", p.meansCode),
        text("cbc:PaymentID", p.remittanceInfo),
        el("cac:PayeeFinancialAccount", {}, [
          text("cbc:ID", p.iban),
          text("cbc:Name", p.accountName),
          p.bic ? el("cac:FinancialInstitutionBranch", {}, [text("cbc:ID", p.bic)]) : undefined,
        ]),
      ])
    : undefined;

  const exemptionOf = (cat: string) =>
    cat === "S" || cat === "Z"
      ? []
      : [
          text("cbc:TaxExemptionReasonCode", input.vatExemption?.code),
          text("cbc:TaxExemptionReason", input.vatExemption?.reason),
        ];

  const taxTotal = el("cac:TaxTotal", {}, [
    text("cbc:TaxAmount", d.totals.taxAmount, cur),
    ...d.breakdown.map((bd) =>
      el("cac:TaxSubtotal", {}, [
        text("cbc:TaxableAmount", bd.taxableAmount, cur),
        text("cbc:TaxAmount", bd.taxAmount, cur),
        el("cac:TaxCategory", {}, [
          text("cbc:ID", bd.categoryCode),
          text("cbc:Percent", bd.rate),
          ...exemptionOf(bd.categoryCode),
          vatScheme(),
        ]),
      ]),
    ),
  ]);

  const totals = el("cac:LegalMonetaryTotal", {}, [
    text("cbc:LineExtensionAmount", d.totals.lineExtension, cur),
    text("cbc:TaxExclusiveAmount", d.totals.taxExclusive, cur),
    text("cbc:TaxInclusiveAmount", d.totals.taxInclusive, cur),
    text("cbc:PayableAmount", d.totals.payable, cur),
  ]);

  const lines = d.lines.map((dl) => {
    const l = input.lines[dl.index];
    if (!l) throw new Error("derived line without input line");
    return el("cac:InvoiceLine", {}, [
      text("cbc:ID", String(dl.index + 1)),
      text("cbc:Note", l.note),
      text("cbc:InvoicedQuantity", dl.quantity, { unitCode: l.unit }),
      text("cbc:LineExtensionAmount", dl.netAmount, cur),
      el("cac:Item", {}, [
        text("cbc:Name", l.description),
        el("cac:ClassifiedTaxCategory", {}, [
          text("cbc:ID", dl.vatCategory),
          text("cbc:Percent", dl.vatRate),
          vatScheme(),
        ]),
      ]),
      el("cac:Price", {}, [text("cbc:PriceAmount", dl.netPrice, cur)]),
    ]);
  });

  const root = el(
    "ubl:Invoice",
    {
      "xmlns:ubl": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
      "xmlns:cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
      "xmlns:cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    },
    [
      text("cbc:CustomizationID", XRECHNUNG_CUSTOMIZATION_ID),
      text("cbc:ProfileID", PEPPOL_BILLING_PROFILE_ID),
      text("cbc:ID", input.number),
      text("cbc:IssueDate", input.issueDate),
      text("cbc:DueDate", input.dueDate),
      text("cbc:InvoiceTypeCode", input.typeCode),
      ...(input.notes ?? []).map((n) => text("cbc:Note", n)),
      text("cbc:DocumentCurrencyCode", input.currency),
      text("cbc:BuyerReference", input.buyerReference),
      input.orderReference
        ? el("cac:OrderReference", {}, [text("cbc:ID", input.orderReference)])
        : undefined,
      seller,
      buyer,
      payment,
      p?.terms ? el("cac:PaymentTerms", {}, [text("cbc:Note", p.terms)]) : undefined,
      taxTotal,
      totals,
      ...lines,
    ],
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n${root.flat(Number.POSITIVE_INFINITY as 1).join("\n")}\n`;
}
