/**
 * Visual page(s) of a generated ZUGFeRD PDF — the same blocks, order and DE/EN labels as
 * `renderHtmlPreview` (the visual source of truth, D-037), drawn with the PageFlow layout engine.
 */

import type { PDFDocument } from "pdf-lib";
import type { InvoiceModel } from "../model/schema.js";
import { formatAmount, type Lang, T } from "../preview/html.js";
import { type Block, type Column, type Fonts, PageFlow, type Row } from "./layout.js";

export interface RenderOptions {
  lang: Lang;
  /** Shown in the sub-line, e.g. "ZUGFeRD 2.3 / Factur-X EN 16931". */
  formatLabel: string;
}

const CREDIT_NOTE_TYPES = ["381", "396", "261", "262", "308"];

export function invoiceTitle(m: InvoiceModel, lang: Lang): string {
  const t = T[lang];
  return `${CREDIT_NOTE_TYPES.includes(m.typeCode) ? t.creditNote : t.invoice} ${m.number}`;
}

export function renderInvoicePages(
  doc: PDFDocument,
  fonts: Fonts,
  m: InvoiceModel,
  o: RenderOptions,
): number {
  const L = o.lang;
  const t = T[L];
  const amt = (v: string | undefined) => formatAmount(v, L);
  const qty = (v: string) => formatAmount(v, L, -1);
  const flow = new PageFlow(
    doc,
    fonts,
    (p, n) => `${t.pdfFooter}  —  ${L === "de" ? "Seite" : "Page"} ${p}/${n}`,
  );

  const addr = (a: InvoiceModel["seller"]["postalAddress"]) =>
    a
      ? [
          a.line1,
          a.line2,
          a.line3,
          [a.postCode, a.city].filter(Boolean).join(" "),
          a.countrySubdivision,
          a.countryCode,
        ]
          .filter(Boolean)
          .map(String)
      : [];
  const party = (
    label: string,
    p: InvoiceModel["seller"] | InvoiceModel["buyer"],
    extra: Array<[string, string | undefined]>,
  ): Block[] => [
    { kind: "label", s: label },
    { kind: "text", s: p.name, st: { bold: true } },
    ...(p.tradingName && p.tradingName !== p.name
      ? [{ kind: "text" as const, s: p.tradingName, st: { muted: true } }]
      : []),
    ...addr(p.postalAddress).map((s) => ({ kind: "text" as const, s })),
    { kind: "gap", h: 3 },
    {
      kind: "kv",
      pairs: [
        [t.vatId, p.vatId],
        ...extra,
        [
          t.contact,
          p.contact
            ? [p.contact.name, p.contact.phone, p.contact.email].filter(Boolean).join(" · ")
            : undefined,
        ],
        ["E-Mail/ID", p.electronicAddress?.value],
      ],
    },
  ];

  // 1. title + sub-line
  flow.text(invoiceTitle(m, L), { size: 18, bold: true });
  flow.gap(2);
  flow.text(
    [
      `${t.issueDate}: ${m.issueDate}`,
      m.dueDate ? `${t.dueDate}: ${m.dueDate}` : "",
      `${t.format}: ${o.formatLabel}`,
    ]
      .filter(Boolean)
      .join("  ·  "),
    { size: 9.5, muted: true },
  );
  flow.gap(10);

  // 2. seller / buyer
  flow.columns(
    party(t.seller, m.seller, [
      [t.taxNo, m.seller.taxRegistrationId],
      ["Reg.", m.seller.legalRegistrationId?.value],
    ]),
    party(t.buyer, m.buyer, [["ID", m.buyer.identifier?.value]]),
  );
  flow.gap(10);

  // 3. references
  flow.keyValues([
    [t.buyerRef, m.buyerReference],
    [t.order, m.purchaseOrderReference],
    [t.contract, m.contractReference],
    [
      t.period,
      m.invoicePeriod ? `${m.invoicePeriod.start ?? ""} – ${m.invoicePeriod.end ?? ""}` : undefined,
    ],
  ]);
  flow.gap(8);

  // 4. lines
  const bw = flow.bodyWidth;
  const lineCols: Column[] = [
    { title: t.pos, width: 30 },
    { title: t.item, width: bw - 30 - 58 - 44 - 78 - 62 - 80 },
    { title: t.qty, width: 58, align: "right" },
    { title: t.unit, width: 44 },
    { title: t.price, width: 78, align: "right" },
    { title: t.vat, width: 62, align: "right" },
    { title: `${t.net} ${m.currency}`, width: 80, align: "right" },
  ];
  const lineRows: Row[] = m.lines.map((l) => [
    l.id,
    [
      { text: l.item.name },
      ...(l.item.description ? [{ text: l.item.description, muted: true }] : []),
      ...(l.note ? [{ text: l.note, muted: true }] : []),
      ...(l.period
        ? [{ text: `${t.period}: ${l.period.start ?? ""} – ${l.period.end ?? ""}`, muted: true }]
        : []),
    ],
    qty(l.quantity),
    l.quantityUnitCode,
    `${amt(l.price.netPrice)}${l.price.baseQuantity ? ` / ${qty(l.price.baseQuantity)}` : ""}`,
    `${l.vat.categoryCode} ${l.vat.rate ? `${formatAmount(l.vat.rate, L, -1)} %` : ""}`.trim(),
    amt(l.netAmount),
  ]);
  flow.table(lineCols, lineRows);
  flow.gap(10);

  // 5. totals (right-aligned box)
  const tot = m.totals;
  const totRows: Row[] = (
    [
      [t.lineTotal, tot.lineExtension],
      [t.allowances, tot.allowanceTotal],
      [t.charges, tot.chargeTotal],
      [t.taxExcl, tot.taxExclusive],
      [t.taxAmount, tot.taxAmount],
      [t.taxIncl, tot.taxInclusive],
      [t.paid, tot.paid],
      [t.rounding, tot.rounding],
      [t.payable, tot.payable],
    ] as Array<[string, string | undefined]>
  )
    .filter((r): r is [string, string] => r[1] !== undefined)
    .map(([k, v]) => [k, `${amt(v)} ${m.currency}`]);
  flow.table(
    [
      { title: "", width: 200 },
      { title: "", width: 120, align: "right" },
    ],
    totRows,
    { header: false, grandLast: true },
  );
  flow.gap(12);

  // 6. VAT breakdown (BG-23)
  flow.sectionLabel(`${t.breakdown} (BG-23)`);
  flow.table(
    [
      { title: t.category, width: 70 },
      { title: t.rate, width: 70, align: "right" },
      { title: t.taxable, width: 140, align: "right" },
      { title: t.tax, width: 100, align: "right" },
      { title: t.reason, width: bw - 380 },
    ],
    m.vatBreakdown.map((b) => [
      b.categoryCode,
      b.rate ? `${formatAmount(b.rate, L, -1)} %` : "–",
      amt(b.taxableAmount),
      amt(b.taxAmount),
      [b.exemptionReasonCode, b.exemptionReason].filter(Boolean).join(" – "),
    ]),
  );
  flow.gap(10);

  // 7. payment / delivery
  const p = m.paymentInstructions;
  const payPairs: Array<[string, string | undefined]> = p
    ? [
        [t.means, [p.meansTypeCode, p.meansText].filter(Boolean).join(" – ")],
        ...(p.creditTransfers ?? []).flatMap(
          (c): Array<[string, string | undefined]> => [
            [t.iban, c.account],
            [t.bic, c.bic],
            [t.holder, c.accountName],
          ],
        ),
        [t.remittance, p.remittanceInfo],
        [t.terms, m.paymentTerms],
        [t.dueDate, m.dueDate],
      ]
    : [
        [t.terms, m.paymentTerms],
        [t.dueDate, m.dueDate],
      ];
  const payment: Block[] = payPairs.some(([, v]) => v)
    ? [
        { kind: "label", s: t.payment },
        { kind: "kv", pairs: payPairs },
      ]
    : [];
  const del = m.delivery;
  const delivery: Block[] = del
    ? [
        { kind: "label", s: t.delivery },
        ...(del.deliverToName ? [{ kind: "text" as const, s: del.deliverToName }] : []),
        ...addr(del.address).map((s) => ({ kind: "text" as const, s })),
        { kind: "kv", pairs: [[t.deliveryDate, del.actualDeliveryDate]] },
      ]
    : [];
  if (payment.length || delivery.length) flow.columns(payment, delivery);

  // 8. notes
  if (m.notes?.length) {
    flow.sectionLabel(t.notes);
    for (const n of m.notes)
      flow.text(`${n.subjectCode ? `[${n.subjectCode}] ` : ""}${n.note}`, { size: 9.5 });
  }

  flow.finish();
  return flow.pageCount;
}
