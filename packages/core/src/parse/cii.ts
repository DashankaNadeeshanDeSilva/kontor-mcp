/** UN/CEFACT CII D16B → InvoiceModel mapping table (EN 16931-3-3). Paths are relative to rsm:CrossIndustryInvoice. */
import type { GroupSpec } from "./engine.js";

const idGroup = (path: string) => ({ path, spec: { fields: { value: ".", scheme: "@schemeID" } } });
const DT = (path: string) => ({ path: `${path}/udt:DateTimeString`, date: true as const });

const HTA = "rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeAgreement";
const HTD = "rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeDelivery";
const HTS = "rsm:SupplyChainTradeTransaction/ram:ApplicableHeaderTradeSettlement";

const ADDRESS: GroupSpec = {
  fields: {
    line1: "ram:LineOne",
    line2: "ram:LineTwo",
    line3: "ram:LineThree",
    city: "ram:CityName",
    postCode: "ram:PostcodeCode",
    countrySubdivision: "ram:CountrySubDivisionName",
    countryCode: "ram:CountryID",
  },
};

const CONTACT: GroupSpec = {
  fields: {
    name: "ram:PersonName | ram:DepartmentName",
    phone: "ram:TelephoneUniversalCommunication/ram:CompleteNumber",
    email: "ram:EmailURIUniversalCommunication/ram:URIID",
  },
};

const PARTY_COMMON = {
  name: "ram:Name",
  tradingName: "ram:SpecifiedLegalOrganization/ram:TradingBusinessName",
  vatId: "ram:SpecifiedTaxRegistration/ram:ID[@schemeID='VA']",
};
const PARTY_GROUPS = {
  legalRegistrationId: idGroup("ram:SpecifiedLegalOrganization/ram:ID"),
  electronicAddress: idGroup("ram:URIUniversalCommunication/ram:URIID"),
  postalAddress: { path: "ram:PostalTradeAddress", spec: ADDRESS },
  contact: { path: "ram:DefinedTradeContact", spec: CONTACT },
};

const SELLER: GroupSpec = {
  fields: {
    ...PARTY_COMMON,
    taxRegistrationId: "ram:SpecifiedTaxRegistration/ram:ID[@schemeID='FC']",
    additionalLegalInfo: "ram:Description",
  },
  groups: {
    identifiers: {
      path: "ram:ID | ram:GlobalID",
      many: true,
      spec: { fields: { value: ".", scheme: "@schemeID" } },
    },
    ...PARTY_GROUPS,
  },
};

const BUYER: GroupSpec = {
  fields: PARTY_COMMON,
  groups: { identifier: idGroup("ram:ID | ram:GlobalID"), ...PARTY_GROUPS },
};

const AC_FALSE = "[ram:ChargeIndicator/udt:Indicator='false']";
const AC_TRUE = "[ram:ChargeIndicator/udt:Indicator='true']";

const ALLOWANCE_CHARGE_DOC: GroupSpec = {
  fields: {
    amount: "ram:ActualAmount",
    baseAmount: "ram:BasisAmount",
    percentage: "ram:CalculationPercent",
    vatCategoryCode: "ram:CategoryTradeTax/ram:CategoryCode",
    vatRate: "ram:CategoryTradeTax/ram:RateApplicablePercent",
    reason: "ram:Reason",
    reasonCode: "ram:ReasonCode",
  },
};
const ALLOWANCE_CHARGE_LINE: GroupSpec = {
  fields: {
    amount: "ram:ActualAmount",
    baseAmount: "ram:BasisAmount",
    percentage: "ram:CalculationPercent",
    reason: "ram:Reason",
    reasonCode: "ram:ReasonCode",
  },
};

const PERIOD: GroupSpec = {
  fields: { start: DT("ram:StartDateTime"), end: DT("ram:EndDateTime") },
};

