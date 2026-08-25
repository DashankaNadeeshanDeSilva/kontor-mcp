# Provenance of third-party standards artifacts

Every third-party artifact used by Kontor MCP — bundled at runtime, used as fixtures, or used only in build/CI — is listed here with source, version, retrieval date, license and checksum. Machine-readable twin: `tools/artifacts.manifest.json` (fetched by `pnpm artifacts`). Update both together.

Retrieval date for all entries below: **2026-08-25**.

## Runtime-bundled sources (compiled into `@kontor-mcp/rules`)

| id | Artifact | Version | Source | License | sha256 |
|---|---|---|---|---|---|
| `xrechnung-schematron` | XRechnung Schematron (BR-DE-* rules, source `.sch`) | 2.5.0 (XRechnung 3.0.2) | https://github.com/itplr-kosit/xrechnung-schematron/releases/tag/v2.5.0 | Apache-2.0 | `a0f3d827…2da85` |
| `xrechnung-validator-configuration` | KoSIT validator configuration: scenarios + **UBL 2.1 XSDs, CII D16B XSDs, precompiled EN 16931 + XRechnung XSLTs** | 2026-01-31 (XRechnung 3.0.2) | https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/tag/v2026-01-31 | Apache-2.0 (packaging); XSDs: OASIS UBL 2.1 (OASIS IPR, redistributable), UN/CEFACT D16B (UNECE, redistributable) | `6a5a5911…2704` |
| `en16931-ubl` | EN 16931 validation artefacts, UBL (Schematron source + preprocessed + compiled XSLT) | 1.3.16 | https://github.com/ConnectingEurope/eInvoicing-EN16931/releases/tag/validation-1.3.16 | EUPL-1.2 | `bafada01…da85` |
| `en16931-cii` | EN 16931 validation artefacts, CII | 1.3.16 | same | EUPL-1.2 | `1cd53cb8…3561` |

## Derived runtime artifacts (`packages/rules/artifacts/`, built by `pnpm rules:build`)

| File(s) | Derived from | Transformation | Checksums |
|---|---|---|---|
| `sef/EN16931-{UBL,CII}-validation.sef.json.gz` | `xrechnung-validator-configuration` → `resources/{ubl/2.1,cii/16b}/xsl/*.xsl` (EN 16931 1.3.16, EUPL-1.2) | `xslt3` (Saxon-JS 2.7) SEF export, gzip | `artifacts/MANIFEST.json` |
| `sef/XRechnung-{UBL,CII}-validation.sef.json.gz` | same package → `resources/xrechnung/3.0.2/xsl/*.xsl` (XRechnung Schematron 2.5.0, Apache-2.0) | D-019 patch (`tools/compile-sef.sh`: BR-DE-19 `xs:integer`→`xs:decimal`), SEF export, gzip | `artifacts/MANIFEST.json` |
| `xsd/ubl/**`, `xsd/cii/**` | same package → `resources/ubl/2.1/xsd` (Invoice, CreditNote, common), `resources/cii/16b/xsd` | verbatim copy | `artifacts/MANIFEST.json` |
| `scenarios.json` | same package → `scenarios.xml` | typed projection (name, syntax, CustomizationID, stylesheets, customLevel) | `artifacts/MANIFEST.json` |

## Fixtures

| id | Artifact | Version | Source | License | sha256 |
|---|---|---|---|---|---|
| `xrechnung-testsuite` | Official XRechnung test suite (conformance corpus) | 2026-01-31 (XRechnung 3.0.2) | https://github.com/itplr-kosit/xrechnung-testsuite/releases/tag/v2026-01-31 | Apache-2.0 | `a1e2b26d…29ee` |
| — | `packages/server/samples/` (shipped with the server): `valid-xrechnung-{ubl,cii}.xml` = test-suite `01.01a-INVOICE_{ubl,uncefact}.xml`, `broken-missing-buyer-reference.xml` = same UBL file without BuyerReference, `valid-zugferd-en16931.pdf` = corpus `MustangGnuaccountingBeispielRE-20201121_508.pdf` | as above | XRechnung test suite / ZUGFeRD corpus | Apache-2.0 | see sources |
| — | ZUGFeRD/Factur-X sample PDFs in `fixtures/zugferd/` (8 files) | corpus commit `d891458e` | https://github.com/ZUGFeRD/corpus (`ZUGFeRDv2/{correct,fail}/{FNFE-factur-x-examples,Mustangproject}`) | Apache-2.0 | see `fixtures/zugferd/SHA256SUMS` |

