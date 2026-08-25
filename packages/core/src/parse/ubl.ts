/** UBL 2.1 (Invoice + CreditNote) → InvoiceModel mapping table (EN 16931-3-2). Paths are relative to the root element. */
import type { GroupSpec } from "./engine.js";

const ID = (path: string): GroupSpec => ({ fields: { value: path, scheme: `${path}/@schemeID` } });
const idGroup = (path: string) => ({ path, spec: { fields: { value: ".", scheme: "@schemeID" } } });

const ADDRESS: GroupSpec = {
  fields: {
    line1: "cbc:StreetName",
    line2: "cbc:AdditionalStreetName",
    line3: "cac:AddressLine/cbc:Line",
    city: "cbc:CityName",
    postCode: "cbc:PostalZone",
    countrySubdivision: "cbc:CountrySubentity",
    countryCode: "cac:Country/cbc:IdentificationCode",
  },
};

const CONTACT: GroupSpec = {
  fields: { name: "cbc:Name", phone: "cbc:Telephone", email: "cbc:ElectronicMail" },
};

const PARTY_COMMON = {
  tradingName: "cac:PartyName/cbc:Name",
  vatId: "cac:PartyTaxScheme[cac:TaxScheme/cbc:ID='VAT']/cbc:CompanyID",
};

const SELLER: GroupSpec = {
  fields: {
    name: "cac:PartyLegalEntity/cbc:RegistrationName",
    ...PARTY_COMMON,
    taxRegistrationId: "cac:PartyTaxScheme[cac:TaxScheme/cbc:ID!='VAT']/cbc:CompanyID",
    additionalLegalInfo: "cac:PartyLegalEntity/cbc:CompanyLegalForm",
  },
  groups: {
    identifiers: {
      path: "cac:PartyIdentification/cbc:ID[not(@schemeID='SEPA')]",
      many: true,
      spec: ID("."),
    },
    legalRegistrationId: idGroup("cac:PartyLegalEntity/cbc:CompanyID"),
    electronicAddress: idGroup("cbc:EndpointID"),
    postalAddress: { path: "cac:PostalAddress", spec: ADDRESS },
    contact: { path: "cac:Contact", spec: CONTACT },
  },
};

const BUYER: GroupSpec = {
  fields: { name: "cac:PartyLegalEntity/cbc:RegistrationName", ...PARTY_COMMON },
  groups: {
    identifier: idGroup("cac:PartyIdentification/cbc:ID"),
    legalRegistrationId: idGroup("cac:PartyLegalEntity/cbc:CompanyID"),
    electronicAddress: idGroup("cbc:EndpointID"),
    postalAddress: { path: "cac:PostalAddress", spec: ADDRESS },
    contact: { path: "cac:Contact", spec: CONTACT },
  },
};

const ALLOWANCE_CHARGE_DOC: GroupSpec = {
  fields: {
    amount: "cbc:Amount",
    baseAmount: "cbc:BaseAmount",
    percentage: "cbc:MultiplierFactorNumeric",
    vatCategoryCode: "cac:TaxCategory/cbc:ID",
    vatRate: "cac:TaxCategory/cbc:Percent",
    reason: "cbc:AllowanceChargeReason",
    reasonCode: "cbc:AllowanceChargeReasonCode",
  },
};

const ALLOWANCE_CHARGE_LINE: GroupSpec = {
  fields: {
    amount: "cbc:Amount",
    baseAmount: "cbc:BaseAmount",
    percentage: "cbc:MultiplierFactorNumeric",
    reason: "cbc:AllowanceChargeReason",
    reasonCode: "cbc:AllowanceChargeReasonCode",
  },
};

const PERIOD: GroupSpec = {
  fields: {
    start: { path: "cbc:StartDate", date: true },
    end: { path: "cbc:EndDate", date: true },
  },
};

