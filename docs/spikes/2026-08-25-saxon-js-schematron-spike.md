# Spike 0.3 — Official Schematron rules on Saxon-JS (pure JS, no Java at runtime)

**Date:** 2026-08-25 · **Verdict: PASS — architecture D1 (TypeScript everywhere, no Java at runtime) confirmed.**

## What was tried

1. Took the **precompiled** Schematron XSLTs that ship with the KoSIT validator configuration 2026-01-31 (XRechnung 3.0.2): `EN16931-{UBL,CII}-validation.xsl` (EN 16931 1.3.16) and `XRechnung-{UBL,CII}-validation.xsl` (XRechnung Schematron 2.5.0). No SchXslt step needed.
2. Compiled each to SEF with `xslt3` (Saxon-JS 2.7.0 compiler, `-nogo -relocate:on`). All four compiled with **zero errors or warnings**: 6.6 s / 4.4 s / 1.9 s / 1.5 s. Output sizes 9.3 MB, 6.9 MB, 1.8 MB, 1.7 MB (JSON, compresses well).
3. Ran `SaxonJS.transform()` with `stylesheetInternal` (SEF loaded once, cached) over invoices; parsed SVRL `failed-assert` elements into the `Finding` shape (`tools/spike-saxon.ts`).
4. Ran the KoSIT validator 1.6.3 JAR on the same files as oracle.

## Results

| File | Saxon-JS | KoSIT oracle | Rule-level match |
|---|---|---|---|
| `01.01a-INVOICE_ubl.xml` (test suite) | VALID — BR-DE-19 (warning), BR-DE-TMP-32 (info) | accept — same two | ✅ |
| `01.01a-INVOICE_uncefact.xml` | VALID — same two | accept | ✅ |
| `invalid-ubl-missing-buyerref.xml` (BuyerReference removed) | INVALID — **BR-DE-15 fatal** | reject — BR-DE-15 | ✅ |
| **All 86 official test-suite instances** | 82 VALID / 4 INVALID | 86 accept | see below |

The 4 divergent files (`extension/04.05a` CII, `extension/05.01a` UBL, `technical-cases/…/02.01a-cvd` UBL+CII) fire BR-CL-10/13/21 and BR-CO-16 in *both* engines. The oracle still accepts them because `scenarios.xml` applies per-scenario **`customLevel`** overrides (Extension scenario: BR-CL-10/11/21/24/25/26, BR-CO-16 → *information*; CVD scenario: BR-CL-13 → *information*; base scenario: BR-CL-21/23 → *warning*). Once those overrides are applied, verdict parity is **86/86**. The raw SVRL findings are identical — this is a rule-set-selection concern, not an engine concern.

## Performance (MacBook, Apple Silicon, Node 22)

| Metric | Measured | Budget (PRD S3) |
|---|---|---|
| Cold: process start + load 2 SEFs + first validation | ~0.9 s wall (SEF parse ≈ 0.4 s) | < 5 s ✅ |
| Warm per-invoice (EN 16931 + XRechnung, both sheets) | 44–180 ms typical; max 549 ms (05.01a, sub-lines) | < 2 s ✅ |
| Whole test suite (86 files) | 3.6 s wall | — |
| RSS | ~260 MB with all 4 SEFs loaded | — |

## Engine discrepancy found and worked around (D-019)

After building the oracle harness (Task 0.4, `pnpm oracle --diff`), rule-ID-set comparison over all 89 files showed **BR-DE-19** (IBAN mod-97 check, `warning`) firing in Saxon-JS but never in the Java validator. Root cause, isolated with a 3-line stylesheet:

| Expression | Saxon-JS 2.7 | correct |
|---|---|---|
| `xs:integer('123456789012345678901234567890') mod 97` | **28** | 52 |
| `xs:decimal('123456789012345678901234567890') mod 97` | 52 | 52 |

Saxon-JS evaluates `xs:integer` arithmetic beyond 2^53 with double precision. The XRechnung IBAN test builds a ~30-digit integer. **Workaround:** `tools/compile-sef.sh` rewrites exactly the IBAN sub-expression `xs:integer(string-join(for $cp in string-to-codepoints(…` → `xs:decimal(…)` (4 occurrences per XRechnung stylesheet, 0 in EN 16931) before SEF compilation. Semantics are unchanged for a conforming XPath engine. After the patch: **rule-ID sets identical on 89/89 files; verdicts 85/89** with the 4 remaining differences fully explained by scenario `customLevel` (to be implemented in Task 1.4 → expected 89/89). No other `xs:integer(` usages in the XRechnung stylesheets operate on long strings (the Leitweg-ID check uses 8-digit substrings).

## Consequences / decisions

- **Runtime engine = Saxon-JS 2 HE (`saxon-js`), stylesheets shipped as SEF JSON in `@kontor-mcp/rules`.** `xslt3` is a build-time devDependency only. SchXslt is retained in the manifest only for the case where we need to recompile from `.sch` sources; not needed today.
- **The validation pipeline must implement KoSIT's scenario model**: match on CustomizationID / GuidelineSpecifiedDocumentContextParameter (11 scenarios: XRechnung base / Extension / CVD × UBL Invoice / UBL CreditNote / CII, plus plain EN 16931 × 3), then apply `customLevel` severity overrides before computing the verdict. Plan: parse `scenarios.xml` at build time into a typed JSON table bundled in `@kontor-mcp/rules` (Task 1.4).
- Saxon-JS `location` attributes use `Q{ns}local[n]` XPath syntax — normalise to prefixed XPath for readability in Task 1.4.
- Saxon-JS licence: Saxonica's own licence (free to use and redistribute, not OSI). Record in NOTICE; it is a runtime dependency that ships with the server. No fallback engine (D8) is required.

## Reproduce

```sh
pnpm artifacts                      # fetch pinned artifacts
pnpm spike:sef                      # compile the 4 XSLTs → fixtures/_downloads/sef/*.sef.json
pnpm spike:saxon fixtures/spike/*.xml
pnpm oracle fixtures/spike/*.xml    # (Task 0.4) KoSIT validator, Java 17+
```
