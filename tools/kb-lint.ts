/** `pnpm kb:lint` — fails when a BR-DE rule lacks a curated entry or a curated id is unknown. */
import { kbStats, lintKb } from "../packages/rules/src/kb.js";

const problems = lintKb();
const s = kbStats();
console.log(
  `KB: ${s.total} rules (${s.xrechnung} XRechnung, ${s.en16931} EN 16931), ${s.curated} curated`,
);
for (const p of problems) console.error(`✗ ${p}`);
process.exit(problems.length ? 1 : 0);
