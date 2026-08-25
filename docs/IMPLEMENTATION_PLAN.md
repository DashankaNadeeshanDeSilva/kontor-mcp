# Kontor MCP — Implementation Plan

**Companion to:** `PRD.md` (source of truth for scope; this document is the source of truth for sequencing and execution).
**Audience:** Dashanka + Claude Code. Written so that each phase can be executed as a series of well-scoped Claude Code sessions.
**Rule of engagement:** riskiest-first. Nothing beyond Phase 0 starts until the Phase 0 exit criteria are met.

---

## 0. How to work with this plan (Claude Code usage notes)

- Work **phase by phase, task by task**. Each task lists: goal, steps, and **acceptance criteria (AC)**. A task is done only when its ACs pass (usually: a test exists and is green).
- Keep a running `docs/DECISIONS.md` (lightweight ADRs): every time an assumption from the PRD is confirmed, changed, or a library is chosen, add a dated entry. This is also interview gold.
- **Verify-then-code for external facts:** exact package names/APIs (MCP SDK, Saxon-JS, xmllint-wasm, pdf-lib embedded-file APIs), current XRechnung version, artifact repo layouts, and licenses must be checked against the live sources at build time — do not trust this document or training data for version numbers. Record findings in `DECISIONS.md` / `packages/rules/PROVENANCE.md`.
- Suggested `CLAUDE.md` for the repo root (create in Phase 0.1):

```markdown
# Kontor MCP — project context for Claude Code
- Read docs/PRD.md (scope, tool specs §5.5, NFRs §6) and docs/IMPLEMENTATION_PLAN.md (current phase) before coding.
- Monorepo: pnpm workspaces. Node >= 20, TypeScript strict. Test runner: vitest. Run `pnpm -r test` before claiming done.
- Money math: decimal.js only — never float. XML parsing: XXE disabled everywhere (see NFR-5).
- Never introduce a runtime network call. The no-network test (packages/core/test/sovereignty.test.ts) must always pass.
- All MCP tool inputs/outputs: Zod schemas; tools return structuredContent + text summary; findings use the Finding interface (PRD §5.2).
- Rule namespaces: official rules keep their IDs (BR-*, BR-DE-*); our own checks are KONTOR-PLAUS-*.
- When touching packages/rules artifacts: update PROVENANCE.md (source, version, date, license, sha256).
- Conventional commits. Update CHANGELOG.md per user-visible change.
```

- **Session hygiene:** one task (or a small cluster) per Claude Code session; start each session by pointing at the task ID in this file.

---

## 1. Tech stack (with rationale; confirm exact versions at Phase-0 time)

| Concern | Choice | Rationale / fallback |
|---|---|---|
| Language / runtime | TypeScript 5.x, Node ≥ 20 | npm-native distribution; showcase value |
| Monorepo | pnpm workspaces (+ optional turborepo later) | simple, fast |
| MCP | `@modelcontextprotocol/sdk` (TS, latest stable) | official SDK; server + client + both transports |
| Schema/validation of tool IO | zod | SDK-native |
| XSLT 3.0 runtime (Schematron exec) | **Saxon-JS 2 (HE)** | pure JS; runs compiled SEF stylesheets; **the Phase-0 spike subject** |
| Schematron → XSLT compile (build-time) | **SchXslt** (Java) or Schematron's reference skeleton | build-time only; output committed as artifacts |
| XSLT → SEF compile (build-time) | Saxon (xslt3 npm tool / Saxon-EE if needed for compile) | verify Saxon-JS SEF-compilation licensing/tooling in spike |
| XSD validation | `xmllint-wasm` (default) | no native deps; fallback `libxmljs2` behind same interface if perf fails |
| XML parse for model extraction | `@xmldom/xmldom` + `xpath` (namespace-aware) | precise, boring, safe; disable DTDs |
| PDF embedded-file extraction | `pdf-lib` (verify embedded-files read API; fallback: minimal PDF object-stream walker or `pdf.js`) | ZUGFeRD extraction |
| ZUGFeRD PDF/A-3 **generation** | evaluate `node-zugferd` first; fallback: custom pdf-lib + XMP templates | Phase-0 evaluation (Task 0.6); v1.0 requirement per PRD T5 |
| PDF/A-3 conformance oracle | **veraPDF** (CI only, Java) | never a runtime dependency |
| Money | `decimal.js` | NFR |
| IBAN/BIC | `ibantools` | Layer 3 |
| HTTP transport host | express | SDK examples align |
| CLI client | `commander` + `@anthropic-ai/sdk` + `picocolors` | small, readable |
| Tests | vitest + coverage | monorepo-friendly |
| Lint/format | Biome (or ESLint+Prettier) | one tool, fast |
| CI | GitHub Actions | oracle job needs Java 17+ container |
| Container | Docker multi-stage (node:20-slim), non-root | HTTP mode deployment |

