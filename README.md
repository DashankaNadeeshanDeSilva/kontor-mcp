# Kontor MCP

> **The sovereign e-invoice toolkit for AI agents.** Official XRechnung / EN 16931 validation, ZUGFeRD in and out, 100% offline, zero API keys.

Kontor MCP is an open-source [Model Context Protocol](https://modelcontextprotocol.io) server and reference client that gives AI assistants (Claude Desktop, Claude Code, agent platforms) fully local capabilities for German/EU electronic invoicing: parse, validate, audit, explain, generate and convert **XRechnung** and **ZUGFeRD/Factur-X** invoices — with the *official* KoSIT / EN 16931 rule sets, and no data ever leaving your machine.

**Status:** v0.1.0 + Phase 2 in progress — `parse_invoice`, `validate_invoice`, `explain_rule` (verified in Claude Desktop, [report](docs/VERIFICATION-v0.1.md)) plus Phase 2 tools `audit_invoice` (with the `KONTOR-PLAUS-*` plausibility layer), `generate_invoice` (XRechnung 3.0 UBL) `convert_invoice` (UBL ↔ CII, ZUGFeRD extract, HTML preview) `check_obligations` (German mandate timeline with sources), `list_capabilities`, reference resources (rule index, code lists, cheatsheet) and the three prompts; ZUGFeRD PDF generation (Task 2.7) next — see [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

![Kontor MCP in Claude Desktop: validate a broken XRechnung, parse a ZUGFeRD PDF, explain BR-DE-18](docs/media/v0.1-desktop-demo.gif)

*Claude Desktop with the `kontor` server: validate → BR-DE-15 (missing Leitweg-ID) with fix hint · parse a ZUGFeRD PDF · explain BR-DE-18. [MP4](docs/media/v0.1-desktop-demo.mp4)*

## Packages

| Package | Purpose |
|---|---|
| `@kontor-mcp/core` | MCP-free library: detect, parse, validate, generate, convert |
| `@kontor-mcp/rules` | Bundled standards artifacts (XSDs, compiled Schematron, codelists) + rule knowledge base |
| `@kontor-mcp/server` | MCP server (stdio + Streamable HTTP) exposing tools, resources, prompts |
| `@kontor-mcp/client` | `kontor-agent` — reference MCP client CLI with an Anthropic agent loop |

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm lint
```

Requires Node ≥ 20 and pnpm 10 (`corepack enable` picks the pinned version from `packageManager`).

## Docs

- [Product Requirements](docs/PRD.md)
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)
- [Decision log](docs/DECISIONS.md)
- [v0.1 Claude Desktop verification](docs/VERIFICATION-v0.1.md)

## License

Apache-2.0 — see [LICENSE](LICENSE).