const LINE: GroupSpec = {
  fields: {
    id: "ram:AssociatedDocumentLineDocument/ram:LineID",
    note: "ram:AssociatedDocumentLineDocument/ram:IncludedNote/ram:Content",
    quantity: "ram:SpecifiedLineTradeDelivery/ram:BilledQuantity",
    quantityUnitCode: "ram:SpecifiedLineTradeDelivery/ram:BilledQuantity/@unitCode",
    netAmount:
      "ram:SpecifiedLineTradeSettlement/ram:SpecifiedTradeSettlementLineMonetarySummation/ram:LineTotalAmount",
    orderLineReference:
      "ram:SpecifiedLineTradeAgreement/ram:BuyerOrderReferencedDocument/ram:LineID",
    accountingReference:
      "ram:SpecifiedLineTradeSettlement/ram:ReceivableSpecifiedTradeAccountingAccount/ram:ID",
  },
  groups: {
    objectIdentifier: {
      path: "ram:SpecifiedLineTradeSettlement/ram:AdditionalReferencedDocument[ram:TypeCode='130']",
      spec: { fields: { value: "ram:IssuerAssignedID", scheme: "ram:ReferenceTypeCode" } },
    },
    period: { path: "ram:SpecifiedLineTradeSettlement/ram:BillingSpecifiedPeriod", spec: PERIOD },
    allowances: {
      path: `ram:SpecifiedLineTradeSettlement/ram:SpecifiedTradeAllowanceCharge${AC_FALSE}`,
      many: true,
      spec: ALLOWANCE_CHARGE_LINE,
    },
    charges: {
      path: `ram:SpecifiedLineTradeSettlement/ram:SpecifiedTradeAllowanceCharge${AC_TRUE}`,
      many: true,
      spec: ALLOWANCE_CHARGE_LINE,
    },
    price: {
      path: "ram:SpecifiedLineTradeAgreement",
      spec: {
        fields: {
          netPrice: "ram:NetPriceProductTradePrice/ram:ChargeAmount",
          discount:
            "ram:GrossPriceProductTradePrice/ram:AppliedTradeAllowanceCharge/ram:ActualAmount",
          grossPrice: "ram:GrossPriceProductTradePrice/ram:ChargeAmount",
          baseQuantity:
            "ram:NetPriceProductTradePrice/ram:BasisQuantity | ram:GrossPriceProductTradePrice/ram:BasisQuantity",
          baseQuantityUnitCode:
            "(ram:NetPriceProductTradePrice/ram:BasisQuantity | ram:GrossPriceProductTradePrice/ram:BasisQuantity)/@unitCode",
        },
      },
    },
    vat: {
      path: "ram:SpecifiedLineTradeSettlement/ram:ApplicableTradeTax",
      spec: { fields: { categoryCode: "ram:CategoryCode", rate: "ram:RateApplicablePercent" } },
    },
    item: {
      path: "ram:SpecifiedTradeProduct",
      spec: {
        fields: {
          name: "ram:Name",
          description: "ram:Description",
          sellerId: "ram:SellerAssignedID",
          buyerId: "ram:BuyerAssignedID",
          originCountry: "ram:OriginTradeCountry/ram:ID",
        },
        groups: {
          standardId: idGroup("ram:GlobalID"),
          classificationIds: {
            path: "ram:DesignatedProductClassification/ram:ClassCode",
            many: true,
            spec: { fields: { value: ".", listId: "@listID", listVersion: "@listVersionID" } },
          },
          attributes: {
            path: "ram:ApplicableProductCharacteristic",
            many: true,
            spec: { fields: { name: "ram:Description", value: "ram:Value" } },
          },
        },
      },
    },
  },
};