---

## 2. Phase 0 — De-risk & Foundation (Days 1–3)

**Purpose:** kill or confirm the one make-or-break unknown (pure-TS official Schematron execution), settle artifact licensing, and stand up the skeleton. **Do not build tools yet.**

### Task 0.1 — Repo skeleton & tooling
- Init pnpm monorepo per PRD §5.1 layout; TS strict configs; vitest wired root-level (`pnpm -r test`); Biome; `.editorconfig`; MIT/Apache LICENSE per O2; root `CLAUDE.md` (above); empty `docs/DECISIONS.md`; CI workflow running lint+test on push (matrix: ubuntu, macos, windows; Node 20/22).
- **AC:** `pnpm -r build && pnpm -r test` green in CI on all matrix legs (with placeholder tests).

### Task 0.2 — Artifact acquisition & provenance audit
- Script `tools/fetch-artifacts.ts`: download pinned releases of — EN 16931 Schematron (UBL + CII), XRechnung Schematron + validator configuration, XRechnung test suite, UBL 2.1 XSDs, CII D16B XSDs, KoSIT validator JAR (CI only), ZUGFeRD sample invoices. Record sha256 + license for each in `packages/rules/PROVENANCE.md`.
- **License gate:** for each artifact decide bundle vs fetch-at-install (PRD §7). Flag any blocker immediately.
- **AC:** one command fetches everything reproducibly; PROVENANCE.md complete; license decision table filled in DECISIONS.md.

### Task 0.3 — **THE SPIKE:** Schematron→XSLT→Saxon-JS pipeline
- Steps: compile EN 16931 UBL Schematron and XRechnung Schematron to XSLT (SchXslt, build script `tools/compile-schematron.ts` shelling to Java); compile XSLT → SEF; execute with Saxon-JS against (a) one known-valid test-suite invoice, (b) one known-invalid one; parse SVRL output into `Finding[]`.
- Measure: cold init time, warm per-invoice time, memory.
- Compare findings against KoSIT validator JAR run on the same two files.
- **AC (exit gate for the whole project’s architecture):**
  1. SVRL findings produced for both files;
  2. verdicts match the KoSIT oracle;
  3. warm validation < 2 s, cold < 5 s (S3) on a laptop;
  4. written spike report in DECISIONS.md (incl. any XSLT features that needed workarounds).
- **If the spike fails after 2 focused days:** trigger fallback ladder (PRD R1): alternative compile targets → JS Schematron runners → **D8 dual-engine** (make the Java sidecar the temporary default, keep pure-TS as tracked issue). Update PRD D1/D8 status and proceed — do not stall.

### Task 0.4 — Oracle harness (mini version)
- `tools/oracle.ts`: run KoSIT validator JAR over a file/dir, normalize its report to `Finding[]`-comparable form; diff utility (verdict + rule-ID set comparison).
- **AC:** `pnpm oracle fixtures/some.xml` prints normalized findings; diff mode works on the two spike files.

### Task 0.5 — Naming & publish preflight
- Check npm scope/package and GitHub name availability for O1; reserve; final call recorded (with Dashanka) in DECISIONS.md.
- **AC:** names reserved; README stub with one-liner pushed; repo public (O4).

