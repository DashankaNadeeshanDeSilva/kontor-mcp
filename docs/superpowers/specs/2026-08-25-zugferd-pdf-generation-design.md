# Task 2.7 — ZUGFeRD PDF/A-3 generation (`generate_invoice` target `zugferd-pdf`)

**Date:** 2026-08-25 · **Status:** approved in chat (owner OK on all recommendations)

## API
- `generateInvoice(input, { target?: "xrechnung-ubl" | "zugferd-pdf", zugferdProfile?: "EN16931" | "BASIC" | "EXTENDED", lang?, now?, documentId? })`.
- `GenerateResult` gains `pdf?: Uint8Array`, `format`, `profile`; `xml` = the embedded CII for the PDF target.
- Server tool `generate_invoice`: `target`, `zugferd_profile`; `output_path` accepts `.pdf`; without it the PDF is returned as `content_base64`.

## Rendering (no browser)
Cursor-based flow layout on pdf-lib (`core/src/pdf/render.ts`): heading, key/value, two columns, tables with page breaks, page footer.
Block order and labels identical to `renderHtmlPreview` (`T` and `formatAmount` exported from `preview/html.ts`). Black/grey text only, no images/transparency/annotations → PDF/A-3b.

## Bundled assets (no runtime network)
Liberation Sans 2.1.5 Regular + Bold (SIL OFL 1.1) and color.org `sRGB2014.icc`, committed under `packages/rules/artifacts/pdf/` with licence files and rows in `PROVENANCE.md`. `@pdf-lib/fontkit` becomes a core runtime dependency.

## PDF/A-3 assembly (`core/src/pdf/pdfa3.ts`, from spike 0.6)
Info dict ≡ XMP; OutputIntent GTS_PDFA1 + sRGB; `factur-x.xml` attached with MIME `text/xml`, `AFRelationship /Alternative`; XMP with `pdfaid` 3/B + Factur-X extension schema (`fx:DocumentType INVOICE, DocumentFileName factur-x.xml, Version 1.0, ConformanceLevel <profile>`); trailer `/ID` derived from sha256(xml + clock) → deterministic bytes under an injected clock; `useObjectStreams: false`.

## Profile matrix
| profile | CII specificationIdentifier | XMP ConformanceLevel | validation |
|---|---|---|---|
| EN16931 | `urn:cen.eu:en16931:2017` | `EN 16931` | full T2 |
| BASIC | `urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic` | `BASIC` | full T2; unsupported fields pruned with `KONTOR-GEN-PROFILE-DROPPED` warnings |
| EXTENDED | `urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended` | `EXTENDED` | XSD + plausibility; Schematron skipped, `KONTOR-PDF-PROFILE-UNCHECKED` info |

## Fail-honest loop
After assembly: `detectInvoicePdf(pdf)` → `validateInvoice(xml)`. `valid` = validation passed ∧ extraction succeeded ∧ XMP profile round-trips. Generator-side problems become `KONTOR-PDF-*` findings; `Finding.source` gains `"generation"`.

## Tests / CI / docs
Core `zugferd.test.ts` (goldens of embedded CII per profile + structural JSON, round-trip, determinism, multi-page layout, property subset, asset sha256); server tests; committed generated sample; CI job running veraPDF `-f 3b`; `docs/CONFORMANCE.md` section with veraPDF + Mustang results; DECISIONS D-040…D-043; CHANGELOG.
