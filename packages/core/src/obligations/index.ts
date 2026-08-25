/** T7 check_obligations: offline decision tree over the German e-invoicing mandate timeline. */
import { type LegalSource, loadLegalTimeline } from "@kontor-mcp/rules";
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const ObligationsInputSchema = z.object({
  role: z
    .enum(["issuer", "receiver"])
    .describe("Are you sending (issuer) or receiving the invoice?"),
  counterparty: z
    .enum(["b2b", "b2g", "b2c"])
    .describe(
      "b2b: both parties are businesses · b2g: a German public-sector buyer is involved · b2c: a consumer is involved",
    ),
  date: isoDate.optional().describe("Date of supply / reference date (default: today)"),
  annual_revenue_eur: z
    .number()
    .nonnegative()
    .optional()
    .describe("Issuer's total turnover (§ 19 Abs. 2 UStG) of the PRIOR calendar year in EUR"),
  small_business_19_ustg: z
    .boolean()
    .optional()
    .describe("Issuer applies the small-business scheme (§ 19 UStG Kleinunternehmer)"),
  cross_border: z.boolean().optional().describe("The other party is not established in Germany"),
  invoice_gross_eur: z
    .number()
    .nonnegative()
    .optional()
    .describe("Gross invoice total in EUR (Kleinbetragsrechnung ≤ 250 €)"),
  exempt_supply_4_8_29: z
    .boolean()
    .optional()
    .describe(
      "The supply is VAT-exempt under § 4 Nr. 8–29 UStG (e.g. financial services, most property letting)",
    ),
  direct_order_net_eur: z
    .number()
    .nonnegative()
    .optional()
    .describe("B2G only: net value of a federal direct order (Direktauftrag)"),
});
export type ObligationsInput = z.input<typeof ObligationsInputSchema>;

export type ObligationStatus =
  | "required"
  | "transitional"
  | "conditional"
  | "exempt"
  | "not-required"
  | "out-of-scope";

export interface Obligation {
  id: string;
  status: ObligationStatus;
  title: { de: string; en: string };
  rationale: { de: string; en: string };
  from?: string;
  until?: string;
  formats?: string[];
  leitwegIdRequired?: boolean;
  sources: LegalSource[];
}

export interface ObligationsReport {
  input: z.output<typeof ObligationsInputSchema>;
  asOf: string;
  obligations: Obligation[];
  summary: { de: string; en: string };
  lastVerified: string;
  verifiedBy: string;
  disclaimer: { de: string; en: string };
}

export const OBLIGATIONS_DISCLAIMER = {
  de: "Hinweis: Diese Auskunft ist eine formale Einordnung anhand der hinterlegten Gesetzestexte (Stand siehe lastVerified) – keine steuerliche oder rechtliche Beratung. Im Zweifel Steuerberatung einholen.",
  en: "Note: this is a formal classification based on the embedded legal texts (see lastVerified) – not tax or legal advice. Consult a tax adviser when in doubt.",
} as const;

const fmtEur = {
  de: (n: number) => `${n.toLocaleString("de-DE")} €`,
  en: (n: number) => `€${n.toLocaleString("en-US")}`,
};
const validDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  return t.getUTCFullYear() === y && t.getUTCMonth() === (m ?? 1) - 1 && t.getUTCDate() === d;
};

