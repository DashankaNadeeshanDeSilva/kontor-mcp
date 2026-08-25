/** kontor://reference/* — rule KB index, code lists and the orientation cheatsheet (all bundled, read-only). */

import {
  bundledStandards,
  explainRule,
  kbStats,
  listCodelists,
  listRuleIds,
  loadCodelist,
  loadLegalTimeline,
} from "@kontor-mcp/rules";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

export function rulesIndex(): {
  total: number;
  curated: number;
  rules: Array<{ id: string; source: string; severity: string; curated: boolean; text: string }>;
} {
  const stats = kbStats();
  const rules = listRuleIds().map((id) => {
    const r = explainRule(id);
    if (!r.found) return { id, source: "unknown", severity: "unknown", curated: false, text: "" };
    return {
      id,
      source: r.entry.source,
      severity: r.entry.severity,
      curated: r.entry.curated,
      text: r.entry.explanation.en || r.entry.officialText,
    };
  });
  return { total: stats.total, curated: stats.curated, rules };
}

export function cheatsheet(): string {
  const tl = loadLegalTimeline();
  const f = (id: string) => String(tl.facts[id]?.value ?? "?");
  const stats = kbStats();
  const lists = listCodelists();
  return `# Kontor MCP — EN 16931 / XRechnung / ZUGFeRD cheatsheet

## Formats
- **EN 16931**: the European semantic model (business terms BT-1…BT-162, groups BG-*). Two XML syntaxes: **UBL 2.1** (Invoice / CreditNote) and **UN/CEFACT CII D16B** (CrossIndustryInvoice).
- **XRechnung ${bundledStandards.xrechnung}**: the German CIUS on top of EN 16931 (rules BR-DE-*), both syntaxes; mandatory for the public sector. CustomizationID \`urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0\`.
- **ZUGFeRD / Factur-X**: PDF/A-3 with embedded CII XML (\`factur-x.xml\`). Profiles: MINIMUM, BASIC WL (not EN 16931-compliant invoices!), BASIC, **EN 16931**, EXTENDED, XRECHNUNG. For the German mandate use EN 16931 or higher (ZUGFeRD ≥ 2.0.1).
- Bundled rule sets: EN 16931 Schematron ${bundledStandards.en16931}, XRechnung Schematron ${bundledStandards.xrechnungSchematron}, KoSIT validator configuration ${bundledStandards.validatorConfiguration}; rule knowledge base ${stats.total} rules (${stats.curated} curated DE/EN).

## XRechnung must-haves that get invoices rejected
- **BT-10 Buyer reference** (BR-DE-15) — for public buyers the **Leitweg-ID** (check digits ISO 7064 MOD 97-10, e.g. \`04011000-12345-03\`).
- Seller contact **BG-6**: name (BR-DE-5), phone (BR-DE-6, ≥ 3 digits BR-DE-27), e-mail (BR-DE-7); seller address city/post code/country (BR-DE-3/4); seller VAT ID or tax number (BR-DE-16 / BR-CO-26).
- **Payment means BG-16** (BR-DE-1): code 58 SEPA credit transfer + IBAN (BR-DE-23), or 59 direct debit + mandate (BR-DE-24), or 48 card (BR-DE-25). Due date **or** payment terms when an amount is due (BR-CO-25).
- Electronic addresses BT-34 / BT-49 with scheme (\`EM\` e-mail, \`0204\` Leitweg-ID, \`0088\` GLN).
- Arithmetic (BR-CO-10…16): line nets → totals → VAT breakdown per category/rate (BR-S-08/09, BR-CO-17); exempt categories need a reason (BR-E-10, BR-AE-10, BR-IC-10, BR-G-10). Kontor recomputes everything to the cent (KONTOR-PLAUS-*).

## German mandate timeline (verified ${tl.lastVerified})
- **${f("b2b-receive-from")}**: every domestic business must be able to **receive** e-invoices (incl. small businesses).
- until **${f("b2b-issue-transition-all-until")}**: everyone may still issue paper / PDF (PDF only with the recipient's consent).
- until **${f("b2b-issue-transition-small-until")}**: same for issuers with prior-year turnover ≤ ${Number(f("b2b-issue-small-threshold-eur")).toLocaleString("en-US")} € (§ 27 Abs. 38 UStG); EDI until ${f("b2b-issue-edi-until")}.
- **${f("b2b-issue-all-from")}**: all domestic B2B invoices must be e-invoices. Permanent exemptions: small businesses (§ 34a UStDV), invoices ≤ ${f("kleinbetrag-gross-eur")} € (§ 33 UStDV), tickets (§ 34 UStDV), exempt supplies § 4 Nr. 8–29 UStG, B2C, cross-border.
- **B2G**: XRechnung + Leitweg-ID to federal bodies since ${f("b2g-federal-from")} (direct orders ≤ ${f("b2g-direct-order-threshold-net-eur")} € net exempt; Länder differ). Use \`check_obligations\` for a sourced answer.

## Code lists (\`kontor://reference/codelists/{list}\`)
${lists.map((l) => `- \`${l}\``).join("\n")}

## Tools
- \`audit_invoice\` — one call: parse + validate + plausibility → accept / review / reject.
- \`validate_invoice\` (KoSIT-equivalent verdict), \`parse_invoice\`, \`explain_rule\`, \`generate_invoice\` (XRechnung UBL), \`convert_invoice\` (UBL ↔ CII, extract, HTML preview), \`check_obligations\`, \`list_capabilities\`.

Kontor works fully offline; findings are formal/technical checks — not tax or legal advice.
`;
}

export function registerReferenceResources(server: McpServer): void {
  server.registerResource(
    "reference-rules",
    "kontor://reference/rules",
    {
      title: "Rule knowledge base index",
      description:
        "All bundled EN 16931 / XRechnung rule ids with source, severity, curated flag and a one-line text",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "application/json", text: JSON.stringify(rulesIndex()) },
      ],
    }),
  );
  server.registerResource(
    "reference-cheatsheet",
    "kontor://reference/cheatsheet",
    {
      title: "EN 16931 / XRechnung / ZUGFeRD cheatsheet",
      description:
        "One-page orientation: formats, must-have terms, mandate timeline, code lists, tools",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: cheatsheet() }],
    }),
  );
  server.registerResource(
    "reference-codelists",
    new ResourceTemplate("kontor://reference/codelists/{list}", {
      list: async () => ({
        resources: listCodelists().map((name) => {
          const c = loadCodelist(name);
          return {
            uri: `kontor://reference/codelists/${name}`,
            name,
            title: c?.title.en ?? name,
            description: `${c?.standard ?? ""} — ${c?.count ?? 0} codes, ${Object.keys(c?.common ?? {}).length} with DE/EN names`,
            mimeType: "application/json",
          };
        }),
      }),
    }),
    {
      title: "Code lists",
      description:
        "EN 16931 code lists (units, VAT categories, payment means, EAS, VATEX, invoice types, …) with DE/EN names for common codes",
    },
    async (uri, { list }) => {
      const c = loadCodelist(String(list));
      if (!c)
        throw new Error(
          `Unknown code list "${String(list)}"; available: ${listCodelists().join(", ")}`,
        );
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(c) }],
      };
    },
  );
}
