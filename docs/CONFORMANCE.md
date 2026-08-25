# Conformance

How closely Kontor's pure-TypeScript validation engine matches the official **KoSIT validator** (Java) — the reference implementation used by German public-sector recipients.

## Setup

| | Kontor (`@kontor-mcp/core` `validateInvoice`) | Oracle |
|---|---|---|
| Engine | xmllint-wasm 5.3.0 (XSD) + Saxon-JS 2.7 executing the official precompiled Schematron XSLTs (SEF) | KoSIT validator 1.6.3 |
| Rules | EN 16931 1.3.16 · XRechnung Schematron 2.5.0 · validator configuration 2026-01-31 (XRechnung 3.0.2) | same configuration |
| Scenario model | `scenarios.json` projection of `scenarios.xml` incl. `customLevel` (D-017, D-029) | `scenarios.xml` |
| Patches | D-019: BR-DE-19 IBAN mod-97 computed in `xs:decimal` (Saxon-JS `xs:integer` > 2^53 is inexact) | none |

## Corpus and result (2026-08-25)

Command: `pnpm artifacts && pnpm oracle --diff fixtures/spike fixtures/_downloads/xrechnung-testsuite/instances` (needs Java 17+).

| Corpus | Files | Verdict parity | Finding parity (rule id + effective level) |
|---|---|---|---|
| Official XRechnung 3.0.2 test suite (standard, extension, technical-cases/cius, technical-cases/cvd) | 86 | **86/86** | **86/86** |
| Kontor spike fixtures (valid UBL, valid CII, UBL without BuyerReference) | 3 | **3/3** | **3/3** |

Notes:

- *Effective level* = SVRL flag level after the scenario's `customLevel` override. The KoSIT VARL report prints the raw flag level per message and applies `customLevel` only to the accept/reject decision; Kontor reports the effective level as the finding severity (that is what determines the verdict, and what an agent needs). The diff applies the same override to the oracle side before comparing.
- Verdict rule: reject iff at least one error-level finding remains. XSD failures are fatal and (as in KoSIT) suppress the Schematron layer.
- `KONTOR-*` findings (Kontor's own plausibility / pipeline notes) are excluded from the comparison.

## Continuous verification

- `packages/core/test/conformance.test.ts` replays the recorded oracle verdicts (`fixtures/conformance/oracle-verdicts.txt`) against the whole suite on every CI run (artifacts are fetched and cached in CI).
- `pnpm oracle --diff …` exits 1 on any mismatch and is the release gate (Task 3.5).

## Known differences

None open. Every future divergence gets an issue and a row here.
