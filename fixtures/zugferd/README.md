# ZUGFeRD / Factur-X sample PDFs

From https://github.com/ZUGFeRD/corpus (Apache-2.0), commit `d891458e9822e34271a5438497bf924e89955979`, folder `ZUGFeRDv2/`. Verify with `shasum -a 256 -c SHA256SUMS`.

| File | Corpus path | Profile / why it's here |
|---|---|---|
| Facture_FR_MINIMUM.pdf | correct/FNFE-factur-x-examples | MINIMUM profile |
| Facture_FR_BASICWL.pdf | correct/FNFE-factur-x-examples | BASIC WL profile |
| Avoir_FR_type381_BASIC.pdf | correct/FNFE-factur-x-examples | BASIC profile, credit note (381) |
| Facture_FR_EN16931.pdf | fail/FNFE-factur-x-examples | EN 16931 profile (corpus flags it as failing ZUGFeRD validation — useful negative case) |
| MustangGnuaccountingBeispielRE-20201121_508.pdf | correct/Mustangproject | German EN 16931 sample from Mustang |
| MustangGnuaccountingBeispielRE-20171118_506.pdf | fail/Mustangproject | ZUGFeRD 2.0 era sample, fails current rules |
| wrongFilename.pdf | fail/Mustangproject | Embedded XML under a non-standard filename → exercises fallback scan |
| factur-x-invalid-xml-encoding-attribute.pdf | fail/Mustangproject | Malformed XML declaration inside PDF → robustness case |
