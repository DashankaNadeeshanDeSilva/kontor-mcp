/** InvoiceModel → UN/CEFACT CII D16B (CrossIndustryInvoice), the inverse of parse/cii.ts (EN 16931-3-3). */
import { Decimal } from "decimal.js";
import type { InvoiceModel, PostalAddress } from "../model/schema.js";
import { document, el, group, text, type XmlNode } from "./xml.js";

const NS = {
  "xmlns:rsm": "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
  "xmlns:ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
  "xmlns:qdt": "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
  "xmlns:udt": "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",
};

const sumAmounts = (xs: string[]) => xs.reduce((acc, x) => acc.plus(x), new Decimal(0)).toFixed(2);
const ymd = (iso: string) => iso.replace(/-/g, "");
const dateTime = (name: string, iso: string | undefined) =>
  iso ? el(name, {}, [text("udt:DateTimeString", ymd(iso), { format: "102" })]) : undefined;
const IBAN_SHAPE = /^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/;

const address = (a: PostalAddress | undefined): XmlNode[] | undefined =>
  a
    ? group("ram:PostalTradeAddress", {}, [
        text("ram:PostcodeCode", a.postCode),
        text("ram:LineOne", a.line1),
        text("ram:LineTwo", a.line2),
        text("ram:LineThree", a.line3),
        text("ram:CityName", a.city),
        text("ram:CountryID", a.countryCode),
        text("ram:CountrySubDivisionName", a.countrySubdivision),
      ])
    : undefined;

const ids = (list: { value: string; scheme?: string | undefined }[]) =>
  list.map((id) =>
    id.scheme ? text("ram:GlobalID", id.value, { schemeID: id.scheme }) : text("ram:ID", id.value),
  );

function party(
  name: string,
  p: {
    name: string;
    tradingName?: string | undefined;
    vatId?: string | undefined;
    taxRegistrationId?: string | undefined;
    additionalLegalInfo?: string | undefined;
    legalRegistrationId?: { value: string; scheme?: string | undefined } | undefined;
    electronicAddress?: { value: string; scheme?: string | undefined } | undefined;
    postalAddress?: PostalAddress | undefined;
    contact?:
      | { name?: string | undefined; phone?: string | undefined; email?: string | undefined }
      | undefined;
  },
  identifiers: { value: string; scheme?: string | undefined }[],
): XmlNode[] {
  return el(name, {}, [
    ...ids(identifiers),
    text("ram:Name", p.name),
    text("ram:Description", p.additionalLegalInfo),
    p.legalRegistrationId || p.tradingName
      ? el("ram:SpecifiedLegalOrganization", {}, [
          p.legalRegistrationId
            ? text("ram:ID", p.legalRegistrationId.value, {
                schemeID: p.legalRegistrationId.scheme,
              })
            : undefined,
          text("ram:TradingBusinessName", p.tradingName),
        ])
      : undefined,
    p.contact
      ? group("ram:DefinedTradeContact", {}, [
          text("ram:PersonName", p.contact.name),
          p.contact.phone
            ? el("ram:TelephoneUniversalCommunication", {}, [
                text("ram:CompleteNumber", p.contact.phone),
              ])
            : undefined,
          p.contact.email
            ? el("ram:EmailURIUniversalCommunication", {}, [text("ram:URIID", p.contact.email)])
            : undefined,
        ])
      : undefined,
    address(p.postalAddress),
    p.electronicAddress
      ? el("ram:URIUniversalCommunication", {}, [
          text("ram:URIID", p.electronicAddress.value, { schemeID: p.electronicAddress.scheme }),
        ])
      : undefined,
    p.vatId
      ? el("ram:SpecifiedTaxRegistration", {}, [text("ram:ID", p.vatId, { schemeID: "VA" })])
      : undefined,
    p.taxRegistrationId
      ? el("ram:SpecifiedTaxRegistration", {}, [
          text("ram:ID", p.taxRegistrationId, { schemeID: "FC" }),
        ])
      : undefined,
  ]);
}

const chargeIndicator = (v: "true" | "false") =>
  el("ram:ChargeIndicator", {}, [text("udt:Indicator", v)]);
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
) =>
  el("ram:SpecifiedTradeAllowanceCharge", {}, [
    chargeIndicator(indicator),
    text("ram:CalculationPercent", ac.percentage),
    text("ram:BasisAmount", ac.baseAmount),
    text("ram:ActualAmount", ac.amount),
    text("ram:ReasonCode", ac.reasonCode),
    text("ram:Reason", ac.reason),
    ac.vatCategoryCode
      ? el("ram:CategoryTradeTax", {}, [
          text("ram:TypeCode", "VAT"),
          text("ram:CategoryCode", ac.vatCategoryCode),
          text("ram:RateApplicablePercent", ac.vatRate),
        ])
      : undefined,
  ]);

