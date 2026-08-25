# Security policy

Kontor MCP processes invoices — documents that carry personal and business data. The threat model and hardening measures are specified in [`docs/PRD.md`](docs/PRD.md) §6 (NFR-2, NFR-5, NFR-6).

## What is in place

- **No network at runtime.** Nothing is fetched, nothing is sent; all standards artefacts are bundled and checksummed ([`packages/rules/PROVENANCE.md`](packages/rules/PROVENANCE.md)).
- **XML hardening on every parse:** DTD processing and external entity resolution disabled (XXE), entity-expansion and size limits.
- **PDF hardening:** embedded files are treated as untrusted bytes — never executed, decompression capped, encrypted PDFs rejected; the extracted XML goes through the same hardened loader.
- **Path hygiene:** `file_path` must be absolute, is resolved and size-capped (`KONTOR_MAX_FILE_MB`, default 20 MB); `output_path` never overwrites without `overwrite=true`; no shell interpolation anywhere.
- **Stateless, no payload logging:** invoice contents are not logged unless `KONTOR_LOG_PAYLOADS` is set explicitly for debugging.
- **Supply chain:** exact dependency versions, `pnpm install --frozen-lockfile` in CI, no native compilation.

## Supported versions

The latest tagged release and `main`.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use GitHub's private vulnerability reporting on this repository ("Security" → "Report a vulnerability"). You will get an acknowledgement within 72 hours and a fix or mitigation plan within 14 days for confirmed issues. Credit is given in the changelog unless you prefer otherwise.

## Scope notes

Findings and verdicts are formal/technical checks against published standards, not tax or legal advice (NFR-7). A crafted invoice that produces a wrong *verdict* is a correctness bug, not a security issue — report it as a normal issue with the file attached.
