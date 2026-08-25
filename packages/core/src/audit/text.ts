import type { Finding } from "../finding.js";
import type { AuditReport } from "./index.js";

type Lang = "de" | "en";

/** Compact, deterministic text rendering of an audit report (DE/EN). */
export function renderAuditText(r: AuditReport, lang: Lang): string {
  const L = lang === "de";
  const amt = (v: string | undefined) => (v === undefined ? "–" : L ? v.replace(".", ",") : v);
  const h = r.header;
  const verdict = {
    valid: L ? "GÜLTIG" : "VALID",
    valid_with_warnings: L ? "GÜLTIG (mit Warnungen)" : "VALID (with warnings)",
    invalid: L ? "UNGÜLTIG" : "INVALID",
  }[r.verdict];
  const rec = {
    accept: L ? "ANNEHMEN" : "ACCEPT",
    review: L ? "PRÜFEN" : "REVIEW",
    reject: L ? "ABLEHNEN" : "REJECT",
  }[r.recommendation];

  const lines: string[] = [];
  lines.push(
    `${L ? "Rechnung" : "Invoice"} ${h.number} ${L ? "vom" : "of"} ${h.issueDate}${h.dueDate ? ` (${L ? "fällig" : "due"} ${h.dueDate})` : ""} · ${h.seller.name} → ${h.buyer.name}`,
  );
  const fmtParts = [
    h.format.syntax?.toUpperCase(),
    h.format.version ? `XRechnung ${h.format.version}` : undefined,
    h.format.profile,
  ]
    .filter(Boolean)
    .join(" · ");
  lines.push(
    `${L ? "Format" : "Format"}: ${fmtParts || "?"}${h.source?.pdf ? ` (PDF: ${h.source.pdf.filename})` : ""} · ${L ? "Prüfung" : "Rule set"}: ${h.scenario ?? (L ? "nur XSD" : "XSD only")}`,
  );
  lines.push(
    `${L ? "Ergebnis" : "Verdict"}: ${verdict} — ${r.stats.fatal} fatal · ${r.stats.error} ${L ? "Fehler" : "errors"} · ${r.stats.warning} ${L ? "Warnungen" : "warnings"} · ${r.stats.info} Info`,
  );
  lines.push(`${L ? "Empfehlung" : "Recommendation"}: ${rec} — ${r.rationale[lang]}`);
  lines.push(
    `${L ? "Beträge" : "Amounts"} (${h.currency}): ${L ? "Netto" : "Net"} ${amt(h.totals.taxExclusive)} · ${L ? "USt" : "VAT"} ${amt(h.totals.taxAmount)} · ${L ? "Brutto" : "Gross"} ${amt(h.totals.taxInclusive)} · ${L ? "Zahlbetrag" : "Due"} ${amt(h.totals.payable)} · ${h.lineCount} ${L ? "Positionen" : "lines"}`,
  );
  const breakdown = h.taxBreakdown
    .map(
      (b) =>
        `${b.categoryCode} ${b.rate ?? "–"} %: ${amt(b.taxableAmount)} → ${amt(b.taxAmount)}${b.exemptionReason ? ` (${b.exemptionReason})` : ""}`,
    )
    .join(" | ");
  lines.push(`${L ? "USt-Aufschlüsselung" : "VAT breakdown"} (BG-23): ${breakdown || "–"}`);
  if (h.buyerReference)
    lines.push(
      `${L ? "Käuferreferenz/Leitweg-ID" : "Buyer reference/Leitweg-ID"} (BT-10): ${h.buyerReference}`,
    );
  if (h.payment)
    lines.push(
      `${L ? "Zahlung" : "Payment"}: ${L ? "Code" : "code"} ${h.payment.meansCode}${h.payment.ibans.length ? ` · IBAN ${h.payment.ibans.join(", ")}` : ""}`,
    );

  const section = (title: string, fs: Finding[]) => {
    if (!fs.length) return;
    lines.push("", `${title} (${fs.length}):`);
    for (const f of fs.slice(0, 20)) {
      lines.push(
        `- [${f.severity}] ${f.ruleId}${f.location ? ` @ ${f.location}` : ""}: ${f.explanation?.[lang] ?? f.message}`,
      );
      if (f.fixHint?.[lang]) lines.push(`    ↳ Fix: ${f.fixHint[lang]}`);
    }
    if (fs.length > 20) lines.push(`… ${fs.length - 20} ${L ? "weitere" : "more"}`);
  };
  section(L ? "Struktur (XSD)" : "Structure (XSD)", r.findings.structure);
  section(
    L ? "Geschäftsregeln (EN 16931 / XRechnung)" : "Business rules (EN 16931 / XRechnung)",
    r.findings.businessRules,
  );
  section(L ? "Plausibilität (Kontor)" : "Plausibility (Kontor)", r.findings.plausibility);
  lines.push("", r.disclaimer[lang]);
  return lines.join("\n");
}
