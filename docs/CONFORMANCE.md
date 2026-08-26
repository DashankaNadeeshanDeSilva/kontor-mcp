# Conformance

How closely Kontor's pure-TypeScript validation engine matches the official **KoSIT validator** (Java) — the reference implementation used by German public-sector recipients.

## Setup

| | Kontor (`@kontor-mcp/core` `validateInvoice`) | Oracle |
|---|---|---|
| Engine | xmllint-wasm 5.3.0 (XSD) + Saxon-JS 2.7 executing the official precompiled Schematron XSLTs (SEF) | KoSIT validator 1.6.3 |
| Rules | EN 16931 1.3.16 · XRechnung Schematron 2.5.0 · validator configuration 2026-01-31 (XRechnung 3.0.2) | same configuration |
| Scenario model | `scenarios.json` projection of `scenarios.xml` incl. `customLevel` (D-017, D-029) | `scenarios.xml` |
| Patches | D-019: BR-DE-19 IBAN mod-97 computed in `xs:decimal` (Saxon-JS `xs:integer` > 2^53 is inexact) | none |

## Corpus and result

Command: `pnpm conformance` (= `pnpm artifacts && pnpm oracle --diff --report docs/conformance/latest.json fixtures/spike fixtures/_downloads/xrechnung-testsuite/instances`, needs Java 17+), then `pnpm conformance:report` to render the table below and the README badge from `docs/conformance/latest.json`.

<!-- conformance:begin -->
Last oracle run: 2026-08-26 (validator-1.6.3-standalone.jar, `pnpm oracle --diff --report`). Thresholds (PRD S1): verdict parity 100 %, finding parity 100 % — enforced by the CI job `conformance` on every change to `packages/core`, `packages/rules` or the artefact manifest.

| Corpus | Files | Verdict parity | Finding parity (rule id + effective level) |
|---|---|---|---|
| Official XRechnung test suite (standard, extension, technical-cases) | 86 | **86/86** | **86/86** |
| Kontor spike fixtures | 3 | **3/3** | **3/3** |
| **Total** | **89** | **89/89** | **89/89** |
<!-- conformance:end -->

Notes:

- *Effective level* = SVRL flag level after the scenario's `customLevel` override. The KoSIT VARL report prints the raw flag level per message and applies `customLevel` only to the accept/reject decision; Kontor reports the effective level as the finding severity (that is what determines the verdict, and what an agent needs). The diff applies the same override to the oracle side before comparing.
- Verdict rule: reject iff at least one error-level finding remains. XSD failures are fatal and (as in KoSIT) suppress the Schematron layer.
- `KONTOR-*` findings (Kontor's own plausibility / pipeline notes) are excluded from the comparison.

## Continuous verification

- `packages/core/test/conformance.test.ts` replays the recorded oracle verdicts (`fixtures/conformance/oracle-verdicts.txt`) against the whole suite on every CI run (artifacts are fetched and cached in CI).
- `pnpm oracle --diff …` exits 1 on any mismatch and is the release gate (Task 3.5).

## Generated ZUGFeRD PDF/A-3 (Task 2.7)

What `generate_invoice` with `target: zugferd-pdf` produces, checked by two independent validators.

| | Kontor (`@kontor-mcp/core` `generateInvoice`) | Checker 1 | Checker 2 |
|---|---|---|---|
| Engine | pdf-lib 1.17.1 + @pdf-lib/fontkit (custom PDF/A-3 assembly, D-022/D-041); CII from `modelToCii` | **veraPDF 1.30.2**, profile PDF/A-3b (`pnpm verapdf`) | **Mustang CLI 2.26.0** `--action validate` (`pnpm mustang`): PDF/A + XMP + Factur-X profile XSD + EN 16931 Schematron |
| Assets | Liberation Sans 2.1.5 (OFL) subsetted, sRGB2014.icc OutputIntent (`packages/rules/pdf/`, PROVENANCE) | — | — |

### Result (2026-08-25)

Command: `pnpm samples:zugferd && pnpm check:zugferd` (needs Java 17+ and veraPDF). Samples are generated with a fixed clock, so the committed bytes are reproducible; the CI job `pdfa` regenerates them, fails on drift, and runs both checkers.

| Sample (`fixtures/generated/`) | Profile / lang | veraPDF PDF/A-3b | Mustang (pdf · xml · overall) | Kontor round trip (`detectInvoicePdf` → `validateInvoice`) |
|---|---|---|---|---|
| `zugferd-en16931.{de,en}.pdf` | EN 16931 | **PASS** (0 failed rules) | **valid · valid · valid** | valid, XMP `EN 16931` → `profile: en16931` |
| `zugferd-basic.{de,en}.pdf` | BASIC | **PASS** | **valid · valid · valid** (Factur-X BASIC XSD) | valid, 3 × `KONTOR-GEN-PROFILE-DROPPED` warnings (BG-6, BT-85, BT-86) |
| `zugferd-extended.{de,en}.pdf` | EXTENDED | **PASS** | **valid · valid · valid** | valid, `KONTOR-PDF-PROFILE-UNCHECKED` info |

Recorded reports: `docs/conformance/2026-08-25-verapdf-zugferd-en16931.xml` (146 rules, 0 failed) and `docs/conformance/2026-08-25-mustang-zugferd-{en16931,basic,extended}.xml`. The BASIC golden XML (`packages/core/test/golden/generated-zugferd-basic.xml`) was additionally validated with `xmllint --schema` against Mustang's bundled `FACTUR-X_BASIC.xsd` — that is how the BASIC drop list (D-042) was derived and confirmed.

### Continuous verification

- `packages/core/test/zugferd.test.ts`: structure (OutputIntent, XMP, AF, embedded font, /ID), embedded-CII goldens per profile, extraction round trip + full validation, byte determinism, pagination, glyph fallback; `generate.test.ts` runs 10 random inputs through the PDF target.
- CI job `pdfa` (Ubuntu, Java 21): regenerate → byte-identical check → veraPDF → Mustang on all six samples.

## Known differences

None open. Every future divergence gets an issue and a row here.
