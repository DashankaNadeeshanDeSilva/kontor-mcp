import type { InvoiceInput } from "../../src/index.js";

/** A complete, XRechnung-valid B2G input — the reference case. */
export const REFERENCE: InvoiceInput = {
  number: "RE-2026-0815",
  issueDate: "2026-08-25",
  dueDate: "2026-09-24",
  buyerReference: "04011000-12345-03",
  seller: {
    name: "Muster Consulting GmbH",
    vatId: "DE123456789",
    address: { street: "Musterstraße 1", city: "Berlin", postCode: "10115", countryCode: "DE" },
    contactName: "Erika Muster",
    phone: "+49 30 1234567",
    email: "rechnung@muster-consulting.example",
  },
  buyer: {
    name: "Bundesamt für Beispiele",
    email: "rechnungseingang@bfb.example",
    address: { street: "Amtsweg 2", city: "Bonn", postCode: "53113", countryCode: "DE" },
  },
  payment: {
    iban: "DE75512108001245126199",
    bic: "SOGEDEFFXXX",
    accountName: "Muster Consulting GmbH",
    terms: "Zahlbar innerhalb von 30 Tagen ohne Abzug.",
  },
  lines: [
    { description: "Beratung August 2026", quantity: 10, unit: "HUR", netPrice: 120, vatRate: 19 },
    { description: "Fachbuch", quantity: 3, unit: "C62", netPrice: 33.33, vatRate: 7 },
  ],
};