### Task 0.6 — ZUGFeRD PDF-generation path evaluation (mini-spike, ~half a day)
- ZUGFeRD **generation** is a v1.0 requirement (PRD T5/O5), so choose the path early: (a) evaluate `node-zugferd` (license, maintenance, profile coverage, PDF/A-3 + XMP output quality) by generating one sample and checking it with **veraPDF** + extracting/validating its embedded XML with the oracle; (b) if inadequate, prototype the custom path: pdf-lib attachment embedding + `AFRelationship` + official Factur-X XMP extension-schema template.
- Also install/wire veraPDF into the CI toolbox (`tools/verapdf.ts` wrapper) alongside the KoSIT oracle.
- **AC:** decision (library vs custom) recorded in DECISIONS.md with the veraPDF report of the evaluation sample attached under `docs/spikes/`; veraPDF runnable via one command.

**Phase 0 exit criteria:** spike AC met (or fallback decision recorded), ZUGFeRD-generation path chosen (0.6), artifacts + licenses settled, CI skeleton green, names reserved.

---

## 3. Phase 1 — Core Library + Minimal Server (Week 1)

**Purpose:** `@kontor/core` parse+validate working end-to-end; minimal MCP server usable in Claude Desktop. Ends at internal **v0.1**.

### Task 1.1 — Format detection & safe XML loading (`core/src/detect`, `core/src/xml`)
- Hardened XML loader (XXE off, entity/depth/size limits — NFR-5) used by *all* code paths; container sniffing (PDF magic bytes vs XML); syntax detection (root element + namespaces → UBL Invoice/CreditNote vs CII CrossIndustryInvoice); CIUS/profile detection from CustomizationID / guideline parameter; XRechnung version extraction.
- **AC:** detection unit tests over ≥ 12 fixtures (UBL, CII, XRechnung both syntaxes, ZUGFeRD profiles, garbage input, XXE attack fixture rejected).

### Task 1.2 — ZUGFeRD PDF extraction (`core/src/pdf`)
- Extract embedded XML (names: `factur-x.xml`, `zugferd-invoice.xml`, `xrechnung.xml`; fall back to scanning embedded files for CII root); handle: no attachment (clear NG3 error), multiple attachments, encrypted PDF (error), size caps.
- **AC:** extraction works on ≥ 5 real ZUGFeRD samples across profiles; edge-case tests for the 4 failure modes.

### Task 1.3 — Semantic model + parser (`core/src/model`, `core/src/parse`)
- `InvoiceModel` TS types + Zod mirror (PRD §5.3) covering EN 16931 core BT/BG set; UBL→model and CII→model extractors (XPath maps kept as data tables, not code spaghetti); model→JSON with BT annotations.
- **AC:** parse both syntaxes of the same semantic invoice from the test suite → deep-equal models (minus syntax-specific fringe, documented); ≥ 90% BT coverage measured against a checklist file `docs/BT-COVERAGE.md`.

### Task 1.4 — Validation pipeline (`core/src/validate`)
- Layer 1 (XSD via xmllint-wasm) + Layer 2 (Saxon-JS from spike, engine warm-cached) + merger to `Finding[]`; rule-set auto-selection by detected format; SVRL→Finding normalization (severity mapping, XPath, rule ID).
- **AC:** full pipeline over the *entire official XRechnung test suite*; verdict parity with oracle ≥ 99% (target 100%; every diff gets an issue + entry in `docs/CONFORMANCE.md`); runtime within S3 budget.

### Task 1.5 — Rule knowledge base v1 (`rules/src/kb`)
- Generate baseline entries for all rules from Schematron message text (script); hand-curate top-40 (all BR-DE + top arithmetic/VAT rules) with DE+EN explanation + fixHint + related BTs (PRD T4). Store as JSON, typed accessor.
- **AC:** `explainRule("BR-DE-15")` returns curated DE+EN entry; unknown ID → suggestion behavior tested; KB lint (script) verifies every BR-DE rule has an entry.