export const CII_MAP: GroupSpec = {
  fields: {
    number: "rsm:ExchangedDocument/ram:ID",
    issueDate: DT("rsm:ExchangedDocument/ram:IssueDateTime"),
    typeCode: "rsm:ExchangedDocument/ram:TypeCode",
    currency: `${HTS}/ram:InvoiceCurrencyCode`,
    vatAccountingCurrency: `${HTS}/ram:TaxCurrencyCode`,
    vatPointDate: {
      path: `${HTS}/ram:ApplicableTradeTax/ram:TaxPointDate/udt:DateString`,
      date: true,
    },
    vatPointDateCode: `${HTS}/ram:ApplicableTradeTax/ram:DueDateTypeCode`,
    dueDate: DT(`${HTS}/ram:SpecifiedTradePaymentTerms/ram:DueDateDateTime`),
    buyerReference: `${HTA}/ram:BuyerReference`,
    projectReference: `${HTA}/ram:SpecifiedProcuringProject/ram:ID`,
    contractReference: `${HTA}/ram:ContractReferencedDocument/ram:IssuerAssignedID`,
    purchaseOrderReference: `${HTA}/ram:BuyerOrderReferencedDocument/ram:IssuerAssignedID`,
    salesOrderReference: `${HTA}/ram:SellerOrderReferencedDocument/ram:IssuerAssignedID`,
    receivingAdviceReference: `${HTD}/ram:ReceivingAdviceReferencedDocument/ram:IssuerAssignedID`,
    despatchAdviceReference: `${HTD}/ram:DespatchAdviceReferencedDocument/ram:IssuerAssignedID`,
    tenderOrLotReference: `${HTA}/ram:AdditionalReferencedDocument[ram:TypeCode='50']/ram:IssuerAssignedID`,
    buyerAccountingReference: `${HTS}/ram:ReceivableSpecifiedTradeAccountingAccount/ram:ID`,
    paymentTerms: `${HTS}/ram:SpecifiedTradePaymentTerms/ram:Description`,
    businessProcess:
      "rsm:ExchangedDocumentContext/ram:BusinessProcessSpecifiedDocumentContextParameter/ram:ID",
    specificationIdentifier:
      "rsm:ExchangedDocumentContext/ram:GuidelineSpecifiedDocumentContextParameter/ram:ID",
  },
  groups: {
    invoicedObjectIdentifier: {
      path: `${HTA}/ram:AdditionalReferencedDocument[ram:TypeCode='130']`,
      spec: { fields: { value: "ram:IssuerAssignedID", scheme: "ram:ReferenceTypeCode" } },
    },
    notes: {
      path: "rsm:ExchangedDocument/ram:IncludedNote",
      many: true,
      spec: { fields: { subjectCode: "ram:SubjectCode", note: "ram:Content" } },
    },
    precedingInvoices: {
      path: `${HTS}/ram:InvoiceReferencedDocument`,
      many: true,
      spec: {
        fields: {
          reference: "ram:IssuerAssignedID",
          issueDate: { path: "ram:FormattedIssueDateTime/qdt:DateTimeString", date: true },
        },
      },
    },
    invoicePeriod: { path: `${HTS}/ram:BillingSpecifiedPeriod`, spec: PERIOD },
    seller: { path: `${HTA}/ram:SellerTradeParty`, spec: SELLER },
    buyer: { path: `${HTA}/ram:BuyerTradeParty`, spec: BUYER },
    payee: {
      path: `${HTS}/ram:PayeeTradeParty`,
      spec: {
        fields: { name: "ram:Name" },
        groups: {
          identifier: idGroup("ram:ID | ram:GlobalID"),
          legalRegistrationId: idGroup("ram:SpecifiedLegalOrganization/ram:ID"),
        },
      },
    },
    sellerTaxRepresentative: {
      path: `${HTA}/ram:SellerTaxRepresentativeTradeParty`,
      spec: {
        fields: { name: "ram:Name", vatId: "ram:SpecifiedTaxRegistration/ram:ID[@schemeID='VA']" },
        groups: { postalAddress: { path: "ram:PostalTradeAddress", spec: ADDRESS } },
      },
    },
    delivery: {
      path: `${HTD}[ram:ShipToTradeParty or ram:ActualDeliverySupplyChainEvent]`,
      spec: {
        fields: {
          deliverToName: "ram:ShipToTradeParty/ram:Name",
          actualDeliveryDate: DT("ram:ActualDeliverySupplyChainEvent/ram:OccurrenceDateTime"),
        },
        groups: {
          locationId: idGroup("ram:ShipToTradeParty/ram:ID | ram:ShipToTradeParty/ram:GlobalID"),
          address: { path: "ram:ShipToTradeParty/ram:PostalTradeAddress", spec: ADDRESS },
        },
      },
    },
    paymentInstructions: {
      path: `${HTS}[ram:SpecifiedTradeSettlementPaymentMeans]`,
      spec: {
        fields: {
          meansTypeCode: "ram:SpecifiedTradeSettlementPaymentMeans[1]/ram:TypeCode",
          meansText: "ram:SpecifiedTradeSettlementPaymentMeans[1]/ram:Information",
          remittanceInfo: "ram:PaymentReference",
        },
        groups: {
          creditTransfers: {
            path: "ram:SpecifiedTradeSettlementPaymentMeans[ram:PayeePartyCreditorFinancialAccount]",
            many: true,
            spec: {
              fields: {
                account:
                  "ram:PayeePartyCreditorFinancialAccount/ram:IBANID | ram:PayeePartyCreditorFinancialAccount/ram:ProprietaryID",
                accountName: "ram:PayeePartyCreditorFinancialAccount/ram:AccountName",
                bic: "ram:PayeeSpecifiedCreditorFinancialInstitution/ram:BICID",
              },
            },
          },
          card: {
            path: "ram:SpecifiedTradeSettlementPaymentMeans/ram:ApplicableTradeSettlementFinancialCard",
            spec: { fields: { pan: "ram:ID", holderName: "ram:CardholderName" } },
          },
          directDebit: {
            path: "self::*[ram:SpecifiedTradePaymentTerms/ram:DirectDebitMandateID or ram:CreditorReferenceID or ram:SpecifiedTradeSettlementPaymentMeans/ram:PayerPartyDebtorFinancialAccount]",
            spec: {
              fields: {
                mandateReference: "ram:SpecifiedTradePaymentTerms/ram:DirectDebitMandateID",
                creditorId: "ram:CreditorReferenceID",
                debitedAccount:
                  "ram:SpecifiedTradeSettlementPaymentMeans/ram:PayerPartyDebtorFinancialAccount/ram:IBANID",
              },
            },
          },
        },
      },
    },
    allowances: {
      path: `${HTS}/ram:SpecifiedTradeAllowanceCharge${AC_FALSE}`,
      many: true,
      spec: ALLOWANCE_CHARGE_DOC,
    },
    charges: {
      path: `${HTS}/ram:SpecifiedTradeAllowanceCharge${AC_TRUE}`,
      many: true,
      spec: ALLOWANCE_CHARGE_DOC,
    },
    totals: {
      path: `${HTS}/ram:SpecifiedTradeSettlementHeaderMonetarySummation`,
      spec: {
        fields: {
          lineExtension: "ram:LineTotalAmount",
          allowanceTotal: "ram:AllowanceTotalAmount",
          chargeTotal: "ram:ChargeTotalAmount",
          taxExclusive: "ram:TaxBasisTotalAmount",
          taxAmount:
            "ram:TaxTotalAmount[@currencyID=../../ram:InvoiceCurrencyCode] | ram:TaxTotalAmount[not(@currencyID)]",
          taxAmountAccountingCurrency: "ram:TaxTotalAmount[@currencyID=../../ram:TaxCurrencyCode]",
          taxInclusive: "ram:GrandTotalAmount",
          paid: "ram:TotalPrepaidAmount",
          rounding: "ram:RoundingAmount",
          payable: "ram:DuePayableAmount",
        },
      },
    },
    vatBreakdown: {
      path: `${HTS}/ram:ApplicableTradeTax`,
      many: true,
      spec: {
        fields: {
          taxableAmount: "ram:BasisAmount",
          taxAmount: "ram:CalculatedAmount",
          categoryCode: "ram:CategoryCode",
          rate: "ram:RateApplicablePercent",
          exemptionReason: "ram:ExemptionReason",
          exemptionReasonCode: "ram:ExemptionReasonCode",
        },
      },
    },
    additionalDocuments: {
      path: `${HTA}/ram:AdditionalReferencedDocument[ram:TypeCode='916']`,
      many: true,
      spec: {
        fields: {
          reference: "ram:IssuerAssignedID",
          description: "ram:Name",
          externalUri: "ram:URIID",
        },
        groups: {
          attachment: {
            path: "ram:AttachmentBinaryObject",
            spec: { fields: { content: ".", mimeCode: "@mimeCode", filename: "@filename" } },
          },
        },
      },
    },
    lines: {
      path: "rsm:SupplyChainTradeTransaction/ram:IncludedSupplyChainTradeLineItem",
      many: true,
      spec: LINE,
    },
  },
};
