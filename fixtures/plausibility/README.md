# fixtures/plausibility

Hand-made invoices for the Layer-3 plausibility checks (Task 2.1/2.2). Derived from the KoSIT sample
`fixtures/spike/valid-ubl.xml` (provenance in `packages/rules/PROVENANCE.md`) by explicit edits:

- `broken-leitweg-vat-math.xml` — officially **valid** (KoSIT verdict), but the Leitweg-ID check digits
  are wrong (`04011000-12345-04`, expected `-03`) and the VAT amount is 22.06 instead of 22.04
  (€0.02 too high; BR-CO-17 tolerates ±1). Expected: `KONTOR-PLAUS-LEITWEG-CHECK`,
  `KONTOR-PLAUS-VAT-BREAKDOWN-AMOUNT`, recommendation `review`.

The unit fixtures for every KONTOR-PLAUS-* id live inline in `packages/core/test/plausibility.test.ts`.
