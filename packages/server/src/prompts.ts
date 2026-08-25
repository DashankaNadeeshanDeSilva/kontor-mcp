/** PRD §5.7 prompts. They instruct the agent; they never send anything themselves (NG2). */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const lang = z.enum(["de", "en"]).optional().describe("Language of the answer (default de)");

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "audit-incoming-invoice",
    {
      title: "Audit an incoming invoice",
      description:
        "Run audit_invoice on a file and present a decision-ready summary for an accounts-payable clerk.",
      argsSchema: {
        file_path: z
          .string()
          .optional()
          .describe("Absolute local path; omit when the invoice is attached to the chat"),
        lang,
      },
    },
    ({ file_path, lang: l }) => {
      const de = (l ?? "de") === "de";
      const source = file_path
        ? de
          ? `die Datei \`${file_path}\` (per \`file_path\`)`
          : `the file \`${file_path}\` (via \`file_path\`)`
        : de
          ? "die angehängte Rechnung (per `content_base64`)"
          : "the attached invoice (via `content_base64`)";
      const text = de
        ? `Prüfe ${source} mit dem Tool \`audit_invoice\` (lang: de). Stelle das Ergebnis für eine Sachbearbeiterin in der Kreditorenbuchhaltung dar:
1. Kopfdaten: Rechnungsnummer, Datum, Verkäufer → Käufer, Zahlbetrag, USt-Aufschlüsselung (BG-23).
2. Ergebnis und Empfehlung (ANNEHMEN / PRÜFEN / ABLEHNEN) mit der Begründung des Tools.
3. Befunde gruppiert nach Struktur / Geschäftsregeln / Plausibilität, je mit Regel-ID und dem Fix-Hinweis; keine Befunde erfinden, keine weglassen.
4. Nächster Schritt in einem Satz (z. B. „Lieferanten um korrigierte Rechnung bitten“ – dafür gibt es den Prompt \`draft-supplier-rejection\`).
Gib die Disclaimer-Zeile des Tools wörtlich wieder.`
        : `Audit ${source} with the \`audit_invoice\` tool (lang: en). Present the result for an accounts-payable clerk:
1. Header facts: invoice number, date, seller → buyer, amount due, VAT breakdown (BG-23).
2. Verdict and recommendation (ACCEPT / REVIEW / REJECT) with the tool's rationale.
3. Findings grouped by structure / business rules / plausibility, each with rule id and fix hint; do not invent or drop findings.
4. Next step in one sentence (e.g. "ask the supplier for a corrected invoice" – use the \`draft-supplier-rejection\` prompt for that).
Quote the tool's disclaimer line verbatim.`;
      return { messages: [{ role: "user", content: { type: "text", text } }] };
    },
  );

  server.registerPrompt(
    "draft-supplier-rejection",
    {
      title: "Draft a supplier rejection e-mail",
      description:
        "Draft (never send) a polite e-mail to the supplier that cites the concrete rule violations and asks for a corrected e-invoice.",
      argsSchema: {
        findings: z
          .string()
          .describe("The audit findings (rule ids + messages), pasted as text or JSON"),
        tone: z
          .enum(["formal", "friendly"])
          .optional()
          .describe("formal (Sie, default) or friendly"),
        invoice_number: z.string().optional(),
        lang,
      },
    },
    ({ findings, tone, invoice_number, lang: l }) => {
      const de = (l ?? "de") === "de";
      const friendly = tone === "friendly";
      const text = de
        ? `Entwirf eine E-Mail an den Lieferanten${invoice_number ? ` zur Rechnung ${invoice_number}` : ""}, mit der die Rechnung zurückgewiesen und eine korrigierte E-Rechnung angefordert wird. Ton: ${friendly ? "freundlich, aber klar (Sie-Form)" : "sachlich-formell (Sie-Form)"}.
Regeln:
- Nenne jeden Befund konkret mit Regel-ID und was fehlt/falsch ist; formuliere den Fix als Bitte („Bitte ergänzen Sie …“). Erfinde keine weiteren Mängel.
- Unterscheide verbindliche Regelverstöße (BR-*, BR-DE-*) von Plausibilitätshinweisen (KONTOR-PLAUS-*): letztere als Rückfrage, nicht als Ablehnungsgrund.
- Verweise auf das Format (XRechnung / EN 16931) und ggf. die Leitweg-ID; keine steuerlichen oder rechtlichen Bewertungen.
- Betreff, Anrede, Grußformel, Platzhalter [Name] / [Firma] wo unbekannt.
Wichtig: Dies ist nur ein Entwurf – die E-Mail wird nicht versendet; der Nutzer prüft und sendet selbst.

Befunde:
${findings}`
        : `Draft an e-mail to the supplier${invoice_number ? ` about invoice ${invoice_number}` : ""} rejecting the invoice and asking for a corrected e-invoice. Tone: ${friendly ? "friendly but clear" : "formal"}. Write it in German unless the findings indicate an English-speaking supplier.
Rules:
- Name every finding concretely with its rule id and what is missing/wrong; phrase the fix as a request. Do not invent additional defects.
- Distinguish binding rule violations (BR-*, BR-DE-*) from plausibility notes (KONTOR-PLAUS-*): the latter are questions, not grounds for rejection.
- Refer to the format (XRechnung / EN 16931) and, where relevant, the Leitweg-ID; no tax or legal assessments.
- Subject, salutation, sign-off, placeholders [Name] / [Company] where unknown.
Important: this is a draft only – the e-mail is not sent; the user reviews and sends it.

Findings:
${findings}`;
      return { messages: [{ role: "user", content: { type: "text", text } }] };
    },
  );

  server.registerPrompt(
    "create-invoice-interview",
    {
      title: "Create an XRechnung by interview",
      description:
        "Walk a small-business user through the minimal EN 16931 / XRechnung field set, then call generate_invoice.",
      argsSchema: { lang },
    },
    ({ lang: l }) => {
      const de = (l ?? "de") === "de";
      const text = de
        ? `Führe den Nutzer in kurzen Schritten durch die Angaben für eine XRechnung und rufe danach \`generate_invoice\` auf. Frage nur, was fehlt; fasse mehrere Felder pro Frage zusammen; nichts erfinden.
1. Rechnung: Nummer, Rechnungsdatum, Fälligkeitsdatum **oder** Zahlungsbedingungen (BR-CO-25), Käuferreferenz/Leitweg-ID (BT-10, bei Behörden Pflicht), ggf. Bestellnummer.
2. Verkäufer: Firmenname, Straße, PLZ, Ort, Land (Standard DE), USt-IdNr. **oder** Steuernummer, Ansprechpartner, Telefon (≥ 3 Ziffern), E-Mail.
3. Käufer: Name, Adresse, E-Mail (elektronische Adresse), ggf. USt-IdNr. (Pflicht bei Reverse Charge).
4. Zahlung: IBAN (Pflicht), BIC optional, Kontoinhaber, Verwendungszweck.
5. Positionen: Bezeichnung, Menge, Einheit (Standard C62 = Stück; HUR Stunde, DAY Tag – siehe \`kontor://reference/codelists/units\`), Nettopreis, USt-Satz (19 / 7 / 0) bzw. Kategorie (S / Z / E / AE – bei E/AE Befreiungsgrund).
Nach dem Aufruf: Beträge und USt-Aufschlüsselung zeigen; \`valid\` und \`plausible\` ehrlich berichten; bei \`valid: false\` die Befunde erklären und fehlende Angaben nachfragen. Optional \`output_path\` zum Speichern anbieten. Disclaimer-Zeile wiedergeben.`
        : `Guide the user through the data for an XRechnung in short steps, then call \`generate_invoice\`. Ask only for what is missing; bundle several fields per question; never invent data.
1. Invoice: number, issue date, due date **or** payment terms (BR-CO-25), buyer reference / Leitweg-ID (BT-10, mandatory for public buyers), order number if any.
2. Seller: legal name, street, post code, city, country (default DE), VAT ID **or** tax number, contact name, phone (≥ 3 digits), e-mail.
3. Buyer: name, address, e-mail (electronic address), VAT ID if applicable (mandatory for reverse charge).
4. Payment: IBAN (mandatory), BIC optional, account holder, remittance info.
5. Lines: description, quantity, unit (default C62 = piece; HUR hour, DAY day – see \`kontor://reference/codelists/units\`), net price, VAT rate (19 / 7 / 0) or category (S / Z / E / AE – exemption reason for E/AE).
After the call: show amounts and VAT breakdown; report \`valid\` and \`plausible\` honestly; if \`valid: false\`, explain the findings and ask for the missing data. Offer \`output_path\` to save the file. Quote the disclaimer line.`;
      return { messages: [{ role: "user", content: { type: "text", text } }] };
    },
  );
}