const LINE: GroupSpec = {
  fields: {
    id: "cbc:ID",
    note: "cbc:Note",
    quantity: "cbc:InvoicedQuantity | cbc:CreditedQuantity",
    quantityUnitCode: "(cbc:InvoicedQuantity | cbc:CreditedQuantity)/@unitCode",
    netAmount: "cbc:LineExtensionAmount",
    orderLineReference: "cac:OrderLineReference/cbc:LineID",
    accountingReference: "cbc:AccountingCost",
  },
  groups: {
    objectIdentifier: idGroup("cac:DocumentReference[cbc:DocumentTypeCode='130']/cbc:ID"),
    period: { path: "cac:InvoicePeriod", spec: PERIOD },
    allowances: {
      path: "cac:AllowanceCharge[cbc:ChargeIndicator='false']",
      many: true,
      spec: ALLOWANCE_CHARGE_LINE,
    },
    charges: {
      path: "cac:AllowanceCharge[cbc:ChargeIndicator='true']",
      many: true,
      spec: ALLOWANCE_CHARGE_LINE,
    },
    price: {
      path: "cac:Price",
      spec: {
        fields: {
          netPrice: "cbc:PriceAmount",
          discount: "cac:AllowanceCharge[cbc:ChargeIndicator='false']/cbc:Amount",
          grossPrice: "cac:AllowanceCharge[cbc:ChargeIndicator='false']/cbc:BaseAmount",
          baseQuantity: "cbc:BaseQuantity",
          baseQuantityUnitCode: "cbc:BaseQuantity/@unitCode",
        },
      },
    },
    vat: {
      path: "cac:Item/cac:ClassifiedTaxCategory",
      spec: { fields: { categoryCode: "cbc:ID", rate: "cbc:Percent" } },
    },
    item: {
      path: "cac:Item",
      spec: {
        fields: {
          name: "cbc:Name",
          description: "cbc:Description",
          sellerId: "cac:SellersItemIdentification/cbc:ID",
          buyerId: "cac:BuyersItemIdentification/cbc:ID",
          originCountry: "cac:OriginCountry/cbc:IdentificationCode",
        },
        groups: {
          standardId: idGroup("cac:StandardItemIdentification/cbc:ID"),
          classificationIds: {
            path: "cac:CommodityClassification/cbc:ItemClassificationCode",
            many: true,
            spec: { fields: { value: ".", listId: "@listID", listVersion: "@listVersionID" } },
          },
          attributes: {
            path: "cac:AdditionalItemProperty",
            many: true,
            spec: { fields: { name: "cbc:Name", value: "cbc:Value" } },
          },
        },
      },
    },
  },
};

/** UBL encodes BT-21 as a "#CODE#" prefix inside cbc:Note. */
const NOTE: GroupSpec = {
  fields: { note: "." },
  post(o) {
    const m = /^#([A-Z]{3})#([\s\S]*)$/.exec(String(o.note ?? ""));
    return m ? { subjectCode: m[1], note: m[2] } : o;
  },
};

