# Announcement draft — Kontor MCP v1.0

**LinkedIn (DE/EN mixed, ~150 words)**

Kontor MCP v1.0 ist da. 🧾

Ab 2025 müssen deutsche Unternehmen E-Rechnungen empfangen, ab 2027/2028 auch versenden. Die Prüfung — XRechnung, ZUGFeRD, EN 16931 — ist formal, regelbasiert und genau das, was ein KI-Agent nicht raten sollte.

Kontor MCP gibt Claude (und jedem MCP-Client) acht Werkzeuge dafür: Rechnung prüfen, auditieren (annehmen / prüfen / ablehnen), konvertieren, XRechnung und ZUGFeRD-PDF/A-3 erzeugen, Pflichten nach Datum und Rolle erklären.

Was mir wichtig war:
- 100 % lokal. Kein API-Key, keine Telemetrie, kein Netzwerkzugriff — ein automatisierter Test beweist es bei jedem Build.
- Offizielle Regeln, keine Näherung: KoSIT-Schematron, 89/89 Übereinstimmung mit dem Referenz-Validator, als CI-Gate.
- PDF/A-3 mit veraPDF und Mustang verifiziert.

`npx -y @kontor-mcp/server` — Apache-2.0.

Repo: https://github.com/DashankaNadeeshanDeSilva/kontor-mcp

#eRechnung #XRechnung #ZUGFeRD #MCP #Claude #OpenSource

**Blog post outline**

1. Why: the mandate timeline, why validation is a rules problem, why "sovereign" matters for invoice data (DSGVO).
2. What: the eight tools, a 60-second GIF, the `kontor-agent` trace showing what the model actually calls.
3. How we prove it: conformance gate (link CONFORMANCE.md "Gate proof"), sovereignty test, veraPDF/Mustang.
4. Architecture in one diagram; what is deliberately out of scope (tax advice, ERP posting).
5. Try it: npx, Docker, Claude Desktop snippet; roadmap (Peppol, more profiles).