export function checkObligations(raw: ObligationsInput): ObligationsReport {
  const input = ObligationsInputSchema.parse(raw);
  const asOf = input.date ?? new Date().toISOString().slice(0, 10);
  if (!validDate(asOf)) throw new Error(`Invalid date: ${asOf}`);
  const tl = loadLegalTimeline();
  const fact = <T = string>(id: string): T => {
    const f = tl.facts[id];
    if (!f) throw new Error(`legal fact missing: ${id}`);
    return f.value as T;
  };
  const src = (...ids: string[]): LegalSource[] => {
    const out = new Map<string, LegalSource>();
    for (const id of ids) {
      const f = tl.facts[id];
      for (const sid of f ? f.sources : [id]) {
        const s = tl.sources[sid];
        if (s) out.set(sid, s);
      }
    }
    return [...out.values()];
  };
  const formats = fact<string[]>("accepted-formats");
  const obligations: Obligation[] = [];

  // ---- B2C -------------------------------------------------------------------------------
  if (input.counterparty === "b2c") {
    obligations.push({
      id: input.role === "issuer" ? "b2c-issue" : "b2c-receive",
      status: "not-required",
      title: { de: "E-Rechnung gegenüber Verbrauchern", en: "E-invoicing towards consumers" },
      rationale: {
        de: "Die E-Rechnungspflicht des § 14 Abs. 2 UStG gilt nur für Umsätze zwischen inländischen Unternehmern (B2B). Rechnungen an Endverbraucher sind nicht betroffen; eine E-Rechnung ist freiwillig möglich (mit Zustimmung des Empfängers).",
        en: "The e-invoicing mandate of § 14 (2) UStG covers only supplies between domestic businesses (B2B). Invoices to consumers are not affected; an e-invoice remains optional (with the recipient's consent).",
      },
      sources: src("b2c-not-mandated"),
    });
  }

  // ---- B2G -------------------------------------------------------------------------------
  if (input.counterparty === "b2g") {
    if (input.role === "receiver") {
      obligations.push({
        id: "b2g-receive",
        status: "out-of-scope",
        title: {
          de: "Pflichten öffentlicher Auftraggeber als Rechnungsempfänger",
          en: "Obligations of public-sector invoice recipients",
        },
        rationale: {
          de: "Die Pflichten öffentlicher Stellen zur Annahme und Verarbeitung von E-Rechnungen ergeben sich aus der E-RechV des Bundes bzw. den E-Rechnungs-Verordnungen der Länder (Umsetzung der Richtlinie 2014/55/EU). Kontor deckt die Lieferantenseite ab; für die Empfängerpflichten Ihrer Stelle bitte die jeweilige Verordnung des Bundes/Landes prüfen.",
          en: "Obligations of public bodies to accept and process e-invoices stem from the federal E-RechV or the respective Land regulations (implementing Directive 2014/55/EU). Kontor covers the supplier side; check the federal/Land regulation for your body's receiving duties.",
        },
        sources: src("erechv-3", "erechnung-bund"),
      });
    } else {
      const from = fact("b2g-federal-from");
      const threshold = fact<number>("b2g-direct-order-threshold-net-eur");
      const directOrderExempt =
        input.direct_order_net_eur !== undefined && input.direct_order_net_eur <= threshold;
      const before = asOf < from;
      obligations.push({
        id: "b2g-issue-xrechnung",
        status: directOrderExempt ? "exempt" : before ? "not-required" : "required",
        title: {
          de: "XRechnung an öffentliche Auftraggeber",
          en: "XRechnung to public-sector buyers",
        },
        rationale: directOrderExempt
          ? {
              de: `Direktaufträge bis zu einem Auftragswert von ${fmtEur.de(threshold)} (netto) sind nach § 3 Abs. 3 E-RechV von der Pflicht zur elektronischen Rechnung an den Bund ausgenommen. Eine XRechnung ist weiterhin zulässig und wird von den Portalen angenommen. Landesrecht kann abweichen.`,
              en: `Federal direct orders up to ${fmtEur.en(threshold)} (net) are exempt from the e-invoicing obligation under § 3 (3) E-RechV. An XRechnung remains permitted and accepted by the portals. Land rules may differ.`,
            }
          : before
            ? {
                de: `Die Pflicht zur elektronischen Rechnung an Bundesstellen gilt für Rechnungssteller erst ab dem ${from} (§ 3 E-RechV).`,
                en: `The obligation to send e-invoices to federal bodies applies to suppliers only from ${from} (§ 3 E-RechV).`,
              }
            : {
                de: `Seit dem ${from} müssen Lieferanten des Bundes Rechnungen elektronisch im Standard XRechnung (jeweils gültige Version; ZUGFeRD-Profil XRECHNUNG ist gleichwertig) über die Rechnungseingangsplattformen (ZRE/OZG-RE) einreichen. Die Leitweg-ID des Auftraggebers ist zwingend in BT-10 (Buyer Reference) anzugeben. Ausnahmen: Direktaufträge bis ${fmtEur.de(threshold)} netto, §§ 8/9 E-RechV, § 159 Abs. 1 Nr. 5 GWB. Für Länder und Kommunen gelten eigene Verordnungen – bitte die Vorgaben des jeweiligen Auftraggebers prüfen.`,
                en: `Since ${from}, suppliers to the federal administration must submit invoices electronically in the XRechnung standard (current version; the ZUGFeRD XRECHNUNG profile is equivalent) via the invoice portals (ZRE/OZG-RE). The buyer's Leitweg-ID is mandatory in BT-10 (Buyer Reference). Exceptions: direct orders up to ${fmtEur.en(threshold)} net, §§ 8/9 E-RechV, § 159 (1) no. 5 GWB. Länder and municipalities have their own regulations – check the buyer's requirements.`,
              },
        from,
        formats: ["XRechnung"],
        leitwegIdRequired: !directOrderExempt && !before,
        sources: src(
          "b2g-federal-from",
          "b2g-direct-order-threshold-net-eur",
          "b2g-leitweg-id-bt10",
        ),
      });
    }
  }

  // ---- B2B -------------------------------------------------------------------------------
  if (input.counterparty === "b2b") {
    const receiveFrom = fact("b2b-receive-from");
    const receive: Obligation = {
      id: "b2b-receive",
      status: asOf >= receiveFrom ? "required" : "not-required",
      title: { de: "Empfang von E-Rechnungen", en: "Receiving e-invoices" },
      rationale: {
        de: `Seit dem ${receiveFrom} muss jeder inländische Unternehmer E-Rechnungen (strukturiertes Format nach EN 16931) empfangen und verarbeiten können – auch Kleinunternehmer und umsatzsteuerliche Unternehmer wie Vermieter. Eine Zustimmung des Empfängers ist für E-Rechnungen nicht mehr erforderlich.${input.cross_border ? " Ein im Ausland ansässiger Rechnungssteller ist seinerseits nicht zur E-Rechnung verpflichtet." : ""}`,
        en: `Since ${receiveFrom}, every business established in Germany must be able to receive and process e-invoices (structured EN 16931 format) – including small businesses (§ 19 UStG) and VAT-entrepreneurs such as landlords. The recipient's consent is no longer required for e-invoices.${input.cross_border ? " A foreign-established issuer is not itself obliged to send one." : ""}`,
      },
      from: receiveFrom,
      formats,
      sources: src("b2b-receive-from", "accepted-formats"),
    };
    if (input.role === "receiver") {
      obligations.push(receive);
    } else {
      obligations.push(issueObligation(input, asOf, fact, src, formats), receive);
    }
  }

  const summary = summarize(obligations, asOf, tl.lastVerified);
  return {
    input,
    asOf,
    obligations,
    summary,
    lastVerified: tl.lastVerified,
    verifiedBy: tl.verifiedBy,
    disclaimer: OBLIGATIONS_DISCLAIMER,
  };
}

