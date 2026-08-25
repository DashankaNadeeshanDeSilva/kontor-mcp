# Decision Log (lightweight ADRs)

Dated entries for every PRD assumption confirmed/changed and every library chosen. Newest at the bottom.

## 2026-08-25 — Task 0.1 kickoff decisions (Dashanka)

- **D-001 Name / npm scope:** `@kontor-mcp/*` (not `@kontor/*`). GitHub repo: `kontor-mcp`. Resolves PRD O1. Availability check on npm still pending (Task 0.5).
- **D-002 License:** Apache-2.0. Resolves PRD O2.
- **D-003 Repo visibility:** public from day one. Resolves PRD O4.
- **D-004 Lint/format:** Biome 2.x (single tool). Per plan §1.
- **D-005 TypeScript version:** pinned `^5.9` although `typescript@7.0.x` is the current npm `latest` (native Go compiler port). Rationale: 7.x is very fresh and tooling support (vitest/tsc -b/declaration emit) is not yet proven for this stack; revisit once the ecosystem settles. Tracked as an upgrade candidate.
- **D-006 Verified dependency versions (npm, 2026-08-25):** `@modelcontextprotocol/sdk` 1.30.0 (peer `zod ^3.25 || ^4.0`, Node >= 18), `zod` 4.4.3, `saxon-js` 2.7.0, `xmllint-wasm` 5.3.0, `@xmldom/xmldom` 0.9.12, `xpath` 0.0.34, `pdf-lib` 1.17.1, `decimal.js` 10.6.0, `ibantools` 4.5.4, `express` 5.2.1, `commander` 15.0.0, `@anthropic-ai/sdk` 0.120.0, `picocolors` 1.1.1, `vitest` 4.1.11, `@biomejs/biome` 2.5.10, `tsx` 4.23.12. Runtime deps are added per task, not up front.
- **D-007 Module system:** ESM only (`"type": "module"`, `NodeNext`), TS project references (`tsc -b`), `tsconfig.base.json` with strict extras (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **D-008 Local toolchain note:** Java is not installed on the dev machine. Needed for Task 0.3 (SchXslt compile) and 0.4 (KoSIT oracle) — install JDK 17+ (e.g. Temurin) before starting the spike. pnpm installed via `corepack enable --install-directory ~/.local/bin` (global npm prefix is root-owned).
- **D-009 pnpm version pinned to 10.x (not 11):** first CI run failed on all Node 20 legs because pnpm 11 requires Node ≥ 22.13 (`ERR_UNKNOWN_BUILTIN_MODULE`). PRD NFR-4 mandates Node ≥ 20, so `packageManager` is `pnpm@10.34.5` (Node ≥ 18.12). Revisit when Node 20 leaves the support matrix (EOL April 2026 upstream; we keep it for one more cycle for Claude Desktop users on older Node).
