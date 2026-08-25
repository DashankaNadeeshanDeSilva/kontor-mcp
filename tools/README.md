# tools

Build-time and CI-only scripts (never runtime dependencies): artifact fetch/verify, Schematron → XSLT → SEF compilation, KoSIT oracle runner, veraPDF wrapper. See IMPLEMENTATION_PLAN Tasks 0.2–0.6.

## ZUGFeRD samples (Task 2.7)

- `pnpm samples:zugferd` — regenerates `fixtures/generated/zugferd-{en16931,basic,extended}.{de,en}.pdf` and `packages/server/samples/generated-zugferd-en16931.pdf` with a fixed clock (byte-identical).
- `pnpm check:zugferd` — CI gate: regenerate, fail on drift, veraPDF PDF/A-3b (`VERAPDF` env or PATH) and Mustang CLI (Java) on every sample. `tools/verapdf-auto-install.xml` installs veraPDF unattended in CI.
