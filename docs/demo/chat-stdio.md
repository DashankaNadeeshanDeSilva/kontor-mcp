# kontor-agent chat — stdio transport

Recorded 2026-08-26T06:28Z with `tools/demo-chat.sh`. Server spawned over stdio; the server made no network calls.

```
$ kontor-agent chat -m "Prüfe bitte diese Rechnung und sage mir, ob wir sie bezahlen dürfen: /Users/dashankadesilva/Drive/Projects/Kontor-MCP/packages/server/samples/broken-missing-buyer-reference.xml — und dann die ZUGFeRD-Rechnung /Users/dashankadesilva/Drive/Projects/Kontor-MCP/packages/server/samples/valid-zugferd-en16931.pdf."
[kontor-agent 0.9.0 · stdio → /usr/local/bin/node /Users/dashankadesilva/Drive/Projects/Kontor-MCP/packages/server/dist/bin.js · claude-opus-5 · effort high]
I'll audit both invoices.
  → audit_invoice file_path=/Users/dashankadesilva/Drive/Projects/Kontor-MCP/packages… lang=de
  → audit_invoice file_path=/Users/dashankadesilva/Drive/Projects/Kontor-MCP/packages… lang=de
  ← audit_invoice recommendation=accept · verdict=valid · 174 ms
  ← audit_invoice recommendation=reject · verdict=invalid · 278 ms
**1. broken-missing-buyer-reference.xml — ABLEHNEN**

- Rechnung 123456XX vom 04.04.2016, UBL / XRechnung 3.0
- Ergebnis: **UNGÜLTIG** (1 Fehler)
- **BR-DE-15**: Käuferreferenz (BT-10) fehlt — bei XRechnung Pflicht (Leitweg-ID des öffentlichen Auftraggebers). KoSIT-Validator würde die Rechnung abweisen.
  - Fix beim Lieferanten anfordern: `cbc:BuyerReference` mit der Leitweg-ID (Format z. B. 04011000-12345-67) befüllen.
- Info: Liefer-/Leistungsdatum fehlt (BR-DE-TMP-32, noch nicht verpflichtend); Rechnungsdatum > 1 Jahr alt → prüfen, ob bereits gebucht.
- Beträge: Netto 314,86 € · USt 22,04 € (7 %) · Brutto 336,90 €

→ **Nicht bezahlen**, korrigierte Rechnung anfordern.

**2. valid-zugferd-en16931.pdf — ANNEHMEN**

- Rechnung RE-20201121/508 vom 21.11.2020, fällig 12.12.2020 · Bei Spiel GmbH → Theodor Est
- Format: ZUGFeRD/Factur-X CII, Profil EN16931
- Ergebnis: **GÜLTIG** — keine Fehler oder Warnungen
- Beträge: Netto 496,00 € · USt 75,04 € (7 %: 160,00→11,20 | 19 %: 336,00→63,84) · Brutto 571,04 €
- Käuferreferenz BT-10: AB321 · IBAN DE88200800000970375700
- Einziger Hinweis: Rechnungsdatum liegt > 1 Jahr zurück → bitte gegen bereits gebuchte Belege abgleichen (Dublettenrisiko).

→ **Zahlung möglich**, nach Dublettencheck.

Hinweis: Formale/technische Prüfung nach EN 16931 / XRechnung – keine steuerliche oder rechtliche Beratung.
  [17941 in / 1047 out · stop=end_turn]
```