### Task 1.6 — Minimal MCP server (`server`): stdio + T1/T2/T4 + samples resource
- `McpServer` with `parse_invoice`, `validate_invoice`, `explain_rule`; annotations, structuredContent+outputSchema, file_path/base64 dual input, size caps, lang param; `kontor://samples/*` resources; MCP logging.
- **AC:** MCP Inspector session exercises all three tools; Claude Desktop config documented and manually verified: dropping a sample invoice + "is this valid?" produces a correct, readable answer. Tag **v0.1**; capture first screen recording.

**Phase 1 exit:** v0.1 demo works in Claude Desktop; conformance run recorded.

> **Status (2026-08-25): Phase 1 complete.** Tag `v0.1.0`; conformance 89/89; Claude Desktop 1.34493.1 manual verification S1–S6 passed and recorded in [`VERIFICATION-v0.1.md`](VERIFICATION-v0.1.md) (demo: `docs/media/v0.1-desktop-demo.{mp4,gif}`). Open findings F5–F10 carried into Phase 2.

---

## 4. Phase 2 — Workflow Depth + Generation (Week 2)

**Purpose:** the parts that make it a *product*, not a validator wrapper. Ends at public **v0.9**.

### Task 2.1 — Plausibility layer (`core/src/plausibility`)
- Implement all Layer-3 checks (PRD §5.2): decimal recompute of BR-CO totals, IBAN/BIC, USt-IdNr & Steuernummer formats, Leitweg-ID check digit (ISO 7064 MOD 97-10), VAT-rate/category consistency, date sanity, duplicate check via caller-provided list. Namespace `KONTOR-PLAUS-*`; each check individually unit-tested with crafted fixtures (e.g. off-by-€0.02 VAT fixture).
- **AC:** ≥ 15 targeted fixtures each triggering exactly their intended finding and nothing else on otherwise-valid invoices.

### Task 2.2 — `audit_invoice` (T3)
- Compose parse+validate+plausibility; build structured audit report (header facts, verdict, grouped findings with KB explanations, recommendation accept/reject/review with rationale); compact text rendering (DE/EN).
- **AC:** golden-file tests: 3 scenario fixtures (clean invoice / broken-Leitweg+VAT-math / ZUGFeRD PDF) produce stable structured reports; manual Claude Desktop run reads like something an AP clerk could act on.

### Task 2.3 — `generate_invoice` (T5)
- `InvoiceInput` Zod schema (design for LLM ergonomics: flat where possible, enums for codes, currency default EUR); decimal-safe derivation of all totals/tax breakdown; UBL 2.1 serializer with pinned XRechnung CustomizationID; internal validate loop + deterministic auto-fix pass; fail-honest contract (PRD D5); optional `output_path` write.
- **AC:** property-style test: N=50 randomized valid inputs → generated XML all pass full validation (oracle-checked in CI batch); invalid input (e.g. missing payment details for XRechnung) → `valid:false` with the right BR-DE findings; Leitweg-ID path covered.

### Task 2.4 — `convert_invoice` (T6) + HTML preview
- `extract-xml`; UBL↔CII via model pivot with post-validate + lossReport; `html-preview` (clean, self-contained HTML rendering of the model — no external assets).
- **AC:** round-trip UBL→CII→UBL on test-suite files preserves semantic model (documented exceptions); preview renders all sample invoices; lossReport populated on an EXTENDED-profile fixture.

### Task 2.5 — `check_obligations` (T7) + legal data verification
- Encode the mandate decision tree as data (`rules/src/legal/timeline.json`) with `sources[]` + `lastVerified`; **verify the legal parameters against authoritative web sources now and record citations**; non-advice disclaimer in every response (NFR-7).
- **AC:** table-driven tests over ≥ 10 scenarios (freelancer B2G, small B2B receiver 2026, >800k issuer 2027, …); each answer carries sources + lastVerified.