export const UBL_MAP: GroupSpec = {
  fields: {
    number: "cbc:ID",
    issueDate: { path: "cbc:IssueDate", date: true },
    typeCode: "cbc:InvoiceTypeCode | cbc:CreditNoteTypeCode",
    currency: "cbc:DocumentCurrencyCode",
    vatAccountingCurrency: "cbc:TaxCurrencyCode",
    vatPointDate: { path: "cbc:TaxPointDate", date: true },
    vatPointDateCode: "cac:InvoicePeriod/cbc:DescriptionCode",
    dueDate: { path: "cbc:DueDate | cac:PaymentMeans/cbc:PaymentDueDate", date: true },
    buyerReference: "cbc:BuyerReference",
    projectReference: "cac:ProjectReference/cbc:ID",
    contractReference: "cac:ContractDocumentReference/cbc:ID",
    purchaseOrderReference: "cac:OrderReference/cbc:ID",
    salesOrderReference: "cac:OrderReference/cbc:SalesOrderID",
    receivingAdviceReference: "cac:ReceiptDocumentReference/cbc:ID",
    despatchAdviceReference: "cac:DespatchDocumentReference/cbc:ID",
    tenderOrLotReference: "cac:OriginatorDocumentReference/cbc:ID",
    buyerAccountingReference: "cbc:AccountingCost",
    paymentTerms: "cac:PaymentTerms/cbc:Note",
    businessProcess: "cbc:ProfileID",
    specificationIdentifier: "cbc:CustomizationID",
  },
  groups: {
    invoicedObjectIdentifier: idGroup(
      "cac:AdditionalDocumentReference[cbc:DocumentTypeCode='130']/cbc:ID",
    ),
    notes: { path: "cbc:Note", many: true, spec: NOTE },
    precedingInvoices: {
      path: "cac:BillingReference/cac:InvoiceDocumentReference",
      many: true,
      spec: { fields: { reference: "cbc:ID", issueDate: { path: "cbc:IssueDate", date: true } } },
    },
    invoicePeriod: { path: "cac:InvoicePeriod[cbc:StartDate or cbc:EndDate]", spec: PERIOD },
    seller: { path: "cac:AccountingSupplierParty/cac:Party", spec: SELLER },
    buyer: { path: "cac:AccountingCustomerParty/cac:Party", spec: BUYER },
    payee: {
      path: "cac:PayeeParty",
      spec: {
        fields: { name: "cac:PartyName/cbc:Name" },
        groups: {
          identifier: idGroup("cac:PartyIdentification/cbc:ID"),
          legalRegistrationId: idGroup("cac:PartyLegalEntity/cbc:CompanyID"),
        },
      },
    },
    sellerTaxRepresentative: {
      path: "cac:TaxRepresentativeParty",
      spec: {
        fields: { name: "cac:PartyName/cbc:Name", vatId: "cac:PartyTaxScheme/cbc:CompanyID" },
        groups: { postalAddress: { path: "cac:PostalAddress", spec: ADDRESS } },
      },
    },
    delivery: {
      path: "cac:Delivery",
      spec: {
        fields: {
          deliverToName: "cac:DeliveryParty/cac:PartyName/cbc:Name",
          actualDeliveryDate: { path: "cbc:ActualDeliveryDate", date: true },
        },
        groups: {
          locationId: idGroup("cac:DeliveryLocation/cbc:ID"),
          address: { path: "cac:DeliveryLocation/cac:Address", spec: ADDRESS },
        },
      },
    },
    paymentInstructions: {
      path: "self::*[cac:PaymentMeans]",
      spec: {
        fields: {
          meansTypeCode: "cac:PaymentMeans[1]/cbc:PaymentMeansCode",
          meansText: "cac:PaymentMeans[1]/cbc:PaymentMeansCode/@name",
          remittanceInfo: "cac:PaymentMeans[1]/cbc:PaymentID",
        },
        groups: {
          creditTransfers: {
            path: "cac:PaymentMeans/cac:PayeeFinancialAccount",
            many: true,
            spec: {
              fields: {
                account: "cbc:ID",
                accountName: "cbc:Name",
                bic: "cac:FinancialInstitutionBranch/cbc:ID",
              },
            },
          },
          card: {
            path: "cac:PaymentMeans/cac:CardAccount",
            spec: { fields: { pan: "cbc:PrimaryAccountNumberID", holderName: "cbc:HolderName" } },
          },
          directDebit: {
            path: "cac:PaymentMeans[cac:PaymentMandate]",
            spec: {
              fields: {
                mandateReference: "cac:PaymentMandate/cbc:ID",
                creditorId:
                  "/*/cac:AccountingSupplierParty/cac:Party/cac:PartyIdentification/cbc:ID[@schemeID='SEPA'] | /*/cac:PayeeParty/cac:PartyIdentification/cbc:ID[@schemeID='SEPA']",
                debitedAccount: "cac:PaymentMandate/cac:PayerFinancialAccount/cbc:ID",
              },
            },
          },
        },
      },
    },
    allowances: {
      path: "cac:AllowanceCharge[cbc:ChargeIndicator='false']",
      many: true,
      spec: ALLOWANCE_CHARGE_DOC,
    },
    charges: {
      path: "cac:AllowanceCharge[cbc:ChargeIndicator='true']",
      many: true,
      spec: ALLOWANCE_CHARGE_DOC,
    },
    totals: {
      path: "cac:LegalMonetaryTotal",
      spec: {
        fields: {
          lineExtension: "cbc:LineExtensionAmount",
          allowanceTotal: "cbc:AllowanceTotalAmount",
          chargeTotal: "cbc:ChargeTotalAmount",
          taxExclusive: "cbc:TaxExclusiveAmount",
          taxAmount: "../cac:TaxTotal/cbc:TaxAmount[@currencyID=/*/cbc:DocumentCurrencyCode]",
          taxAmountAccountingCurrency:
            "../cac:TaxTotal/cbc:TaxAmount[@currencyID=/*/cbc:TaxCurrencyCode]",
          taxInclusive: "cbc:TaxInclusiveAmount",
          paid: "cbc:PrepaidAmount",
          rounding: "cbc:PayableRoundingAmount",
          payable: "cbc:PayableAmount",
        },
      },
    },
    vatBreakdown: {
      path: "cac:TaxTotal/cac:TaxSubtotal",
      many: true,
      spec: {
        fields: {
          taxableAmount: "cbc:TaxableAmount",
          taxAmount: "cbc:TaxAmount",
          categoryCode: "cac:TaxCategory/cbc:ID",
          rate: "cac:TaxCategory/cbc:Percent",
          exemptionReason: "cac:TaxCategory/cbc:TaxExemptionReason",
          exemptionReasonCode: "cac:TaxCategory/cbc:TaxExemptionReasonCode",
        },
      },
    },
    additionalDocuments: {
      path: "cac:AdditionalDocumentReference[not(cbc:DocumentTypeCode='130')]",
      many: true,
      spec: {
        fields: {
          reference: "cbc:ID",
          description: "cbc:DocumentDescription",
          externalUri: "cac:Attachment/cac:ExternalReference/cbc:URI",
        },
        groups: {
          attachment: {
            path: "cac:Attachment/cbc:EmbeddedDocumentBinaryObject",
            spec: { fields: { content: ".", mimeCode: "@mimeCode", filename: "@filename" } },
          },
        },
      },
    },
    lines: { path: "cac:InvoiceLine | cac:CreditNoteLine", many: true, spec: LINE },
  },
};
