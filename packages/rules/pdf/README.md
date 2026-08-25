# Bundled PDF assets (Task 2.7, ZUGFeRD PDF/A-3 generation)

| File | Purpose | Licence |
|---|---|---|
| `LiberationSans-Regular.ttf`, `LiberationSans-Bold.ttf` | Embedded (subsetted) text font of generated ZUGFeRD PDFs — PDF/A requires embedded fonts | SIL OFL 1.1 (`LICENSE-LiberationFonts.txt`) |
| `sRGB2014.icc` | PDF/A OutputIntent colour profile | ICC terms (`LICENSE-sRGB2014.txt`) |

Versions and sha256 checksums: `PROVENANCE.md` (section "PDF assets"). Loaded at runtime via `loadPdfAsset()`; never fetched.
