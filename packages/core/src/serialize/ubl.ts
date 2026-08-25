/** InvoiceModel → UBL 2.1 (Invoice or CreditNote), the inverse of parse/ubl.ts (EN 16931-3-2). */

import { Decimal } from "decimal.js";
import type { InvoiceModel, PostalAddress } from "../model/schema.js";
import { document, el, group, text, type XmlNode } from "./xml.js";

const sumAmounts = (xs: string[]) => xs.reduce((acc, x) => acc.plus(x), new Decimal(0)).toFixed(2);

const CREDIT_NOTE_TYPES = new Set(["381", "396", "261", "262", "308"]);

const address = (
  a: PostalAddress | undefined,
  name = "cac:PostalAddress",
): XmlNode[] | undefined =>
  a
    ? group(name, {}, [
        text("cbc:StreetName", a.line1),
        text("cbc:AdditionalStreetName", a.line2),
        text("cbc:CityName", a.city),
        text("cbc:PostalZone", a.postCode),
        text("cbc:CountrySubentity", a.countrySubdivision),
        a.line3 ? el("cac:AddressLine", {}, [text("cbc:Line", a.line3)]) : undefined,
        a.countryCode
          ? el("cac:Country", {}, [text("cbc:IdentificationCode", a.countryCode)])
          : undefined,
      ])
    : undefined;

const vatScheme = () => el("cac:TaxScheme", {}, [text("cbc:ID", "VAT")]);
const taxCategory = (
  name: string,
  code: string,
  rate: string | undefined,
  reasonCode?: string,
  reason?: string,
) =>
  el(`cac:${name}`, {}, [
    text("cbc:ID", code),
    text("cbc:Percent", rate),
    text("cbc:TaxExemptionReasonCode", reasonCode),
    text("cbc:TaxExemptionReason", reason),
    vatScheme(),
  ]);

const allowanceCharge = (
  indicator: "true" | "false",
  ac: {
    amount: string;
    baseAmount?: string | undefined;
    percentage?: string | undefined;
    reason?: string | undefined;
    reasonCode?: string | undefined;
    vatCategoryCode?: string | undefined;
    vatRate?: string | undefined;
  },
  cur: Record<string, string>,
) =>
  el("cac:AllowanceCharge", {}, [
    text("cbc:ChargeIndicator", indicator),
    text("cbc:AllowanceChargeReasonCode", ac.reasonCode),
    text("cbc:AllowanceChargeReason", ac.reason),
    text("cbc:MultiplierFactorNumeric", ac.percentage),
    text("cbc:Amount", ac.amount, cur),
    text("cbc:BaseAmount", ac.baseAmount, cur),
    ac.vatCategoryCode ? taxCategory("TaxCategory", ac.vatCategoryCode, ac.vatRate) : undefined,
  ]);

const period = (
  name: string,
  p: { start?: string | undefined; end?: string | undefined } | undefined,
  descriptionCode?: string,
) =>
  p || descriptionCode
    ? group(name, {}, [
        text("cbc:StartDate", p?.start),
        text("cbc:EndDate", p?.end),
        text("cbc:DescriptionCode", descriptionCode),
      ])
    : undefined;

const noteText = (n: { subjectCode?: string | undefined; note: string }) =>
  n.subjectCode ? `#${n.subjectCode}#${n.note}` : n.note;

