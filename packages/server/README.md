# @kontor-mcp/server

Sovereign MCP server for German/EU e-invoices (XRechnung, ZUGFeRD/Factur-X, EN 16931): parse, validate and explain — 100 % offline, no Java, no network.

## Tools (v0.1)

| Tool | Purpose |
|---|---|
| `parse_invoice` | Detect format (UBL/CII · EN 16931 · XRechnung version/variant · ZUGFeRD profile) and return the EN 16931 semantic model |
| `validate_invoice` | XSD + official EN 16931 / XRechnung Schematron with the KoSIT scenario model → `valid` / `valid_with_warnings` / `invalid`, findings with DE/EN explanations and fix hints |
| `audit_invoice` | One call for AP: parse + validate + Kontor plausibility (totals recomputed, VAT rates, IBAN, Leitweg-ID check digits, dates, `known_invoice_numbers` duplicates) → header facts, VAT breakdown, verdict, grouped findings, **accept / review / reject** with rationale |
| `generate_invoice` | Structured data → compliant **XRechnung 3.0 (UBL)** or, with `target: zugferd-pdf`, a **ZUGFeRD 2.3 / Factur-X PDF/A-3** (`zugferd_profile` EN16931 / BASIC / EXTENDED, embedded `factur-x.xml`, veraPDF- and Mustang-verified): decimal-safe amounts/VAT/totals, internal validation (fail-honest `valid` — for PDFs the XML is read back out of the file first), deterministic auto-fixes reported, optional `output_path` (`.xml` / `.pdf`, never overwrites unless `overwrite=true`), otherwise `pdf_base64` |
| `convert_invoice` | `extract-xml` (ZUGFeRD PDF → XML), `xrechnung-ubl` / `cii` via the semantic model with post-validation and an honest `lossReport`, `html-preview` (self-contained HTML, no scripts/assets); optional `output_path` |
| `check_obligations` | Offline decision tree over the German mandate (§ 14 / § 27 Abs. 38 UStG, UStDV §§ 33/34/34a, E-RechV): issuer/receiver × B2B/B2G/B2C, transition 2026 → 2027 (€800k) → 2028, exemptions, formats, Leitweg-ID — with primary sources, `lastVerified` and a non-advice disclaimer |
| `list_capabilities` | Introspection: formats/profiles, bundled standard versions, KB stats, code lists, legal `lastVerified`, tools/resources/prompts, sovereignty statement |
| `explain_rule` | Explain a rule id such as `BR-DE-15` (official text, explanation, affected BTs, fix hint); unknown ids get suggestions |

Every document tool accepts either `file_path` (absolute; `.xml`/`.pdf`; ≤ 20 MB, `KONTOR_MAX_FILE_MB`) or `content_base64` (+ optional `content_type`), and `lang: "de" | "en"` (default `de`).

Resources: `kontor://samples/{name}` — bundled sample invoices (`valid-xrechnung-ubl.xml`, `valid-xrechnung-cii.xml`, `broken-missing-buyer-reference.xml`, `valid-zugferd-en16931.pdf`).

## Claude Desktop

`claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "kontor": {
      "command": "npx",
      "args": ["-y", "@kontor-mcp/server"]
    }
  }
}
```

From a local checkout (before the npm publish):

```json
{
  "mcpServers": {
    "kontor": {
      "command": "node",
      "args": ["/absolute/path/to/kontor-mcp/packages/server/dist/bin.js"]
    }
  }
}
```

Use an absolute path to `node` (`which node`) if Desktop cannot find it — it launches servers with a minimal `PATH`. Quit Desktop fully (⌘Q) and reopen; the config is read at launch. Logs: `~/Library/Logs/Claude/mcp-server-kontor.log`.

Restart Claude Desktop, attach an invoice (or `+` → *Add from kontor* → `broken-missing-buyer-reference.xml`) and ask *"Ist diese Rechnung gültig?"*.

All three tools are read-only and offline (`readOnlyHint`, no network, nothing stored), so it is safe to set them to **Always allow** under *Settings → Connectors → kontor*; on first use Desktop shows a "Needs approval" prompt otherwise.

**PDFs:** Desktop does not hand attached PDF bytes to the server, so reference ZUGFeRD/Factur-X PDFs by local path instead: *"Was steht in dieser Rechnung? /path/to/invoice.pdf"*. XML attachments work either way (the model re-sends them as `content_base64`).

## Claude Code

```sh
claude mcp add kontor -- node /absolute/path/to/kontor-mcp/packages/server/dist/bin.js
```

## MCP Inspector

```sh
npx @modelcontextprotocol/inspector@latest node packages/server/dist/bin.js
# or headless:
npx @modelcontextprotocol/inspector@latest --cli node packages/server/dist/bin.js --method tools/list
```

## Privacy / sovereignty

Stateless; nothing is stored or transmitted; invoice contents are never logged (see PRD NFR-2/NFR-5/NFR-6). Findings are formal/technical checks, not tax or legal advice.

## Resources and prompts

| URI / name | What |
|---|---|
| `kontor://samples/{name}` | Sample invoices (UBL, CII, ZUGFeRD PDF, one broken) |
| `kontor://reference/rules` | Rule knowledge-base index (all EN 16931 / XRechnung rule ids, severity, curated flag) |
| `kontor://reference/codelists/{list}` | `units`, `vat-categories`, `payment-means`, `eas`, `vatex`, `invoice-types`, `currencies`, `countries`, `allowance-reasons`, `charge-reasons`, `identifier-schemes`, `mime-types`, `vat-point-date-codes` — official code values with DE/EN names for the common ones |
| `kontor://reference/cheatsheet` | One-page EN 16931 / XRechnung / ZUGFeRD orientation incl. the German mandate timeline (Markdown) |
| prompt `audit-incoming-invoice` | Run `audit_invoice` and present a decision-ready AP summary |
| prompt `draft-supplier-rejection` | Draft (never send) a German rejection e-mail citing the concrete rule violations |
| prompt `create-invoice-interview` | Interview for the minimal XRechnung field set, then `generate_invoice` |
