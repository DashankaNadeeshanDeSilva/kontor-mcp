/**
 * EN 16931 semantic model (PRD §5.3). Zod is the single source of truth; `InvoiceModel` is inferred.
 * All amounts, quantities, percentages are kept as *strings* — consumers use decimal.js, never float.
 * BT/BG annotations live in ./bt-map.ts and are applied by `toAnnotatedJson()`.
 */
import { z } from "zod";

const s = z.string();
const os = s.optional();

export const IdentifierSchema = z.object({ value: s, scheme: os });
const oid = IdentifierSchema.optional();

export const PostalAddressSchema = z.object({
  line1: os,
  line2: os,
  line3: os,
  city: os,
  postCode: os,
  countrySubdivision: os,
  countryCode: os,
});

export const ContactSchema = z.object({ name: os, phone: os, email: os });

export const SellerSchema = z.object({
  name: s,
  tradingName: os,
  identifiers: z.array(IdentifierSchema).optional(),
  legalRegistrationId: oid,
  vatId: os,
  taxRegistrationId: os,
  additionalLegalInfo: os,
  electronicAddress: oid,
  postalAddress: PostalAddressSchema.optional(),
  contact: ContactSchema.optional(),
});

export const BuyerSchema = z.object({
  name: s,
  tradingName: os,
  identifier: oid,
  legalRegistrationId: oid,
  vatId: os,
  electronicAddress: oid,
  postalAddress: PostalAddressSchema.optional(),
  contact: ContactSchema.optional(),
});

export const PayeeSchema = z.object({ name: s, identifier: oid, legalRegistrationId: oid });

export const TaxRepresentativeSchema = z.object({
  name: s,
  vatId: os,
  postalAddress: PostalAddressSchema.optional(),
});

export const DeliverySchema = z.object({
  deliverToName: os,
  locationId: oid,
  actualDeliveryDate: os,
  address: PostalAddressSchema.optional(),
});

export const CreditTransferSchema = z.object({ account: s, accountName: os, bic: os });

export const PaymentInstructionsSchema = z.object({
  meansTypeCode: s,
  meansText: os,
  remittanceInfo: os,
  creditTransfers: z.array(CreditTransferSchema).optional(),
  card: z.object({ pan: s, holderName: os }).optional(),
  directDebit: z.object({ mandateReference: os, creditorId: os, debitedAccount: os }).optional(),
});

export const DocumentAllowanceChargeSchema = z.object({
  amount: s,
  baseAmount: os,
  percentage: os,
  vatCategoryCode: s,
  vatRate: os,
  reason: os,
  reasonCode: os,
});

export const LineAllowanceChargeSchema = z.object({
  amount: s,
  baseAmount: os,
  percentage: os,
  reason: os,
  reasonCode: os,
});

export const TotalsSchema = z.object({
  lineExtension: s,
  allowanceTotal: os,
  chargeTotal: os,
  taxExclusive: s,
  taxAmount: os,
  taxAmountAccountingCurrency: os,
  taxInclusive: s,
  paid: os,
  rounding: os,
  payable: s,
});

export const VatBreakdownSchema = z.object({
  taxableAmount: s,
  taxAmount: s,
  categoryCode: s,
  rate: os,
  exemptionReason: os,
  exemptionReasonCode: os,
});

export const AdditionalDocumentSchema = z.object({
  reference: s,
  description: os,
  externalUri: os,
  attachment: z.object({ content: s, mimeCode: os, filename: os }).optional(),
});

export const PeriodSchema = z.object({ start: os, end: os });

export const ClassificationIdSchema = z.object({ value: s, listId: os, listVersion: os });

export const ItemSchema = z.object({
  name: s,
  description: os,
  sellerId: os,
  buyerId: os,
  standardId: oid,
  classificationIds: z.array(ClassificationIdSchema).optional(),
  originCountry: os,
  attributes: z.array(z.object({ name: s, value: s })).optional(),
});

export const PriceSchema = z.object({
  netPrice: s,
  discount: os,
  grossPrice: os,
  baseQuantity: os,
  baseQuantityUnitCode: os,
});

export const LineSchema = z.object({
  id: s,
  note: os,
  objectIdentifier: oid,
  quantity: s,
  quantityUnitCode: s,
  netAmount: s,
  orderLineReference: os,
  accountingReference: os,
  period: PeriodSchema.optional(),
  allowances: z.array(LineAllowanceChargeSchema).optional(),
  charges: z.array(LineAllowanceChargeSchema).optional(),
  price: PriceSchema,
  vat: z.object({ categoryCode: s, rate: os }),
  item: ItemSchema,
});

export const InvoiceModelSchema = z.object({
  number: s,
  issueDate: s,
  typeCode: s,
  currency: s,
  vatAccountingCurrency: os,
  vatPointDate: os,
  vatPointDateCode: os,
  dueDate: os,
  buyerReference: os,
  projectReference: os,
  contractReference: os,
  purchaseOrderReference: os,
  salesOrderReference: os,
  receivingAdviceReference: os,
  despatchAdviceReference: os,
  tenderOrLotReference: os,
  invoicedObjectIdentifier: oid,
  buyerAccountingReference: os,
  paymentTerms: os,
  businessProcess: os,
  specificationIdentifier: s,
  notes: z.array(z.object({ subjectCode: os, note: s })).optional(),
  precedingInvoices: z.array(z.object({ reference: s, issueDate: os })).optional(),
  invoicePeriod: PeriodSchema.optional(),
  seller: SellerSchema,
  buyer: BuyerSchema,
  payee: PayeeSchema.optional(),
  sellerTaxRepresentative: TaxRepresentativeSchema.optional(),
  delivery: DeliverySchema.optional(),
  paymentInstructions: PaymentInstructionsSchema.optional(),
  allowances: z.array(DocumentAllowanceChargeSchema).optional(),
  charges: z.array(DocumentAllowanceChargeSchema).optional(),
  totals: TotalsSchema,
  vatBreakdown: z.array(VatBreakdownSchema),
  additionalDocuments: z.array(AdditionalDocumentSchema).optional(),
  lines: z.array(LineSchema),
});

export type InvoiceModel = z.infer<typeof InvoiceModelSchema>;
export type InvoiceLine = z.infer<typeof LineSchema>;
export type Identifier = z.infer<typeof IdentifierSchema>;
export type PostalAddress = z.infer<typeof PostalAddressSchema>;