export function modelToUbl(m: InvoiceModel): string {
  const creditNote = CREDIT_NOTE_TYPES.has(m.typeCode);
  const cur = { currencyID: m.currency };
  const rootName = creditNote ? "ubl:CreditNote" : "ubl:Invoice";
  const ns = {
    "xmlns:ubl": `urn:oasis:names:specification:ubl:schema:xsd:${creditNote ? "CreditNote" : "Invoice"}-2`,
    "xmlns:cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "xmlns:cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  };

  const s = m.seller;
  const seller = el("cac:AccountingSupplierParty", {}, [
    el("cac:Party", {}, [
      s.electronicAddress
        ? text("cbc:EndpointID", s.electronicAddress.value, {
            schemeID: s.electronicAddress.scheme,
          })
        : undefined,
      ...(s.identifiers ?? []).map((id) =>
        el("cac:PartyIdentification", {}, [text("cbc:ID", id.value, { schemeID: id.scheme })]),
      ),
      m.paymentInstructions?.directDebit?.creditorId
        ? el("cac:PartyIdentification", {}, [
            text("cbc:ID", m.paymentInstructions.directDebit.creditorId, { schemeID: "SEPA" }),
          ])
        : undefined,
      s.tradingName ? el("cac:PartyName", {}, [text("cbc:Name", s.tradingName)]) : undefined,
      address(s.postalAddress),
      s.vatId
        ? el("cac:PartyTaxScheme", {}, [text("cbc:CompanyID", s.vatId), vatScheme()])
        : undefined,
      s.taxRegistrationId
        ? el("cac:PartyTaxScheme", {}, [
            text("cbc:CompanyID", s.taxRegistrationId),
            el("cac:TaxScheme", {}, [text("cbc:ID", "FC")]),
          ])
        : undefined,
      el("cac:PartyLegalEntity", {}, [
        text("cbc:RegistrationName", s.name),
        s.legalRegistrationId
          ? text("cbc:CompanyID", s.legalRegistrationId.value, {
              schemeID: s.legalRegistrationId.scheme,
            })
          : undefined,
        text("cbc:CompanyLegalForm", s.additionalLegalInfo),
      ]),
      s.contact
        ? group("cac:Contact", {}, [
            text("cbc:Name", s.contact.name),
            text("cbc:Telephone", s.contact.phone),
            text("cbc:ElectronicMail", s.contact.email),
          ])
        : undefined,
    ]),
  ]);

  const b = m.buyer;
  const buyer = el("cac:AccountingCustomerParty", {}, [
    el("cac:Party", {}, [
      b.electronicAddress
        ? text("cbc:EndpointID", b.electronicAddress.value, {
            schemeID: b.electronicAddress.scheme,
          })
        : undefined,
      b.identifier
        ? el("cac:PartyIdentification", {}, [
            text("cbc:ID", b.identifier.value, { schemeID: b.identifier.scheme }),
          ])
        : undefined,
      b.tradingName ? el("cac:PartyName", {}, [text("cbc:Name", b.tradingName)]) : undefined,
      address(b.postalAddress),
      b.vatId
        ? el("cac:PartyTaxScheme", {}, [text("cbc:CompanyID", b.vatId), vatScheme()])
        : undefined,
      el("cac:PartyLegalEntity", {}, [
        text("cbc:RegistrationName", b.name),
        b.legalRegistrationId
          ? text("cbc:CompanyID", b.legalRegistrationId.value, {
              schemeID: b.legalRegistrationId.scheme,
            })
          : undefined,
      ]),
      b.contact
        ? group("cac:Contact", {}, [
            text("cbc:Name", b.contact.name),
            text("cbc:Telephone", b.contact.phone),
            text("cbc:ElectronicMail", b.contact.email),
          ])
        : undefined,
    ]),
  ]);

  const payee = m.payee
    ? el("cac:PayeeParty", {}, [
        m.payee.identifier
          ? el("cac:PartyIdentification", {}, [
              text("cbc:ID", m.payee.identifier.value, { schemeID: m.payee.identifier.scheme }),
            ])
          : undefined,
        el("cac:PartyName", {}, [text("cbc:Name", m.payee.name)]),
        m.payee.legalRegistrationId
          ? el("cac:PartyLegalEntity", {}, [
              text("cbc:CompanyID", m.payee.legalRegistrationId.value, {
                schemeID: m.payee.legalRegistrationId.scheme,
              }),
            ])
          : undefined,
      ])
    : undefined;

  const taxRep = m.sellerTaxRepresentative
    ? el("cac:TaxRepresentativeParty", {}, [
        el("cac:PartyName", {}, [text("cbc:Name", m.sellerTaxRepresentative.name)]),
        address(m.sellerTaxRepresentative.postalAddress),
        m.sellerTaxRepresentative.vatId
          ? el("cac:PartyTaxScheme", {}, [
              text("cbc:CompanyID", m.sellerTaxRepresentative.vatId),
              vatScheme(),
            ])
          : undefined,
      ])
    : undefined;

  const d = m.delivery;
  const delivery = d
    ? group("cac:Delivery", {}, [
        text("cbc:ActualDeliveryDate", d.actualDeliveryDate),
        d.locationId || d.address
          ? el("cac:DeliveryLocation", {}, [
              d.locationId
                ? text("cbc:ID", d.locationId.value, { schemeID: d.locationId.scheme })
                : undefined,
              address(d.address, "cac:Address"),
            ])
          : undefined,
        d.deliverToName
          ? el("cac:DeliveryParty", {}, [
              el("cac:PartyName", {}, [text("cbc:Name", d.deliverToName)]),
            ])
          : undefined,
      ])
    : undefined;

  // Payment means: one element per credit transfer; card / mandate / due date (credit note) on the first.
  const p = m.paymentInstructions;
  const paymentMeans: XmlNode[] = [];
  if (p) {
    const transfers = p.creditTransfers?.length ? p.creditTransfers : [undefined];
    transfers.forEach((ct, i) => {
      const first = i === 0;
      paymentMeans.push(
        el("cac:PaymentMeans", {}, [
          text("cbc:PaymentMeansCode", p.meansTypeCode, { name: first ? p.meansText : undefined }),
          first && creditNote ? text("cbc:PaymentDueDate", m.dueDate) : undefined,
          first ? text("cbc:PaymentID", p.remittanceInfo) : undefined,
          first && p.card
            ? el("cac:CardAccount", {}, [
                text("cbc:PrimaryAccountNumberID", p.card.pan),
                text("cbc:NetworkID", "NA"),
                text("cbc:HolderName", p.card.holderName),
              ])
            : undefined,
          ct
            ? el("cac:PayeeFinancialAccount", {}, [
                text("cbc:ID", ct.account),
                text("cbc:Name", ct.accountName),
                ct.bic
                  ? el("cac:FinancialInstitutionBranch", {}, [text("cbc:ID", ct.bic)])
                  : undefined,
              ])
            : undefined,
          first && p.directDebit
            ? group("cac:PaymentMandate", {}, [
                text("cbc:ID", p.directDebit.mandateReference),
                p.directDebit.debitedAccount
                  ? el("cac:PayerFinancialAccount", {}, [
                      text("cbc:ID", p.directDebit.debitedAccount),
                    ])
                  : undefined,
              ])
            : undefined,
        ]),
      );
    });
  }

  const t = m.totals;
  const taxTotals: XmlNode[] = [
    el("cac:TaxTotal", {}, [
      text("cbc:TaxAmount", t.taxAmount ?? sumAmounts(m.vatBreakdown.map((b) => b.taxAmount)), cur),
      ...m.vatBreakdown.map((bd) =>
        el("cac:TaxSubtotal", {}, [
          text("cbc:TaxableAmount", bd.taxableAmount, cur),
          text("cbc:TaxAmount", bd.taxAmount, cur),
          taxCategory(
            "TaxCategory",
            bd.categoryCode,
            bd.rate,
            bd.exemptionReasonCode,
            bd.exemptionReason,
          ),
        ]),
      ),
    ]),
  ];
  if (t.taxAmountAccountingCurrency && m.vatAccountingCurrency) {
    taxTotals.push(
      el("cac:TaxTotal", {}, [
        text("cbc:TaxAmount", t.taxAmountAccountingCurrency, {
          currencyID: m.vatAccountingCurrency,
        }),
      ]),
    );
  }

  const totals = el("cac:LegalMonetaryTotal", {}, [
    text("cbc:LineExtensionAmount", t.lineExtension, cur),
    text("cbc:TaxExclusiveAmount", t.taxExclusive, cur),
    text("cbc:TaxInclusiveAmount", t.taxInclusive, cur),
    text("cbc:AllowanceTotalAmount", t.allowanceTotal, cur),
    text("cbc:ChargeTotalAmount", t.chargeTotal, cur),
    text("cbc:PrepaidAmount", t.paid, cur),
    text("cbc:PayableRoundingAmount", t.rounding, cur),
    text("cbc:PayableAmount", t.payable, cur),
  ]);

  const lines = m.lines.map((l) =>
    el(creditNote ? "cac:CreditNoteLine" : "cac:InvoiceLine", {}, [
      text("cbc:ID", l.id),
      text("cbc:Note", l.note),
      text(creditNote ? "cbc:CreditedQuantity" : "cbc:InvoicedQuantity", l.quantity, {
        unitCode: l.quantityUnitCode,
      }),
      text("cbc:LineExtensionAmount", l.netAmount, cur),
      text("cbc:AccountingCost", l.accountingReference),
      period("cac:InvoicePeriod", l.period),
      l.orderLineReference
        ? el("cac:OrderLineReference", {}, [text("cbc:LineID", l.orderLineReference)])
        : undefined,
      l.objectIdentifier
        ? el("cac:DocumentReference", {}, [
            text("cbc:ID", l.objectIdentifier.value, { schemeID: l.objectIdentifier.scheme }),
            text("cbc:DocumentTypeCode", "130"),
          ])
        : undefined,
      ...(l.allowances ?? []).map((a) => allowanceCharge("false", a, cur)),
      ...(l.charges ?? []).map((c) => allowanceCharge("true", c, cur)),
      el("cac:Item", {}, [
        text("cbc:Description", l.item.description),
        text("cbc:Name", l.item.name),
        l.item.buyerId
          ? el("cac:BuyersItemIdentification", {}, [text("cbc:ID", l.item.buyerId)])
          : undefined,
        l.item.sellerId
          ? el("cac:SellersItemIdentification", {}, [text("cbc:ID", l.item.sellerId)])
          : undefined,
        l.item.standardId
          ? el("cac:StandardItemIdentification", {}, [
              text("cbc:ID", l.item.standardId.value, { schemeID: l.item.standardId.scheme }),
            ])
          : undefined,
        l.item.originCountry
          ? el("cac:OriginCountry", {}, [text("cbc:IdentificationCode", l.item.originCountry)])
          : undefined,
        ...(l.item.classificationIds ?? []).map((c) =>
          el("cac:CommodityClassification", {}, [
            text("cbc:ItemClassificationCode", c.value, {
              listID: c.listId,
              listVersionID: c.listVersion,
            }),
          ]),
        ),
        taxCategory("ClassifiedTaxCategory", l.vat.categoryCode, l.vat.rate),
        ...(l.item.attributes ?? []).map((a) =>
          el("cac:AdditionalItemProperty", {}, [
            text("cbc:Name", a.name),
            text("cbc:Value", a.value),
          ]),
        ),
      ]),
      el("cac:Price", {}, [
        text("cbc:PriceAmount", l.price.netPrice, cur),
        text("cbc:BaseQuantity", l.price.baseQuantity, { unitCode: l.price.baseQuantityUnitCode }),
        l.price.discount !== undefined || l.price.grossPrice !== undefined
          ? el("cac:AllowanceCharge", {}, [
              text("cbc:ChargeIndicator", "false"),
              text("cbc:Amount", l.price.discount ?? "0", cur),
              text("cbc:BaseAmount", l.price.grossPrice, cur),
            ])
          : undefined,
      ]),
    ]),
  );

  const docRef = (name: string, id: string | undefined) =>
    id ? el(name, {}, [text("cbc:ID", id)]) : undefined;
  const invoicePeriod = period("cac:InvoicePeriod", m.invoicePeriod, m.vatPointDateCode);
  const head: XmlNode[] = creditNote
    ? [
        text("cbc:CustomizationID", m.specificationIdentifier),
        text("cbc:ProfileID", m.businessProcess),
        text("cbc:ID", m.number),
        text("cbc:IssueDate", m.issueDate),
        text("cbc:TaxPointDate", m.vatPointDate),
        text("cbc:CreditNoteTypeCode", m.typeCode),
        ...(m.notes ?? []).map((n) => text("cbc:Note", noteText(n))),
        text("cbc:DocumentCurrencyCode", m.currency),
        text("cbc:TaxCurrencyCode", m.vatAccountingCurrency),
        text("cbc:AccountingCost", m.buyerAccountingReference),
        text("cbc:BuyerReference", m.buyerReference),
        invoicePeriod,
      ]
    : [
        text("cbc:CustomizationID", m.specificationIdentifier),
        text("cbc:ProfileID", m.businessProcess),
        text("cbc:ID", m.number),
        text("cbc:IssueDate", m.issueDate),
        text("cbc:DueDate", m.dueDate),
        text("cbc:InvoiceTypeCode", m.typeCode),
        ...(m.notes ?? []).map((n) => text("cbc:Note", noteText(n))),
        text("cbc:TaxPointDate", m.vatPointDate),
        text("cbc:DocumentCurrencyCode", m.currency),
        text("cbc:TaxCurrencyCode", m.vatAccountingCurrency),
        text("cbc:AccountingCost", m.buyerAccountingReference),
        text("cbc:BuyerReference", m.buyerReference),
        invoicePeriod,
      ];

  const root = el(rootName, ns, [
    ...head,
    m.purchaseOrderReference || m.salesOrderReference
      ? el("cac:OrderReference", {}, [
          text("cbc:ID", m.purchaseOrderReference ?? "NA"),
          text("cbc:SalesOrderID", m.salesOrderReference),
        ])
      : undefined,
    ...(m.precedingInvoices ?? []).map((pi) =>
      el("cac:BillingReference", {}, [
        el("cac:InvoiceDocumentReference", {}, [
          text("cbc:ID", pi.reference),
          text("cbc:IssueDate", pi.issueDate),
        ]),
      ]),
    ),
    docRef("cac:DespatchDocumentReference", m.despatchAdviceReference),
    docRef("cac:ReceiptDocumentReference", m.receivingAdviceReference),
    docRef("cac:OriginatorDocumentReference", m.tenderOrLotReference),
    docRef("cac:ContractDocumentReference", m.contractReference),
    m.invoicedObjectIdentifier
      ? el("cac:AdditionalDocumentReference", {}, [
          text("cbc:ID", m.invoicedObjectIdentifier.value, {
            schemeID: m.invoicedObjectIdentifier.scheme,
          }),
          text("cbc:DocumentTypeCode", "130"),
        ])
      : undefined,
    ...(m.additionalDocuments ?? []).map((ad) =>
      el("cac:AdditionalDocumentReference", {}, [
        text("cbc:ID", ad.reference),
        text("cbc:DocumentDescription", ad.description),
        ad.attachment || ad.externalUri
          ? el("cac:Attachment", {}, [
              ad.attachment
                ? text("cbc:EmbeddedDocumentBinaryObject", ad.attachment.content, {
                    mimeCode: ad.attachment.mimeCode,
                    filename: ad.attachment.filename,
                  })
                : undefined,
              ad.externalUri
                ? el("cac:ExternalReference", {}, [text("cbc:URI", ad.externalUri)])
                : undefined,
            ])
          : undefined,
      ]),
    ),
    // UBL 2.1 CreditNote has no cac:ProjectReference; EN 16931 maps BT-11 to a type-50 document reference there.
    creditNote
      ? m.projectReference
        ? el("cac:AdditionalDocumentReference", {}, [
            text("cbc:ID", m.projectReference),
            text("cbc:DocumentTypeCode", "50"),
          ])
        : undefined
      : docRef("cac:ProjectReference", m.projectReference),
    seller,
    buyer,
    payee,
    taxRep,
    delivery,
    ...paymentMeans,
    m.paymentTerms ? el("cac:PaymentTerms", {}, [text("cbc:Note", m.paymentTerms)]) : undefined,
    ...(m.allowances ?? []).map((a) => allowanceCharge("false", a, cur)),
    ...(m.charges ?? []).map((c) => allowanceCharge("true", c, cur)),
    ...taxTotals,
    totals,
    ...lines,
  ]);
  return document(root);
}
