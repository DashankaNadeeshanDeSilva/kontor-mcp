# Contributing

Thanks for helping make e-invoicing boring. Please read [`CLAUDE.md`](CLAUDE.md) (the project rules — they apply to humans too) and [`docs/DECISIONS.md`](docs/DECISIONS.md) before changing behaviour.

## Setup

```sh
corepack enable          # picks the pinned pnpm from package.json
pnpm install
pnpm build
pnpm -r test && pnpm lint
```

Node ≥ 20. Java 17+ is only needed for the development-time oracles (`pnpm artifacts` fetches them: KoSIT validator, Mustang CLI); veraPDF (`brew install verapdf`) for `pnpm check:zugferd`.

## Ground rules

- **Tests first.** Write the failing test, then the code. `pnpm -r test` and `pnpm lint` must be green before every commit; CI runs on Ubuntu, macOS and Windows.
- **Money math with `decimal.js` only.** Never `number` arithmetic on amounts.
- **No runtime network calls, no Java at runtime, XXE disabled on every XML parse.**
- **Official rules keep their ids** (`BR-*`, `BR-DE-*`); Kontor's own checks are `KONTOR-*`.
- **Touching `packages/rules` artefacts** (rule sets, code lists, legal facts, fonts, ICC): update `PROVENANCE.md` with source, version, date, licence and sha256; the tests assert the checksums.
- **Every MCP tool** validates input and output with Zod, returns `structuredContent` plus a text summary, and reports findings in the `Finding` shape (PRD §5.2).
- **Paths from `import.meta.url`** go through `fileURLToPath` (Windows); golden files are LF (`.gitattributes`).
- **Conventional commits**; a user-visible change gets a `CHANGELOG.md` line; an architectural choice gets a `D-nnn` entry in `docs/DECISIONS.md`.
- Case-insensitive filesystems: never create paths that differ only by case.

## Pull requests

1. One topic per PR, with the motivating test.
2. Describe what the oracle says if the change touches validation (`pnpm oracle --diff …`) or generation (`pnpm check:zugferd`).
3. Do not add `Co-Authored-By` trailers on behalf of tools.

## Legal facts

`packages/rules/legal/timeline.json` carries every mandate parameter with its primary source and a verbatim quote. Change the JSON and `lastVerified`, not the code, and cite the primary text (gesetze-im-internet.de, BMF).
