# Spike fixtures (Task 0.3)

- `valid-ubl.xml`, `valid-cii.xml` — copies of `01.01a-INVOICE_{ubl,uncefact}.xml` from the official XRechnung test suite 2026-01-31 (Apache-2.0, see `packages/rules/PROVENANCE.md`).
- `invalid-ubl-missing-buyerref.xml` — `valid-ubl.xml` with `cbc:BuyerReference` removed → must fail **BR-DE-15**.
