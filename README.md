# Kontor MCP

> **The sovereign e-invoice toolkit for AI agents.** Official XRechnung / EN 16931 validation, ZUGFeRD in and out, 100% offline, zero API keys.

Kontor MCP is an open-source [Model Context Protocol](https://modelcontextprotocol.io) server and reference client that gives AI assistants (Claude Desktop, Claude Code, agent platforms) fully local capabilities for German/EU electronic invoicing: parse, validate, audit, explain, generate and convert **XRechnung** and **ZUGFeRD/Factur-X** invoices — with the *official* KoSIT / EN 16931 rule sets, and no data ever leaving your machine.

**Status:** Phase 0 (de-risk & foundation) — not yet usable. See [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

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

Requires Node ≥ 20 and pnpm (`corepack enable`).

## Docs

- [Product Requirements](docs/PRD.md)
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)
- [Decision log](docs/DECISIONS.md)

## License

Apache-2.0 — see [LICENSE](LICENSE).
