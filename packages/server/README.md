# @kontor-mcp/server

Sovereign MCP server for German/EU e-invoices (XRechnung, ZUGFeRD/Factur-X, EN 16931): parse, validate and explain — 100 % offline, no Java, no network.

## Tools (v0.1)

| Tool | Purpose |
|---|---|
| `parse_invoice` | Detect format (UBL/CII · EN 16931 · XRechnung version/variant · ZUGFeRD profile) and return the EN 16931 semantic model |
| `validate_invoice` | XSD + official EN 16931 / XRechnung Schematron with the KoSIT scenario model → `valid` / `valid_with_warnings` / `invalid`, findings with DE/EN explanations and fix hints |
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

Restart Claude Desktop, attach an invoice (or ask for `kontor://samples/broken-missing-buyer-reference.xml`) and ask *"Ist diese Rechnung gültig?"*.

## Claude Code

```sh
claude mcp add kontor -- node /absolute/path/to/kontor-mcp/packages/server/dist/bin.js
```

## MCP Inspector

```sh
npx @modelcontextprotocol/inspector node packages/server/dist/bin.js
# or headless:
npx @modelcontextprotocol/inspector --cli node packages/server/dist/bin.js --method tools/list
```

## Privacy / sovereignty

Stateless; nothing is stored or transmitted; invoice contents are never logged (see PRD NFR-2/NFR-5/NFR-6). Findings are formal/technical checks, not tax or legal advice.