const period = (p: { start?: string | undefined; end?: string | undefined } | undefined) =>
  p
    ? group("ram:BillingSpecifiedPeriod", {}, [
        dateTime("ram:StartDateTime", p.start),
        dateTime("ram:EndDateTime", p.end),
      ])
    : undefined;

const refDoc = (name: string, id: string | undefined, extra: XmlNode[] = []) =>
  id ? el(name, {}, [text("ram:IssuerAssignedID", id), ...extra]) : undefined;

export function modelToCii(m: InvoiceModel): string {
  const cur = { currencyID: m.currency };
  const lines = m.lines.map((l) =>
    el("ram:IncludedSupplyChainTradeLineItem", {}, [
      el("ram:AssociatedDocumentLineDocument", {}, [
        text("ram:LineID", l.id),
        l.note ? el("ram:IncludedNote", {}, [text("ram:Content", l.note)]) : undefined,
      ]),
      el("ram:SpecifiedTradeProduct", {}, [
        l.item.standardId
          ? text("ram:GlobalID", l.item.standardId.value, { schemeID: l.item.standardId.scheme })
          : undefined,
        text("ram:SellerAssignedID", l.item.sellerId),
        text("ram:BuyerAssignedID", l.item.buyerId),
        text("ram:Name", l.item.name),
        text("ram:Description", l.item.description),
        ...(l.item.attributes ?? []).map((a) =>
          el("ram:ApplicableProductCharacteristic", {}, [
            text("ram:Description", a.name),
            text("ram:Value", a.value),
          ]),
        ),
        ...(l.item.classificationIds ?? []).map((c) =>
          el("ram:DesignatedProductClassification", {}, [
            text("ram:ClassCode", c.value, { listID: c.listId, listVersionID: c.listVersion }),
          ]),
        ),
        l.item.originCountry
          ? el("ram:OriginTradeCountry", {}, [text("ram:ID", l.item.originCountry)])
          : undefined,
      ]),
      el("ram:SpecifiedLineTradeAgreement", {}, [
        l.orderLineReference
          ? el("ram:BuyerOrderReferencedDocument", {}, [text("ram:LineID", l.orderLineReference)])
          : undefined,
        l.price.grossPrice !== undefined || l.price.discount !== undefined
          ? el("ram:GrossPriceProductTradePrice", {}, [
              text("ram:ChargeAmount", l.price.grossPrice ?? l.price.netPrice),
              l.price.discount !== undefined
                ? el("ram:AppliedTradeAllowanceCharge", {}, [
                    chargeIndicator("false"),
                    text("ram:ActualAmount", l.price.discount),
                  ])
                : undefined,
            ])
          : undefined,
        el("ram:NetPriceProductTradePrice", {}, [
          text("ram:ChargeAmount", l.price.netPrice),
          text("ram:BasisQuantity", l.price.baseQuantity, {
            unitCode: l.price.baseQuantityUnitCode,
          }),
        ]),
      ]),
      el("ram:SpecifiedLineTradeDelivery", {}, [
        text("ram:BilledQuantity", l.quantity, { unitCode: l.quantityUnitCode }),
      ]),
      el("ram:SpecifiedLineTradeSettlement", {}, [
        el("ram:ApplicableTradeTax", {}, [
          text("ram:TypeCode", "VAT"),
          text("ram:CategoryCode", l.vat.categoryCode),
          text("ram:RateApplicablePercent", l.vat.rate),
        ]),
        period(l.period),
        ...(l.allowances ?? []).map((a) => allowanceCharge("false", a)),
        ...(l.charges ?? []).map((c) => allowanceCharge("true", c)),
        el("ram:SpecifiedTradeSettlementLineMonetarySummation", {}, [
          text("ram:LineTotalAmount", l.netAmount),
        ]),
        l.objectIdentifier
          ? el("ram:AdditionalReferencedDocument", {}, [
              text("ram:IssuerAssignedID", l.objectIdentifier.value),
              text("ram:TypeCode", "130"),
              text("ram:ReferenceTypeCode", l.objectIdentifier.scheme),
            ])
          : undefined,
        l.accountingReference
          ? el("ram:ReceivableSpecifiedTradeAccountingAccount", {}, [
              text("ram:ID", l.accountingReference),
            ])
          : undefined,
      ]),
    ]),
  );

  const s = m.seller;
  const b = m.buyer;
  const agreement = el("ram:ApplicableHeaderTradeAgreement", {}, [
    text("ram:BuyerReference", m.buyerReference),
    party("ram:SellerTradeParty", s, s.identifiers ?? []),
    party("ram:BuyerTradeParty", b, b.identifier ? [b.identifier] : []),
    m.sellerTaxRepresentative
      ? party("ram:SellerTaxRepresentativeTradeParty", m.sellerTaxRepresentative, [])
      : undefined,
    refDoc("ram:SellerOrderReferencedDocument", m.salesOrderReference),
    refDoc("ram:BuyerOrderReferencedDocument", m.purchaseOrderReference),
    refDoc("ram:ContractReferencedDocument", m.contractReference),
    ...(m.additionalDocuments ?? []).map((ad) =>
      el("ram:AdditionalReferencedDocument", {}, [
        text("ram:IssuerAssignedID", ad.reference),
        text("ram:URIID", ad.externalUri),
        text("ram:TypeCode", "916"),
        text("ram:Name", ad.description),
        ad.attachment
          ? text("ram:AttachmentBinaryObject", ad.attachment.content, {
              mimeCode: ad.attachment.mimeCode,
              filename: ad.attachment.filename,
            })
          : undefined,
      ]),
    ),
    m.tenderOrLotReference
      ? el("ram:AdditionalReferencedDocument", {}, [
          text("ram:IssuerAssignedID", m.tenderOrLotReference),
          text("ram:TypeCode", "50"),
        ])
      : undefined,
    m.invoicedObjectIdentifier
      ? el("ram:AdditionalReferencedDocument", {}, [
          text("ram:IssuerAssignedID", m.invoicedObjectIdentifier.value),
          text("ram:TypeCode", "130"),
          text("ram:ReferenceTypeCode", m.invoicedObjectIdentifier.scheme),
        ])
      : undefined,
    m.projectReference
      ? el("ram:SpecifiedProcuringProject", {}, [
          text("ram:ID", m.projectReference),
          text("ram:Name", "Project reference"),
        ])
      : undefined,
  ]);

  const d = m.delivery;
  const delivery = el("ram:ApplicableHeaderTradeDelivery", {}, [
    d && (d.deliverToName || d.locationId || d.address)
      ? el("ram:ShipToTradeParty", {}, [
          d.locationId
            ? d.locationId.scheme
              ? text("ram:GlobalID", d.locationId.value, { schemeID: d.locationId.scheme })
              : text("ram:ID", d.locationId.value)
            : undefined,
          text("ram:Name", d.deliverToName),
          address(d.address),
        ])
      : undefined,
    d?.actualDeliveryDate
      ? el("ram:ActualDeliverySupplyChainEvent", {}, [
          dateTime("ram:OccurrenceDateTime", d.actualDeliveryDate),
        ])
      : undefined,
    refDoc("ram:DespatchAdviceReferencedDocument", m.despatchAdviceReference),
    refDoc("ram:ReceivingAdviceReferencedDocument", m.receivingAdviceReference),
  ]);

  const p = m.paymentInstructions;
  const paymentMeans: XmlNode[] = [];
  if (p) {
    const transfers = p.creditTransfers?.length ? p.creditTransfers : [undefined];
    transfers.forEach((ct, i) => {
      const first = i === 0;
      paymentMeans.push(
        el("ram:SpecifiedTradeSettlementPaymentMeans", {}, [
          text("ram:TypeCode", p.meansTypeCode),
          first ? text("ram:Information", p.meansText) : undefined,
          first && p.card
            ? el("ram:ApplicableTradeSettlementFinancialCard", {}, [
                text("ram:ID", p.card.pan),
                text("ram:CardholderName", p.card.holderName),
              ])
            : undefined,
          first && p.directDebit?.debitedAccount
            ? el("ram:PayerPartyDebtorFinancialAccount", {}, [
                text("ram:IBANID", p.directDebit.debitedAccount),
              ])
            : undefined,
          ct
            ? el("ram:PayeePartyCreditorFinancialAccount", {}, [
                IBAN_SHAPE.test(ct.account.replace(/\s+/g, ""))
                  ? text("ram:IBANID", ct.account)
                  : undefined,
                text("ram:AccountName", ct.accountName),
                IBAN_SHAPE.test(ct.account.replace(/\s+/g, ""))
                  ? undefined
                  : text("ram:ProprietaryID", ct.account),
              ])
            : undefined,
          ct?.bic
            ? el("ram:PayeeSpecifiedCreditorFinancialInstitution", {}, [text("ram:BICID", ct.bic)])
            : undefined,
        ]),
      );
    });
  }

  const t = m.totals;
  const settlement = el("ram:ApplicableHeaderTradeSettlement", {}, [
    text("ram:CreditorReferenceID", p?.directDebit?.creditorId),
    text("ram:PaymentReference", p?.remittanceInfo),
    text("ram:TaxCurrencyCode", m.vatAccountingCurrency),
    text("ram:InvoiceCurrencyCode", m.currency),
    m.payee
      ? el("ram:PayeeTradeParty", {}, [
          ...ids(m.payee.identifier ? [m.payee.identifier] : []),
          text("ram:Name", m.payee.name),
          m.payee.legalRegistrationId
            ? el("ram:SpecifiedLegalOrganization", {}, [
                text("ram:ID", m.payee.legalRegistrationId.value, {
                  schemeID: m.payee.legalRegistrationId.scheme,
                }),
              ])
            : undefined,
        ])
      : undefined,
    ...paymentMeans,
    ...m.vatBreakdown.map((bd, i) =>
      el("ram:ApplicableTradeTax", {}, [
        text("ram:CalculatedAmount", bd.taxAmount),
        text("ram:TypeCode", "VAT"),
        text("ram:ExemptionReason", bd.exemptionReason),
        text("ram:BasisAmount", bd.taxableAmount),
        text("ram:CategoryCode", bd.categoryCode),
        text("ram:ExemptionReasonCode", bd.exemptionReasonCode),
        i === 0 && m.vatPointDate
          ? el("ram:TaxPointDate", {}, [
              text("udt:DateString", ymd(m.vatPointDate), { format: "102" }),
            ])
          : undefined,
        i === 0 ? text("ram:DueDateTypeCode", m.vatPointDateCode) : undefined,
        text("ram:RateApplicablePercent", bd.rate),
      ]),
    ),
    period(m.invoicePeriod),
    ...(m.allowances ?? []).map((a) => allowanceCharge("false", a)),
    ...(m.charges ?? []).map((c) => allowanceCharge("true", c)),
    m.paymentTerms || m.dueDate || p?.directDebit?.mandateReference
      ? el("ram:SpecifiedTradePaymentTerms", {}, [
          text("ram:Description", m.paymentTerms),
          dateTime("ram:DueDateDateTime", m.dueDate),
          text("ram:DirectDebitMandateID", p?.directDebit?.mandateReference),
        ])
      : undefined,
    el("ram:SpecifiedTradeSettlementHeaderMonetarySummation", {}, [
      text("ram:LineTotalAmount", t.lineExtension),
      text("ram:ChargeTotalAmount", t.chargeTotal),
      text("ram:AllowanceTotalAmount", t.allowanceTotal),
      text("ram:TaxBasisTotalAmount", t.taxExclusive),
      text(
        "ram:TaxTotalAmount",
        t.taxAmount ?? sumAmounts(m.vatBreakdown.map((x) => x.taxAmount)),
        cur,
      ),
      t.taxAmountAccountingCurrency && m.vatAccountingCurrency
        ? text("ram:TaxTotalAmount", t.taxAmountAccountingCurrency, {
            currencyID: m.vatAccountingCurrency,
          })
        : undefined,
      text("ram:RoundingAmount", t.rounding),
      text("ram:GrandTotalAmount", t.taxInclusive),
      text("ram:TotalPrepaidAmount", t.paid),
      text("ram:DuePayableAmount", t.payable),
    ]),
    // CII D16B allows a single InvoiceReferencedDocument (BG-3 is 0..n in EN 16931): only the first survives.
    ...(m.precedingInvoices ?? [])
      .slice(0, 1)
      .map((pi) =>
        el("ram:InvoiceReferencedDocument", {}, [
          text("ram:IssuerAssignedID", pi.reference),
          pi.issueDate
            ? el("ram:FormattedIssueDateTime", {}, [
                text("qdt:DateTimeString", ymd(pi.issueDate), { format: "102" }),
              ])
            : undefined,
        ]),
      ),
    m.buyerAccountingReference
      ? el("ram:ReceivableSpecifiedTradeAccountingAccount", {}, [
          text("ram:ID", m.buyerAccountingReference),
        ])
      : undefined,
  ]);

  const root = el("rsm:CrossIndustryInvoice", NS, [
    el("rsm:ExchangedDocumentContext", {}, [
      m.businessProcess
        ? el("ram:BusinessProcessSpecifiedDocumentContextParameter", {}, [
            text("ram:ID", m.businessProcess),
          ])
        : undefined,
      el("ram:GuidelineSpecifiedDocumentContextParameter", {}, [
        text("ram:ID", m.specificationIdentifier),
      ]),
    ]),
    el("rsm:ExchangedDocument", {}, [
      text("ram:ID", m.number),
      text("ram:TypeCode", m.typeCode),
      dateTime("ram:IssueDateTime", m.issueDate),
      ...(m.notes ?? []).map((n) =>
        el("ram:IncludedNote", {}, [
          text("ram:Content", n.note),
          text("ram:SubjectCode", n.subjectCode),
        ]),
      ),
    ]),
    el("rsm:SupplyChainTradeTransaction", {}, [...lines, agreement, delivery, settlement]),
  ]);
  return document(root);
}
