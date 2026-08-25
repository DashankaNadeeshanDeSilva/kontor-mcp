import { z } from "zod";

/** Amounts/quantities: numbers or numeric strings; both become decimal.js values (never float math). */
const numeric = z.union([
  z.number().finite(),
  z.string().regex(/^-?\d+(\.\d+)?$/, 'numeric string expected, e.g. "33.33"'),
]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const nonEmpty = z.string().trim().min(1);

export const AddressInputSchema = z.object({
  street: nonEmpty.describe("Street and number (BT-35/50)"),
  street2: z.string().optional(),
  city: nonEmpty,
  postCode: nonEmpty,
  countryCode: z.string().length(2).toUpperCase().default("DE").describe("ISO 3166-1 alpha-2"),
});

export const SellerInputSchema = z.object({
  name: nonEmpty.describe("Legal name (BT-27)"),
  tradingName: z.string().optional(),
  vatId: z.string().optional().describe("USt-IdNr., e.g. DE123456789 (BT-31)"),
  taxNumber: z.string().optional().describe("Steuernummer (BT-32); use when there is no VAT ID"),
  legalRegistrationId: z.string().optional().describe("e.g. HRB 12345 (BT-30)"),
  address: AddressInputSchema,
  contactName: nonEmpty.describe("Contact person (BT-41) — mandatory for XRechnung"),
  phone: nonEmpty.describe("Contact phone (BT-42) — mandatory for XRechnung"),
  email: nonEmpty.describe("Contact e-mail (BT-43) and electronic address (BT-34)"),
});

export const BuyerInputSchema = z.object({
  name: nonEmpty.describe("Legal name (BT-44)"),
  identifier: z.string().optional().describe("Buyer identifier (BT-46)"),
  vatId: z.string().optional().describe("Buyer VAT ID (BT-48); required for reverse charge (AE)"),
  email: nonEmpty.describe("Electronic address for delivery (BT-49)"),
  address: AddressInputSchema,
  contactName: z.string().optional(),
  contactEmail: z.string().optional(),
});

export const PaymentInputSchema = z.object({
  meansCode: z
    .enum(["58", "30", "31", "42", "48", "49", "57", "59", "97"])
    .default("58")
    .describe("UNTDID 4461; 58 = SEPA credit transfer"),
  iban: nonEmpty.describe("Payee IBAN (BT-84)"),
  bic: z.string().optional().describe("BIC (BT-86), optional for SEPA"),
  accountName: z.string().optional().describe("Account holder (BT-85)"),
  remittanceInfo: z.string().optional().describe("Payment reference / Verwendungszweck (BT-83)"),
  terms: z.string().optional().describe("Payment terms text (BT-20)"),
});

export const VAT_CATEGORIES = ["S", "Z", "E", "AE", "K", "G"] as const;
export const LineInputSchema = z.object({
  description: nonEmpty.describe("Item name (BT-153)"),
  note: z.string().optional(),
  quantity: numeric.describe("Invoiced quantity (BT-129)"),
  unit: z
    .string()
    .default("C62")
    .describe("UN/ECE Rec 20 unit code (BT-130): C62 piece, HUR hour, DAY, KGM, MTR, LTR …"),
  netPrice: numeric.describe("Net unit price (BT-146)"),
  vatCategory: z
    .enum(VAT_CATEGORIES)
    .default("S")
    .describe("S standard, Z zero-rated, E exempt, AE reverse charge, K intra-community, G export"),
  vatRate: numeric.optional().describe("Percent (BT-152); default 19 for S, 0 otherwise"),
});

export const InvoiceInputSchema = z
  .object({
    number: nonEmpty.describe("Invoice number (BT-1)"),
    issueDate: isoDate.describe("BT-2"),
    dueDate: isoDate.optional().describe("BT-9"),
    typeCode: z
      .enum(["380", "381", "384", "389", "875", "876", "877"])
      .default("380")
      .describe("UNTDID 1001: 380 invoice, 381 credit note, 384 corrected invoice"),
    currency: z.string().length(3).toUpperCase().default("EUR"),
    buyerReference: nonEmpty.describe("BT-10 — for German public buyers the Leitweg-ID"),
    orderReference: z.string().optional().describe("Purchase order number (BT-13)"),
    notes: z.array(nonEmpty).optional().describe("Free-text notes (BT-22)"),
    seller: SellerInputSchema,
    buyer: BuyerInputSchema,
    payment: PaymentInputSchema.optional().describe("Mandatory for XRechnung (BR-DE-1)"),
    vatExemption: z
      .object({
        reason: nonEmpty.describe("BT-120 text"),
        code: z.string().optional().describe("VATEX code (BT-121), e.g. VATEX-EU-AE"),
      })
      .optional()
      .describe("Required when any line uses category E, AE, K or G"),
    lines: z.array(LineInputSchema).min(1),
  })
  .superRefine((v, ctx) => {
    if (!v.dueDate && !v.payment?.terms) {
      ctx.addIssue({
        code: "custom",
        path: ["dueDate"],
        message:
          "Provide dueDate or payment.terms — one of them is mandatory when an amount is due (BR-CO-25)",
      });
    }
    if ((v.seller.phone.match(/\d/g) ?? []).length < 3) {
      ctx.addIssue({
        code: "custom",
        path: ["seller", "phone"],
        message: "seller.phone must contain at least three digits (BR-DE-27)",
      });
    }
    if (!v.vatExemption && v.lines.some((l) => ["E", "AE", "K", "G"].includes(l.vatCategory))) {
      ctx.addIssue({
        code: "custom",
        path: ["vatExemption"],
        message:
          "vatExemption { reason, code? } is required when a line uses VAT category E, AE, K or G (BR-E-10 / BR-AE-10 / BR-IC-10 / BR-G-10)",
      });
    }
  });

export type InvoiceInput = z.input<typeof InvoiceInputSchema>;
export type InvoiceInputParsed = z.output<typeof InvoiceInputSchema>;
