# Security policy

Kontor MCP processes invoices — documents that carry personal and business data. The threat model and hardening measures are specified in [`docs/PRD.md`](docs/PRD.md) §6 (NFR-2, NFR-5, NFR-6).

## What is in place

- **No network at runtime.** Nothing is fetched, nothing is sent; all standards artefacts are bundled and checksummed ([`packages/rules/PROVENANCE.md`](packages/rules/PROVENANCE.md)).
- **XML hardening on every parse:** DTD processing and external entity resolution disabled (XXE), entity-expansion and size limits.
- **PDF hardening:** embedded files are treated as untrusted bytes — never executed, decompression capped, encrypted PDFs rejected; the extracted XML goes through the same hardened loader.
- **Path hygiene:** `file_path` must be absolute, is resolved and size-capped (`KONTOR_MAX_FILE_MB`, default 20 MB); `output_path` never overwrites without `overwrite=true`; no shell interpolation anywhere.
- **Stateless, no payload logging:** invoice contents are not logged unless `KONTOR_LOG_PAYLOADS` is set explicitly for debugging.
- **HTTP transport (`KONTOR_TRANSPORT=http`):** binds to `127.0.0.1` by default with Host-header validation against DNS rebinding (SDK middleware); Bearer token required (`KONTOR_AUTH_TOKEN`, ≥ 16 characters, `crypto.timingSafeEqual`); browser `Origin` restricted to localhost plus `KONTOR_ALLOWED_ORIGINS`; JSON body capped in line with `KONTOR_MAX_FILE_MB`; sessions live only in memory and die with the process. The server speaks plain HTTP — **TLS termination is the deployer's reverse proxy's job**; never expose the port directly on a public interface. `KONTOR_ALLOW_NO_AUTH=1` is refused for non-loopback binds. Behind a reverse proxy set `KONTOR_ALLOWED_HOSTS` so the Host header is still validated. Sessions are capped (`KONTOR_MAX_SESSIONS`, 503 beyond) and idle ones are closed (`KONTOR_SESSION_IDLE_MINUTES`).
- **Container:** multi-stage image on `node:22-alpine`, runs as the unprivileged `node` user, no shell tooling beyond the base image, refuses to start without a token; the compose example adds `read_only`, `cap_drop: ALL` and `no-new-privileges`.
- **Supply chain:** exact dependency versions, `pnpm install --frozen-lockfile` in CI, no native compilation.

## How we prove it

| Claim | Proof (runs in CI on every push) |
|---|---|
| No outbound network, ever | `packages/core/test/sovereignty.test.ts` patches every outbound path Node has (sockets, TLS, DNS, http/https clients, `fetch`) to record-and-throw, then runs validate/audit/generate (incl. PDF/A-3)/convert/obligations; `packages/server/test/sovereignty.test.ts` does the same for **every** MCP tool, resource and prompt; a static scan asserts no runtime source imports a network module except the inbound HTTP host. The Docker job additionally runs a full `audit_invoice` in a container started with `--network none`. |
| XML hardening | `packages/core/test/xml-load.test.ts` + `packages/server/test/security.test.ts`: external-entity XXE, parameter-entity XXE, billion laughs, 5 000-level nesting, oversized input — all rejected as `KONTOR-XML-*` findings/tool errors within bounded time. |
| Path hygiene | traversal, relative paths, directories, special files (`/dev/null`), wrong extensions, a `.xml` symlink to a secret — rejected, and the error text never echoes file contents or a stack trace. `output_path`: never overwrites without `overwrite=true`, never a directory or a wrong extension; parent directories are created (same privilege as writing the file). |
| PDF hardening | encrypted PDF, fake PDF, garbage → clean errors; embedded streams are inflated with a hard cap (`KONTOR-PDF-DECOMPRESS-SIZE`). |
| Supply chain | `pnpm audit --prod --audit-level high` and a generated licence inventory (`docs/LICENSES.md`, `pnpm licenses:check`) — an unreviewed or non-allow-listed licence fails the build. |

## Supported versions

The latest tagged release and `main`.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use GitHub's private vulnerability reporting on this repository ("Security" → "Report a vulnerability"). You will get an acknowledgement within 72 hours and a fix or mitigation plan within 14 days for confirmed issues. Credit is given in the changelog unless you prefer otherwise.

## Scope notes

Findings and verdicts are formal/technical checks against published standards, not tax or legal advice (NFR-7). A crafted invoice that produces a wrong *verdict* is a correctness bug, not a security issue — report it as a normal issue with the file attached.