## Build / CI only (never shipped)

| id | Artifact | Version | Source | License | sha256 |
|---|---|---|---|---|---|
| `kosit-validator` | KoSIT validator standalone JAR (conformance oracle) | 1.6.3 | https://github.com/itplr-kosit/validator/releases/tag/v1.6.3 | Apache-2.0 | `799e64be…7a9c9` |
| `mustang-cli` | Mustang CLI (ZUGFeRD/Factur-X validator; second PDF checker) | 2.26.0 | https://github.com/ZUGFeRD/mustangproject/releases/tag/core-2.26.0 | Apache-2.0 | `42d7868c…9736` |
| `schxslt-cli` | SchXslt CLI (Schematron → XSLT compiler) | 1.10.1 | https://repo1.maven.org/maven2/name/dmaus/schxslt/cli/1.10.1/ | MIT | `cefb6c45…171a` |

Full checksums live in `tools/artifacts.manifest.json`.

## License decisions (bundle vs fetch-at-install)

- **Apache-2.0 (KoSIT)** and **MIT (SchXslt)**: redistribution-compatible with our Apache-2.0 → **bundle**. Keep NOTICE attributions.
- **EUPL-1.2 (EN 16931 artefacts)**: EUPL-1.2 is a copyleft licence with an explicit compatibility clause; redistributing the *unmodified* artefacts (and derived compiled forms) inside an Apache-2.0 project is permitted provided the EUPL notice accompanies them and the artefacts themselves remain under EUPL. → **bundle**, kept in a clearly separated directory with their own LICENSE, and stated in NOTICE. This is the same posture the KoSIT validator configuration (Apache-2.0) takes by shipping the compiled EN 16931 XSLTs. Re-verify before v1.0 publish (tracked in DECISIONS.md).
- **OASIS UBL / UNECE CII XSDs**: standard schemas, redistributable under their respective terms; bundled via the KoSIT package.

## Legal sources (`legal/timeline.json`, Task 2.5)

Not artifacts but primary legal texts, checked at development time (last verified 2026-08-25); the JSON carries URL + verbatim quote per fact.

| id | Source | URL |
|---|---|---|
| `ustg-14` | § 14 UStG | https://www.gesetze-im-internet.de/ustg_1980/__14.html |
| `ustg-27-38` | § 27 Abs. 38 UStG (Gesetz v. 27.03.2024, BGBl. 2024 I Nr. 108) | https://www.gesetze-im-internet.de/ustg_1980/__27.html |
| `ustdv-33` / `ustdv-34` / `ustdv-34a` | UStDV §§ 33, 34, 34a | https://www.gesetze-im-internet.de/ustdv_1980/ |
| `erechv-3` | § 3 E-RechV | https://www.gesetze-im-internet.de/erechv/__3.html |
| `bmf-faq` | BMF FAQ E-Rechnung (Stand 23.03.2026) | https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html |
| `erechnung-bund` | E-Rechnung Bund (Leitweg-ID, 27.11.2020) | https://www.e-rechnung-bund.de/ |

## Derived code lists (`codelists/*.json`, Task 2.6)

Generated by `pnpm codelists:build` (`tools/build-codelists.ts`) from `en16931-ubl` 1.3.16 `schematron/codelist/EN16931-UBL-codes.sch` (EUPL-1.2, see table above). Official code values verbatim; the `common` DE/EN names are Kontor's own curation and are validated against the official list at build time.
