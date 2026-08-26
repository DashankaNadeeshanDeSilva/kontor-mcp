/**
 * Task 3.5 — renders docs/conformance/latest.json (written by `pnpm oracle --diff --report`) into
 * the marked block of docs/CONFORMANCE.md and the README conformance badge, and enforces the
 * release thresholds (PRD S1): verdict parity 100 %, finding-set parity 100 %.
 *
 *   pnpm conformance:report          rewrite the block + badge
 *   pnpm conformance:report --check  exit 1 if the committed docs differ from the report, or thresholds fail
 *   ... --check --against <fresh.json>  CI mode: thresholds are enforced on a freshly generated report and its
 *                                       per-file parity must equal the committed latest.json (timestamps ignored)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ConformanceReport } from "./oracle.js";

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const REPORT = root("docs/conformance/latest.json");
const CONFORMANCE = root("docs/CONFORMANCE.md");
const README = root("README.md");
const BEGIN = "<!-- conformance:begin -->";
const END = "<!-- conformance:end -->";
const check = process.argv.includes("--check");
const againstIdx = process.argv.indexOf("--against");
const against = againstIdx >= 0 ? process.argv[againstIdx + 1] : undefined;

const report = JSON.parse(readFileSync(REPORT, "utf8")) as ConformanceReport;
const corpora = new Map<string, ConformanceReport["files"]>();
for (const f of report.files) {
  const key = f.file.includes("xrechnung-testsuite")
    ? "Official XRechnung test suite (standard, extension, technical-cases)"
    : f.file.startsWith("fixtures/spike")
      ? "Kontor spike fixtures"
      : f.file.split("/").slice(0, 2).join("/");
  corpora.set(key, [...(corpora.get(key) ?? []), f]);
}
const total = report.files.length;
const verdictOk = report.files.filter((f) => f.verdictOk).length;
const findingsOk = report.files.filter((f) => f.findingsOk).length;
const mismatches = report.files.filter((f) => !f.verdictOk || !f.findingsOk);
const date = report.generatedAt.slice(0, 10);

const rows = [...corpora.entries()].map(([name, files]) => {
  const v = files.filter((f) => f.verdictOk).length;
  const r = files.filter((f) => f.findingsOk).length;
  return `| ${name} | ${files.length} | **${v}/${files.length}** | **${r}/${files.length}** |`;
});
const block = [
  BEGIN,
  `Last oracle run: ${date} (${report.validatorJar}, \`pnpm oracle --diff --report\`). Thresholds (PRD S1): verdict parity 100 %, finding parity 100 % — enforced by the CI job \`conformance\` on every change to \`packages/core\`, \`packages/rules\` or the artefact manifest.`,
  "",
  "| Corpus | Files | Verdict parity | Finding parity (rule id + effective level) |",
  "|---|---|---|---|",
  ...rows,
  `| **Total** | **${total}** | **${verdictOk}/${total}** | **${findingsOk}/${total}** |`,
  ...(mismatches.length
    ? [
        "",
        "Mismatches:",
        ...mismatches.map(
          (f) =>
            `- \`${f.file}\`: oracle=${f.oracleVerdict} kontor=${f.kontorVerdict}${f.onlyOracle.length ? ` oracle-only[${f.onlyOracle.join(", ")}]` : ""}${f.onlyOurs.length ? ` kontor-only[${f.onlyOurs.join(", ")}]` : ""}`,
        ),
      ]
    : []),
  END,
].join("\n");

const badge = `[![Conformance](https://img.shields.io/badge/KoSIT%20conformance-${findingsOk}%2F${total}-${findingsOk === total ? "brightgreen" : "red"})](docs/CONFORMANCE.md)`;

function splice(text: string, next: string): string {
  const a = text.indexOf(BEGIN);
  const b = text.indexOf(END);
  if (a < 0 || b < 0)
    throw new Error("docs/CONFORMANCE.md lacks the conformance:begin/end markers");
  return text.slice(0, a) + next + text.slice(b + END.length);
}

const conf = readFileSync(CONFORMANCE, "utf8");
const readme = readFileSync(README, "utf8");
const nextConf = splice(conf, block);
const nextReadme = readme.replace(/\[!\[Conformance\]\([^)]*\)\]\(docs\/CONFORMANCE\.md\)/, badge);

const failures: string[] = [];
if (verdictOk !== total) failures.push(`verdict parity ${verdictOk}/${total} < 100 %`);
if (findingsOk !== total) failures.push(`finding parity ${findingsOk}/${total} < 100 %`);
if (total < 80) failures.push(`corpus too small (${total} files) — artefacts missing?`);

if (check) {
  if (against) {
    const fresh = JSON.parse(readFileSync(against, "utf8")) as ConformanceReport;
    const key = (f: ConformanceReport["files"][number]) =>
      `${f.file} ${f.oracleVerdict}/${f.kontorVerdict} v=${f.verdictOk} f=${f.findingsOk} ${f.onlyOracle.join(",")}|${f.onlyOurs.join(",")}`;
    const committed = new Set(report.files.map(key));
    const freshKeys = new Set(fresh.files.map(key));
    const changed = [...freshKeys].filter((k) => !committed.has(k));
    const missing = [...committed].filter((k) => !freshKeys.has(k));
    const fv = fresh.files.filter((f) => f.verdictOk).length;
    const ff = fresh.files.filter((f) => f.findingsOk).length;
    if (fv !== fresh.files.length)
      failures.push(`fresh run: verdict parity ${fv}/${fresh.files.length} < 100 %`);
    if (ff !== fresh.files.length)
      failures.push(`fresh run: finding parity ${ff}/${fresh.files.length} < 100 %`);
    if (changed.length || missing.length) {
      failures.push(
        `fresh run differs from committed docs/conformance/latest.json:\n  changed/new: ${changed.join("\n  ") || "-"}\n  missing: ${missing.join("\n  ") || "-"}`,
      );
    }
  }
  if (nextConf !== conf || nextReadme !== readme) {
    failures.push(
      "docs/CONFORMANCE.md or README badge differ from docs/conformance/latest.json — run `pnpm conformance:report` and commit",
    );
  }
  if (failures.length) {
    console.error(`CONFORMANCE GATE FAILED:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`conformance gate OK: ${findingsOk}/${total} (${date})`);
} else {
  writeFileSync(CONFORMANCE, nextConf);
  writeFileSync(README, nextReadme);
  console.log(
    `docs updated: ${verdictOk}/${total} verdicts, ${findingsOk}/${total} finding sets (${date})`,
  );
  if (failures.length) {
    console.error(`thresholds NOT met:\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
}
