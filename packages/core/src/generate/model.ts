import type { InvoiceModel } from "../model/schema.js";
import type { Derived } from "./derive.js";
import type { InvoiceInputParsed } from "./input.js";

export const XRECHNUNG_CUSTOMIZATION_ID =
  "urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0";
export const PEPPOL_BILLING_PROFILE_ID = "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0";

/** Build the semantic model from the LLM-shaped input plus the derived amounts. */
export function inputToModel(input: InvoiceInputParsed, d: Derived): InvoiceModel {
  const s = input.seller;
  const b = input.buyer;
  const addr = (a: typeof s.address) => ({
    line1: a.street,
    ...(a.street2 ? { line2: a.street2 } : {}),
    city: a.city,
    postCode: a.postCode,
    countryCode: a.countryCode,
  });
  const model: InvoiceModel = {
    number: input.number,
    issueDate: input.issueDate,
    typeCode: input.typeCode,
    currency: input.currency,
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    buyerReference: input.buyerReference,
    ...(input.orderReference ? { purchaseOrderReference: input.orderReference } : {}),
    ...(input.payment?.terms ? { paymentTerms: input.payment.terms } : {}),
    businessProcess: PEPPOL_BILLING_PROFILE_ID,
    specificationIdentifier: XRECHNUNG_CUSTOMIZATION_ID,
    ...(input.notes?.length ? { notes: input.notes.map((note) => ({ note })) } : {}),
    seller: {
      name: s.name,
      ...(s.tradingName ? { tradingName: s.tradingName } : {}),
      ...(s.legalRegistrationId ? { legalRegistrationId: { value: s.legalRegistrationId } } : {}),
      ...(s.vatId ? { vatId: s.vatId } : {}),
      ...(s.taxNumber ? { taxRegistrationId: s.taxNumber } : {}),
      electronicAddress: { value: s.email, scheme: "EM" },
      postalAddress: addr(s.address),
      contact: { name: s.contactName, phone: s.phone, email: s.email },
    },
    buyer: {
      name: b.name,
      ...(b.identifier ? { identifier: { value: b.identifier } } : {}),
      ...(b.vatId ? { vatId: b.vatId } : {}),
      electronicAddress: { value: b.email, scheme: "EM" },
      postalAddress: addr(b.address),
      ...(b.contactName || b.contactEmail
        ? {
            contact: {
              ...(b.contactName ? { name: b.contactName } : {}),
              ...(b.contactEmail ? { email: b.contactEmail } : {}),
            },
          }
        : {}),
    },
    totals: { ...d.totals },
    vatBreakdown: d.breakdown.map((bd) => ({
      taxableAmount: bd.taxableAmount,
      taxAmount: bd.taxAmount,
      categoryCode: bd.categoryCode,
      rate: bd.rate,
      ...(bd.categoryCode !== "S" && bd.categoryCode !== "Z" && input.vatExemption
        ? {
            exemptionReason: input.vatExemption.reason,
            ...(input.vatExemption.code ? { exemptionReasonCode: input.vatExemption.code } : {}),
          }
        : {}),
    })),
    lines: d.lines.map((dl) => {
      const l = input.lines[dl.index];
      if (!l) throw new Error("derived line without input line");
      return {
        id: String(dl.index + 1),
        ...(l.note ? { note: l.note } : {}),
        quantity: dl.quantity,
        quantityUnitCode: l.unit,
        netAmount: dl.netAmount,
        price: { netPrice: dl.netPrice },
        vat: { categoryCode: dl.vatCategory, rate: dl.vatRate },
        item: { name: l.description },
      };
    }),
  };
  if (input.payment) {
    const p = input.payment;
    model.paymentInstructions = {
      meansTypeCode: p.meansCode,
      ...(p.remittanceInfo ? { remittanceInfo: p.remittanceInfo } : {}),
      creditTransfers: [
        {
          account: p.iban,
          ...(p.accountName ? { accountName: p.accountName } : {}),
          ...(p.bic ? { bic: p.bic } : {}),
        },
      ],
    };
  }
  return model;
}