### Task 2.6 — Prompts + remaining resources + `list_capabilities` (T8)
- Implement PRD §5.6 resources (codelists, cheatsheet, KB index) and §5.7 prompts; `list_capabilities` reporting bundled versions.
- **AC:** Inspector shows all resources/prompts; `draft-supplier-rejection` prompt + audit findings produces a sendable German email draft in a manual Claude Desktop run.

### Task 2.7 — ZUGFeRD PDF/A-3 generation (`generate_invoice` target `zugferd-pdf`)
- Implement per PRD T5 using the path chosen in Task 0.6: semantic model → CII XML (profile-aware: EN16931 default; BASIC/EXTENDED per input) → visual PDF rendered from the `html-preview` layout (embed fonts; keep the layout deliberately simple and PDF/A-safe) → PDF/A-3 assembly with embedded `factur-x.xml` (correct `AFRelationship`, MIME type) + Factur-X/ZUGFeRD **XMP extension-schema metadata** matching the profile.
- Wire into the fail-honest validate loop: embedded XML validated via the T2 pipeline before returning; `valid` flag reflects it.
- CI: every generated fixture goes through **veraPDF** (PDF/A-3 conformance) *and* round-trips through Task 1.2 extraction + full validation ("what we generate, we can read and it passes").
- **AC:** (1) generated EN16931-profile ZUGFeRD sample passes veraPDF with zero PDF/A-3 violations; (2) embedded XML passes the full validation pipeline and the KoSIT oracle where applicable; (3) round-trip test green; (4) at least one external check of a generated sample against a second validator (e.g. a ZUGFeRD community validator) documented in `docs/CONFORMANCE.md`; (5) profile parameter covered by tests for EN16931 + BASIC.

### Task 2.8 — README v1 + repo public polish
- Hero, sovereignty statement + "how we prove it", architecture Mermaid diagram, install (Claude Desktop/Code snippets), tool reference (generated from schemas if cheap), draft conformance table, FAQ, SECURITY.md, CONTRIBUTING.md.
- **AC:** a cold reader (your friend?) can install and audit a sample invoice in < 5 minutes following only the README. Tag **v0.9**.

**Phase 2 exit:** full tool surface incl. ZUGFeRD generation; v0.9 public; conformance table drafted.

---

## 5. Phase 3 — Protocol Completeness, Client, Hardening, Launch (Week 3)

**Purpose:** both protocol halves, ops-grade polish, publish. Ends at **v1.0**.

### Task 3.1 — Streamable HTTP transport + auth
- Express host per SDK patterns: `/mcp` endpoint, session management, Origin validation, `127.0.0.1` default bind, Bearer auth (`KONTOR_AUTH_TOKEN`, constant-time compare), graceful shutdown; config surface per PRD §5.9; document security posture (and that TLS termination is the deployer's reverse proxy's job).
- **AC:** Inspector connects over HTTP with token; wrong/missing token → 401 tests; origin-spoof test rejected; stdio path unaffected.

### Task 3.2 — Docker
- Multi-stage build, non-root, amd64+arm64, healthcheck; compose example; image size sanity (< ~300 MB).
- **AC:** `docker run … kontor/server` + Inspector-over-HTTP round trip green in CI (smoke job).

### Task 3.3 — `kontor-agent` client CLI
- `tools` (introspection), `audit <file>` (direct tool call, no LLM), `chat` (Anthropic agent loop bridging MCP tools; readable tool-call trace; streaming); connects `--stdio` (spawn) or `--url/--token`.
- **AC:** demo transcript committed under `docs/demo/`: `chat` session auditing the broken ZUGFeRD sample end-to-end over both transports; `audit` works with no API key.

### Task 3.4 — Sovereignty & security test pass
- No-network test (NFR-2): run whole tool suite with network monitored/blocked (e.g. undici/net instrumentation or a jail), fail on any connection; XXE/billion-laughs/oversize/path-traversal test fixtures; dependency audit + `pnpm licenses` report.
- **AC:** `sovereignty.test.ts` + security suite green and wired into CI as required checks.