function issueObligation(
  input: z.output<typeof ObligationsInputSchema>,
  asOf: string,
  fact: <T = string>(id: string) => T,
  src: (...ids: string[]) => LegalSource[],
  formats: string[],
): Obligation {
  const allUntil = fact("b2b-issue-transition-all-until");
  const smallUntil = fact("b2b-issue-transition-small-until");
  const threshold = fact<number>("b2b-issue-small-threshold-eur");
  const allFrom = fact("b2b-issue-all-from");
  const largeFrom = fact("b2b-issue-large-from");
  const receiveFrom = fact("b2b-receive-from");
  const kleinbetrag = fact<number>("kleinbetrag-gross-eur");
  const base = {
    id: "b2b-issue",
    title: {
      de: "Ausstellung von E-Rechnungen (inländisches B2B)",
      en: "Issuing e-invoices (domestic B2B)",
    },
    formats,
  };

  if (input.cross_border) {
    return {
      ...base,
      status: "not-required",
      rationale: {
        de: "Die E-Rechnungspflicht setzt voraus, dass leistender Unternehmer und Leistungsempfänger im Inland ansässig sind (§ 14 Abs. 2 Satz 2 Nr. 1 UStG). Bei grenzüberschreitenden Umsätzen besteht keine Pflicht nach deutschem Recht; Vorgaben des Empfängerstaats (z. B. nationale E-Invoicing-Mandate, ab 2030 ViDA) sind gesondert zu prüfen.",
        en: "The mandate requires both the supplier and the recipient to be established in Germany (§ 14 (2) sentence 2 no. 1 UStG). Cross-border supplies carry no obligation under German law; the recipient country's rules (national e-invoicing mandates, ViDA from 2030) must be checked separately.",
      },
      sources: src("cross-border-not-mandated"),
    };
  }
  if (input.small_business_19_ustg) {
    return {
      ...base,
      status: "exempt",
      rationale: {
        de: "Kleinunternehmer (§ 19 UStG) dürfen ihre Rechnungen nach § 34a UStDV dauerhaft als sonstige Rechnung (Papier/PDF) ausstellen – die Ausnahme ist nicht befristet. Der Empfang von E-Rechnungen bleibt seit 2025 verpflichtend.",
        en: "Small businesses (§ 19 UStG) may permanently issue 'other invoices' (paper/PDF) under § 34a UStDV – the exemption has no time limit. Receiving e-invoices remains mandatory since 2025.",
      },
      sources: src("kleinunternehmer-exempt"),
    };
  }
  if (input.exempt_supply_4_8_29) {
    return {
      ...base,
      status: "exempt",
      rationale: {
        de: "Für Umsätze, die nach § 4 Nr. 8 bis 29 UStG steuerfrei sind (z. B. Finanzdienstleistungen, die meisten Grundstücksvermietungen), besteht keine Pflicht zur E-Rechnung (§ 14 Abs. 2 Satz 2 UStG).",
        en: "Supplies exempt under § 4 no. 8–29 UStG (e.g. financial services, most property letting) are outside the e-invoicing obligation (§ 14 (2) sentence 2 UStG).",
      },
      sources: src("exempt-supplies-4-8-29"),
    };
  }
  if (input.invoice_gross_eur !== undefined && input.invoice_gross_eur <= kleinbetrag) {
    return {
      ...base,
      status: "exempt",
      rationale: {
        de: `Kleinbetragsrechnungen bis ${fmtEur.de(kleinbetrag)} brutto können nach § 33 UStDV immer als sonstige Rechnung übermittelt werden – ohne zeitliche Befristung. Gleiches gilt für Fahrausweise (§ 34 UStDV).`,
        en: `Small-amount invoices up to ${fmtEur.en(kleinbetrag)} gross may always be sent as 'other invoices' under § 33 UStDV – with no time limit. The same applies to travel tickets (§ 34 UStDV).`,
      },
      sources: src("kleinbetrag-gross-eur", "fahrausweise-exempt"),
    };
  }
  if (asOf < receiveFrom) {
    return {
      ...base,
      status: "not-required",
      from: receiveFrom,
      rationale: {
        de: `Vor dem ${receiveFrom} besteht keine E-Rechnungspflicht; elektronische Rechnungen bedürfen der Zustimmung des Empfängers. Die Übergangsphase beginnt am ${receiveFrom}.`,
        en: `Before ${receiveFrom} there is no e-invoicing obligation; electronic invoices need the recipient's consent. The transition phase starts on ${receiveFrom}.`,
      },
      sources: src("b2b-receive-from"),
    };
  }
  if (asOf <= allUntil) {
    return {
      ...base,
      status: "transitional",
      from: receiveFrom,
      until: allUntil,
      rationale: {
        de: `Für Umsätze bis zum ${allUntil} darf jeder Unternehmer statt einer E-Rechnung noch eine sonstige Rechnung ausstellen: auf Papier immer, in einem anderen elektronischen Format (z. B. einfaches PDF) nur mit Zustimmung des Empfängers (§ 27 Abs. 38 Nr. 1 UStG). E-Rechnungen sind bereits zulässig und ohne Zustimmung des Empfängers wirksam. Ab ${largeFrom} gilt: Vorjahresumsatz über ${fmtEur.de(threshold)} → Pflicht; darunter Übergang bis ${smallUntil}; ab ${allFrom} für alle.`,
        en: `For supplies up to ${allUntil} every business may still issue an 'other invoice' instead of an e-invoice: on paper always, in another electronic format (e.g. plain PDF) only with the recipient's consent (§ 27 (38) no. 1 UStG). E-invoices are already permitted and valid without consent. From ${largeFrom}: prior-year turnover above ${fmtEur.en(threshold)} → mandatory; at or below, transition until ${smallUntil}; from ${allFrom} for everyone.`,
      },
      sources: src("b2b-issue-transition-all-until", "b2b-issue-small-threshold-eur"),
    };
  }
  if (asOf <= smallUntil) {
    if (input.annual_revenue_eur === undefined) {
      return {
        ...base,
        status: "conditional",
        from: largeFrom,
        rationale: {
          de: `Im Jahr 2027 hängt die Pflicht vom Gesamtumsatz (§ 19 Abs. 2 UStG) des Vorjahres ab: über ${fmtEur.de(threshold)} → E-Rechnung verpflichtend seit ${largeFrom}; bis ${fmtEur.de(threshold)} → sonstige Rechnung noch bis ${smallUntil} zulässig (§ 27 Abs. 38 Nr. 2 UStG). Bitte annual_revenue_eur (Vorjahresumsatz) angeben. EDI-Verfahren, die EN 16931 nicht erfüllen, sind bis ${fact("b2b-issue-edi-until")} zulässig.`,
          en: `In 2027 the obligation depends on the prior-year total turnover (§ 19 (2) UStG): above ${fmtEur.en(threshold)} → e-invoice mandatory since ${largeFrom}; at or below ${fmtEur.en(threshold)} → 'other invoices' still allowed until ${smallUntil} (§ 27 (38) no. 2 UStG). Provide annual_revenue_eur (prior-year turnover). EDI procedures not meeting EN 16931 remain allowed until ${fact("b2b-issue-edi-until")}.`,
        },
        sources: src(
          "b2b-issue-transition-small-until",
          "b2b-issue-small-threshold-eur",
          "b2b-issue-edi-until",
        ),
      };
    }
    if (input.annual_revenue_eur > threshold) {
      return {
        ...base,
        status: "required",
        from: largeFrom,
        rationale: {
          de: `Der Vorjahresumsatz von ${fmtEur.de(input.annual_revenue_eur)} liegt über ${fmtEur.de(threshold)}: seit dem ${largeFrom} müssen Rechnungen für inländische B2B-Umsätze als E-Rechnung (EN 16931) ausgestellt werden (§ 14 Abs. 2 UStG i. V. m. § 27 Abs. 38 UStG). Ausnahmen: Kleinbetragsrechnungen, Fahrausweise, steuerfreie Umsätze nach § 4 Nr. 8–29 UStG.`,
          en: `Prior-year turnover of ${fmtEur.en(input.annual_revenue_eur)} exceeds ${fmtEur.en(threshold)}: since ${largeFrom}, invoices for domestic B2B supplies must be e-invoices (EN 16931) (§ 14 (2) UStG with § 27 (38) UStG). Exceptions: small-amount invoices, travel tickets, exempt supplies under § 4 no. 8–29 UStG.`,
        },
        sources: src(
          "b2b-issue-all-from",
          "b2b-issue-small-threshold-eur",
          "kleinbetrag-gross-eur",
        ),
      };
    }
    return {
      ...base,
      status: "transitional",
      from: allFrom,
      until: smallUntil,
      rationale: {
        de: `Der Vorjahresumsatz von ${fmtEur.de(input.annual_revenue_eur)} liegt nicht über ${fmtEur.de(threshold)}: für Umsätze bis zum ${smallUntil} darf noch eine sonstige Rechnung ausgestellt werden (Papier immer, anderes elektronisches Format mit Zustimmung; § 27 Abs. 38 Nr. 2 UStG). Ab dem 1. Januar 2028 gilt die Pflicht für alle.`,
        en: `Prior-year turnover of ${fmtEur.en(input.annual_revenue_eur)} does not exceed ${fmtEur.en(threshold)}: for supplies up to ${smallUntil} an 'other invoice' may still be issued (paper always, other electronic format with consent; § 27 (38) no. 2 UStG). From 1 January 2028 the obligation applies to everyone.`,
      },
      sources: src("b2b-issue-transition-small-until", "b2b-issue-small-threshold-eur"),
    };
  }
  return {
    ...base,
    status: "required",
    from: allFrom,
    rationale: {
      de: `Seit dem ${allFrom} müssen alle inländischen Unternehmer Rechnungen für inländische B2B-Umsätze als E-Rechnung (EN 16931) ausstellen – unabhängig vom Umsatz (§ 14 Abs. 2 UStG; die Übergangsregelungen des § 27 Abs. 38 UStG sind ausgelaufen). Ausnahmen: Kleinunternehmer (§ 34a UStDV), Kleinbetragsrechnungen bis ${fmtEur.de(kleinbetrag)} (§ 33 UStDV), Fahrausweise (§ 34 UStDV), steuerfreie Umsätze nach § 4 Nr. 8–29 UStG.`,
      en: `Since ${allFrom}, every business established in Germany must issue e-invoices (EN 16931) for domestic B2B supplies regardless of turnover (§ 14 (2) UStG; the transition rules of § 27 (38) UStG have expired). Exceptions: small businesses (§ 34a UStDV), small-amount invoices up to ${fmtEur.en(kleinbetrag)} (§ 33 UStDV), travel tickets (§ 34 UStDV), exempt supplies under § 4 no. 8–29 UStG.`,
    },
    sources: src("b2b-issue-all-from", "kleinunternehmer-exempt", "kleinbetrag-gross-eur"),
  };
}

