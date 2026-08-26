# @kontor-mcp/core

MCP-free TypeScript library behind [Kontor MCP](https://github.com/DashankaNadeeshanDeSilva/kontor-mcp): detect, parse, validate (XSD + official EN 16931 / XRechnung Schematron via Saxon-JS, 89/89 parity with the KoSIT validator), audit with plausibility checks, convert UBL ⇄ CII, generate XRechnung 3.0 UBL and ZUGFeRD 2.3 PDF/A-3, and answer German e-invoicing obligations — all offline, no network, decimal-safe money math.

```ts
import { auditInvoice, generateInvoice, validateInvoice } from "@kontor-mcp/core";
const report = await auditInvoice(await fs.readFile("invoice.xml"));
console.log(report.recommendation, report.findings.map((f) => f.ruleId));
```

Main entry points: `detectInvoice`, `parseInvoice`, `validateInvoice`, `auditInvoice` / `renderAuditText`, `generateInvoice` (`target: "zugferd-pdf"`), `convertInvoice`, `checkObligations`, `extractEmbeddedXml`, `renderHtmlPreview`. Standards artefacts come from `@kontor-mcp/rules`. Docs, conformance evidence and the security posture: the repository README, `docs/CONFORMANCE.md`, `SECURITY.md`. Apache-2.0.