### Task 3.5 — Conformance gate & CONFORMANCE.md final
- CI job: full test-suite run vs oracle on every PR touching core/rules (cached artifacts; Java only in this job); publish generated conformance table into `docs/CONFORMANCE.md` + README badge; S1 thresholds enforced (fail CI below them).
- **AC:** gate red/green demonstrably works (introduce a deliberate regression on a branch to prove it fails).

### Task 3.6 — Release v1.0 + listings + demo assets
- npm publish (`@kontor/server`, `@kontor/core`, `@kontor/client`) with provenance; GitHub release + changelog; submit to mcpmarket.com, Smithery, official MCP registry (follow each platform's current process); record the **60-second demo GIF** (script below); LinkedIn/blog post draft; AI Tinkerers Bremen demo slot.
- **Demo GIF script (PRD G6):** Claude Desktop → drop `broken-zugferd.pdf` → "Prüfe diese Rechnung" → audit shows BR-DE-15 (Leitweg-ID missing) + VAT €0.02 mismatch + invalid IBAN, in German → "Entwirf die Antwort an den Lieferanten" → email draft → "Erzeuge die korrigierte XRechnung" → generate → re-validate → green. Caption: *"100% local. No API keys. Official KoSIT-grade rules."*
- **AC:** packages installable via `npx` from a clean machine; at least one directory listing live; GIF embedded in README.

**Phase 3 exit = v1.0 shipped.**

---

## 6. Phase 4 (post-launch, optional) — v1.1 candidates
Ordered by showcase value: Peppol BIS 3.0 rule pack → additional ZUGFeRD visual templates + EXTENDED-profile depth → OAuth resource-server auth → batch tools (`audit_folder`) → n8n node wrapper (distribution hack: the n8n community thread shows demand).

---

## 7. Test strategy (cross-phase summary)

- **Unit:** every core module; crafted fixtures per rule/check.
- **Conformance:** official XRechnung test suite vs Java-oracle diff (the flagship credibility artifact); **generated ZUGFeRD PDFs vs veraPDF PDF/A-3 conformance + extraction round-trip (2.7)**.
- **Property-ish:** randomized generation inputs → must validate (2.3; extend a subset to `zugferd-pdf` target in 2.7).
- **Adversarial:** XXE, entity bombs, oversized files, malformed PDFs, path traversal, wrong tokens/origins.
- **Sovereignty:** no-network harness.
- **E2E:** MCP Inspector scripted flows; client-CLI transcripts over both transports; manual Claude Desktop checklist per release (`docs/RELEASE-CHECKLIST.md`).
- **Matrix:** ubuntu/macos/windows × Node 20/22 (oracle job: ubuntu+Java only).

## 8. Timeline at a glance (aggressive but honest; ~3–4 wks part-time)

| Phase | Duration | Tag | Hard gate |
|---|---|---|---|
| 0 De-risk | 3 days | — | Spike AC / fallback decision + ZUGFeRD-gen path chosen |
| 1 Core + minimal server | ~1 week | v0.1 | Claude Desktop demo + conformance run |
| 2 Workflow + generation (incl. ZUGFeRD PDF) | ~1.5 weeks | v0.9 | Full tool surface incl. `zugferd-pdf`, README v1, repo public |
| 3 Transport/client/launch | ~1 week | v1.0 | CI conformance + veraPDF gates, npm + listings, GIF |

Buffer honestly: KB curation (1.5), ZUGFeRD PDF/A-3 conformance (2.7 — the classic underestimation trap, see PRD R9), and README/demo polish (2.8, 3.6) always take longer than expected — the latter two are also the parts reviewers actually see, so never cut them; cut 2.4 conversion depth first if squeezed, and if 2.7 threatens the launch date, ship `zugferd-pdf` behind an experimental flag rather than slipping v1.0 (PRD R9).

---

*Where this plan and the PRD disagree: PRD wins on scope, this plan wins on sequencing. Update both when decisions change (log in `docs/DECISIONS.md`).*