const STATUS_LABEL = {
  de: {
    required: "PFLICHT",
    transitional: "ÜBERGANG",
    conditional: "BEDINGT",
    exempt: "AUSGENOMMEN",
    "not-required": "KEINE PFLICHT",
    "out-of-scope": "NICHT ABGEDECKT",
  },
  en: {
    required: "REQUIRED",
    transitional: "TRANSITIONAL",
    conditional: "CONDITIONAL",
    exempt: "EXEMPT",
    "not-required": "NOT REQUIRED",
    "out-of-scope": "OUT OF SCOPE",
  },
} as const;

function summarize(
  obligations: Obligation[],
  asOf: string,
  lastVerified: string,
): { de: string; en: string } {
  const line = (lang: "de" | "en") =>
    obligations
      .map(
        (o) =>
          `${o.title[lang]}: ${STATUS_LABEL[lang][o.status]}${o.from ? ` (${lang === "de" ? "ab" : "from"} ${o.from}${o.until ? ` ${lang === "de" ? "bis" : "until"} ${o.until}` : ""})` : ""}`,
      )
      .join(" · ");
  return {
    de: `Stand ${asOf}: ${line("de")}. Rechtsstand geprüft am ${lastVerified}. ${OBLIGATIONS_DISCLAIMER.de}`,
    en: `As of ${asOf}: ${line("en")}. Legal parameters verified on ${lastVerified}. ${OBLIGATIONS_DISCLAIMER.en}`,
  };
}

export { STATUS_LABEL as OBLIGATION_STATUS_LABEL };
