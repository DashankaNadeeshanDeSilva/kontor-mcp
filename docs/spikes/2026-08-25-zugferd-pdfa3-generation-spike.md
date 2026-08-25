# Spike 0.6 — ZUGFeRD / Factur-X PDF/A-3 generation path

**Date:** 2026-08-25 · **Decision: custom pdf-lib implementation (no `node-zugferd`).**

## node-zugferd evaluation (jslno/node-zugferd, MIT)

| Aspect | Finding |
|---|---|
| Maturity | README: "[WIP] still under development"; npm latest `0.1.1-beta.1` (Aug 2025) while the repo (pushed Jul 2026) has moved on — issue #109 "Update npm package" open |
| Scope | Generates CII XML from its own zod-3 schema and **embeds it into a PDF you already rendered** ("the data in your pdf must exactly match"). No visual rendering. |
| PDF/A-3 quality | Open issue **#114: XMP uses `xmlns:about` instead of `rdf:about` → veraPDF PDF/A-3b FAIL**; #112/#113 CII element-ordering bugs; #116 missing ChargeIndicator |
| Dependencies | `fast-xml-parser`, `pdf-lib`, `zod@3`, `defu`, plus `xsd-schema-validator` (requires Java `xmllint`/JAXP) — conflicts with our no-Java-at-runtime rule and with zod 4 |
| Fit | Kontor already owns the semantic model → CII serializer (needed for `convert_invoice` anyway) and the validation pipeline. The only piece we would take is PDF/A-3 assembly + XMP — precisely the part that is currently broken upstream. |

## Custom path prototype (`tools/spike-pdfa3.ts`, ~120 lines)

pdf-lib 1.17.1 + `@pdf-lib/fontkit`; no other dependencies:

1. Page with text drawn in an **embedded, subsetted TrueType font** (PDF/A forbids non-embedded fonts).
2. `doc.attach(xml, "factur-x.xml", { mimeType: "text/xml", afRelationship: Alternative, creation/modificationDate })` → pdf-lib writes `/EmbeddedFiles` name tree, `/Subtype /text#2Fxml`, `/Params`, `/AFRelationship /Alternative` and catalog `/AF`.
3. **OutputIntent** `GTS_PDFA1` with an embedded sRGB ICC profile (N=3).
4. **XMP** packet: `pdfaid:part=3`/`conformance=B`, dc/xmp/pdf blocks consistent with the Info dictionary, the **Factur-X extension schema** (`urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#`) and `fx:DocumentType/DocumentFileName/Version/ConformanceLevel`.
5. Trailer `/ID`, `useObjectStreams:false`.

Input: `fixtures/spike/valid-cii.xml` (official test-suite XRechnung CII) with `fx:ConformanceLevel = XRECHNUNG`.

## Results

| Check | Result |
|---|---|
| **veraPDF 1.30.2, PDF/A-3b profile** | **PASS** (`docs/spikes/artifacts/2026-08-25-pdfa3-spike-verapdf.xml`) |
| Mustang CLI 2.26.0 `--action validate` (ZUGFeRD community validator: PDF/A + XMP + XML consistency) | **valid** — `<pdf><summary status="valid"/>`, `<xml><summary status="valid"/>`, overall `valid` (same result as the corpus reference `MustangGnuaccountingBeispielRE-20201121_508.pdf`) |
| Structure grep | `/AFRelationship /Alternative`, `/EmbeddedFiles`, `/Subtype /text#2Fxml`, `/OutputIntents`, `GTS_PDFA1`, `pdfaid:part 3`, `fx:ConformanceLevel XRECHNUNG` all present |

## Consequences

- **Task 2.7 builds on the prototype:** move it into `core/src/pdf/pdfa3.ts`; bundle an OFL font (e.g. Liberation Sans or Inter) and the sRGB ICC profile (use the freely redistributable sRGB2014/`sRGB_IEC61966-2-1_black_scaled.icc` from color.org rather than the macOS system profile) in `@kontor-mcp/rules` or `core/assets`; render the visual page from the `html-preview` layout.
- Profile-dependent XMP: `fx:ConformanceLevel` ∈ MINIMUM / BASIC WL / BASIC / EN 16931 / EXTENDED / XRECHNUNG; ZUGFeRD 2.3 / Factur-X 1.0.07 share the `1p0` namespace with `fx:Version = 1.0`.
- CI gates for generated PDFs: `pnpm verapdf` (PDF/A-3b) **and** Mustang CLI validate **and** extraction round-trip through our own parser + KoSIT oracle.
