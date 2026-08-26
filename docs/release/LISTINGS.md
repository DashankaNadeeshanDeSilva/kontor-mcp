# Directory listings — ready-to-paste text

## Short description (≤ 160 chars)

Sovereign e-invoice tools for AI agents: validate, audit, convert and generate XRechnung / ZUGFeRD / Factur-X (EN 16931) fully offline with the official KoSIT rules.

## Long description

Kontor MCP gives any MCP client (Claude Desktop, Claude Code, custom agents) eight tools for German/EU electronic invoices: `parse_invoice`, `validate_invoice` (XSD + the official EN 16931 and XRechnung Schematron — 89/89 parity with the KoSIT validator, enforced in CI), `audit_invoice` (one-call accept/review/reject with plausibility checks: VAT math, IBAN, Leitweg-ID, duplicates), `generate_invoice` (XRechnung 3.0 UBL and ZUGFeRD 2.3 PDF/A-3, veraPDF-verified), `convert_invoice` (UBL ⇄ CII, ZUGFeRD extraction, HTML preview with loss report), `check_obligations` (the German e-invoicing mandate timeline with sources), `explain_rule` and `list_capabilities`. Plus reference resources (rule knowledge base, code lists, cheat sheet) and prompts.

Everything runs locally: no API keys, no telemetry, no network calls — proven by an automated no-network test. stdio for desktop clients, Streamable HTTP with bearer auth for remote agents, Docker image for amd64/arm64. Apache-2.0.

## Tags

e-invoice · XRechnung · ZUGFeRD · Factur-X · EN 16931 · KoSIT · accounts payable · DATEV · Germany · sovereignty · offline

## Official MCP Registry

`packages/server/server.json` (name `io.github.dashankanadeeshandesilva/kontor-mcp`, npm package `@kontor-mcp/server`, OCI image on GHCR). Publish with `mcp-publisher` — see `RELEASE-CHECKLIST.md` §4.

## Smithery

Needs a public Streamable-HTTP URL (`https://<host>/mcp`) or an MCPB bundle. Listing text: short + long description above. Transport: Streamable HTTP, bearer token (`KONTOR_AUTH_TOKEN`), 401 without token.

## mcpmarket.com

Name: Kontor MCP · Category: Finance / Documents · Repo: https://github.com/DashankaNadeeshanDeSilva/kontor-mcp · Install: `npx -y @kontor-mcp/server` · Description: short description above.

## Claude Desktop config snippet (for listings that show one)

```json
{ "mcpServers": { "kontor": { "command": "npx", "args": ["-y", "@kontor-mcp/server"] } } }
```
