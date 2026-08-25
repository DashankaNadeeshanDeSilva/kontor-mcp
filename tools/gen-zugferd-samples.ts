/**
 * Regenerates the committed ZUGFeRD samples (Task 2.7): fixed clock → byte-identical output.
 * Usage: pnpm samples:zugferd   → fixtures/generated/*.pdf + packages/server/samples/generated-zugferd-en16931.pdf
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { generateInvoice, ZUGFERD_PROFILES } from "../packages/core/src/index.js";
import { REFERENCE } from "../packages/core/test/fixtures/reference-input.js";

const NOW = new Date("2026-08-25T10:00:00Z");
const TODAY = new Date("2026-08-26T00:00:00Z");
mkdirSync("fixtures/generated", { recursive: true });
for (const profile of ZUGFERD_PROFILES) {
  for (const lang of ["de", "en"] as const) {
    const r = await generateInvoice(REFERENCE, {
      target: "zugferd-pdf",
      zugferdProfile: profile,
      lang,
      now: NOW,
      plausibility: { today: TODAY },
    });
    if (!r.pdf) throw new Error("no pdf");
    const name = `zugferd-${profile.toLowerCase()}.${lang}.pdf`;
    writeFileSync(`fixtures/generated/${name}`, r.pdf);
    console.log(
      `${name}: ${r.pdf.byteLength} bytes, valid=${r.valid}, findings=${r.findings.filter((f) => f.severity !== "info").length}`,
    );
    if (profile === "EN16931" && lang === "de")
      writeFileSync("packages/server/samples/generated-zugferd-en16931.pdf", r.pdf);
  }
}
