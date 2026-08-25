# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow semver.

## [Unreleased]

### Added
- `@kontor-mcp/core`: Layer-3 plausibility checks (`runPlausibility`, namespace `KONTOR-PLAUS-*`, 22 rule ids with DE+EN explanation and fix hint): decimal recomputation of line nets, document totals and VAT breakdown (cent-exact where the official BR-CO-17 tolerates ±1), DE VAT-rate and category/rate consistency, IBAN mod-97 and BIC, EU VAT-ID formats, German Steuernummer, Leitweg-ID structure + ISO 7064 MOD 97-10 check digits, date sanity (future / stale / due-before-issue / inverted periods) and caller-provided duplicate list. Runs as third layer of `validateInvoice` (`layers.plausibility`, `skipLayers: ["plausibility"]`, `plausibility: { knownInvoiceNumbers, today, futureToleranceDays }`); never changes the official verdict (Task 2.1).
- `convert_invoice` (T6): `extract-xml` (ZUGFeRD/Factur-X PDF → embedded XML), `xrechnung-ubl` and `cii` via the EN 16931 semantic model with post-conversion validation and a mechanical `lossReport` (`dropped` / `changed` / `added` / `profile` entries with BT ids, DE/EN), `html-preview` (self-contained, script-free, DE/EN). Core: `modelToUbl` (Invoice + CreditNote), `modelToCii`, `convertInvoice`, `diffModels`, `renderHtmlPreview`; round-trip test over the entire official XRechnung test suite with three documented exceptions; preview golden (Task 2.4).
- `generate_invoice` (T5, UBL target): structured `InvoiceInput` → XRechnung 3.0 (UBL 2.1) with decimal-safe line nets, VAT breakdown and totals, internal validation (fail-honest `valid` / `plausible`, findings with KB explanations), deterministic auto-fixes (identifier normalisation, S/0 % → Z) reported per code, schema-boundary checks citing BR-CO-25 / BR-DE-27 / BR-E-10, optional `output_path` with overwrite protection. Core: `generateInvoice`, `InvoiceInputSchema`, `deriveAmounts`; 50-seed property test + golden XML (Task 2.3).
- `audit_invoice` (T3): one-call audit — parse + XSD + official rules + plausibility → header facts (totals, BG-23 VAT breakdown, Leitweg-ID, IBANs, PDF provenance), verdict, grouped findings with KB explanations, `accept` / `review` / `reject` recommendation with DE/EN rationale, compact DE/EN text; `known_invoice_numbers` for stateless duplicate detection. Core: `auditInvoice`, `renderAuditText`, `enrichFinding`, `DISCLAIMER`; golden-file tests for clean / broken-Leitweg+VAT-math / ZUGFeRD PDF (Task 2.2).
- Server `instructions` (sent on initialize) and all document tool descriptions state the `file_path`-vs-`content_base64` convention up front (verification finding F5).
- `fixtures/plausibility/broken-leitweg-vat-math.xml`: officially valid invoice with wrong Leitweg check digits and VAT €0.02 off.
- `validate_invoice`: `skip_layers` accepts `"plausibility"`; `layers`/`timingsMs` report it; an officially valid invoice with error-level plausibility findings is rendered as `valid_with_warnings` instead of `valid`.
- `docs/VERIFICATION-v0.1.md`: Claude Desktop manual verification (S1–S6) with findings, plus first demo recording and screenshots in `docs/media/`.

### Changed
- Server README: Inspector commands use `@latest`; notes on absolute `node` path, read-only tools / "Always allow", and referencing PDFs by local path in Claude Desktop.

### Fixed
- File errors now distinguish a missing file (`ENOENT`) from an unreadable one (`EACCES`/`EPERM`) and point to macOS Privacy & Security / Full Disk Access (verification finding F10).
- German 16 % / 5 % VAT rates are accepted for invoices issued 1 Jul–31 Dec 2020 instead of being flagged by `KONTOR-PLAUS-VAT-RATE-DE`.
- `file_path` description and "File not found" error now tell the model to fall back to `content_base64` for chat attachments / sandboxed uploads, avoiding a wasted round-trip in Claude Desktop.
- Sample resources now carry their filename as `title`, so Claude Desktop lists four distinct entries instead of four identical "Sample invoices" rows.

## [0.1.0] — 2026-08-25 (internal, Phase 1 exit)

### Added
- `@kontor-mcp/server`: MCP server over stdio (`kontor-mcp` bin) with `parse_invoice`, `validate_invoice`, `explain_rule` (annotations, `outputSchema` + `structuredContent`, `file_path`/`content_base64` input, size caps, `lang`), `kontor://samples/{name}` resources, MCP logging (Task 1.6).
- `@kontor-mcp/core`: hardened XML loader (`loadXml`: DTD/XXE rejected, size/depth caps, line/col errors) and format detection (`detectFormat`: container, UBL/CII syntax, EN 16931, XRechnung version/variant, Factur-X/ZUGFeRD profile) (Task 1.1).
- `@kontor-mcp/core`: ZUGFeRD/Factur-X PDF extraction (`extractEmbeddedXml`, `detectInvoicePdf`): name-tree + `/AF` lookup, filename fallback scan, XMP conformance level → profile; encrypted / no-attachment / size / decompression-bomb rejected (Task 1.2).
- `@kontor-mcp/core`: EN 16931 semantic model (`InvoiceModel`, Zod schema, BT/BG annotation via `toAnnotatedJson`) and UBL/CII parsers (`parseInvoice`); `docs/BT-COVERAGE.md` generated by `pnpm bt-coverage` (Task 1.3).
- `@kontor-mcp/core`: validation pipeline `validateInvoice` — XSD (xmllint-wasm) + official EN 16931 / XRechnung Schematron (Saxon-JS) with KoSIT scenario selection and `customLevel` severities; verdict parity with the KoSIT validator on the whole official test suite. `@kontor-mcp/rules` now bundles gzipped SEFs, XSDs and `scenarios.json` (`pnpm rules:build`) (Task 1.4).
- `@kontor-mcp/rules`: rule knowledge base — generated entries for all 1642 EN 16931 / XRechnung rules plus 50 curated DE+EN explanations with fix hints (all BR-DE-*); `explainRule`, `suggestRuleIds`, `kbStats`, `pnpm kb:build`, `pnpm kb:lint` (Task 1.5).
- Monorepo skeleton: `@kontor-mcp/{core,rules,server,client}`, TypeScript strict, vitest, Biome, CI matrix (Task 0.1).
