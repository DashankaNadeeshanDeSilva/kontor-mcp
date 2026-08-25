/**
 * Task 0.3 spike: execute the official (precompiled) Schematron XSLTs with Saxon-JS.
 * Usage: tsx tools/spike-saxon.ts <invoice.xml> [more.xml…]
 * Prints SVRL findings + timings. Throwaway-quality; the real pipeline lands in core/src/validate.
 */
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import SaxonJS from "saxon-js";

const SEF_DIR = resolve("fixtures/_downloads/sef");

interface Finding {
  ruleId: string;
  severity: string;
  location: string;
  message: string;
}

function detectSyntax(xml: string): "ubl" | "cii" {
  if (/CrossIndustryInvoice/.test(xml.slice(0, 2000))) return "cii";
  return "ubl";
}

function parseSvrl(svrl: string): Finding[] {
  const out: Finding[] = [];
  const re = /<svrl:failed-assert\b([^>]*)>([\s\S]*?)<\/svrl:failed-assert>/g;
  for (const m of svrl.matchAll(re)) {
    const attrs = m[1] ?? "";
    const body = m[2] ?? "";
    const id = /\bid="([^"]*)"/.exec(attrs)?.[1] ?? "?";
    const flag = /\bflag="([^"]*)"/.exec(attrs)?.[1] ?? "error";
    const loc = /\blocation="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const text = /<svrl:text[^>]*>([\s\S]*?)<\/svrl:text>/.exec(body)?.[1] ?? "";
    out.push({
      ruleId: id,
      severity: flag,
      location: loc,
      message: text.replace(/\s+/g, " ").trim(),
    });
  }
  return out;
}

const sefCache = new Map<string, unknown>();
function loadSef(name: string): unknown {
  let s = sefCache.get(name);
  if (!s) {
    s = JSON.parse(readFileSync(resolve(SEF_DIR, `${name}.sef.json`), "utf8"));
    sefCache.set(name, s);
  }
  return s;
}

async function validate(file: string): Promise<{ findings: Finding[]; ms: number }> {
  const xml = readFileSync(file, "utf8");
  const syn = detectSyntax(xml).toUpperCase();
  const t0 = performance.now();
  const findings: Finding[] = [];
  for (const sheet of [`EN16931-${syn}-validation`, `XRechnung-${syn}-validation`]) {
    const res = await SaxonJS.transform(
      {
        stylesheetInternal: loadSef(sheet),
        sourceText: xml,
        destination: "serialized",
      },
      "async",
    );
    findings.push(...parseSvrl(String(res.principalResult)));
  }
  return { findings, ms: performance.now() - t0 };
}

const files = process.argv.slice(2);
const tStart = performance.now();
for (const f of files) {
  const { findings, ms } = await validate(f);
  const errors = findings.filter((x) => x.severity === "fatal" || x.severity === "error");
  console.log(
    `\n${basename(f)}: ${errors.length ? "INVALID" : "VALID"} (${ms.toFixed(0)} ms, ${findings.length} findings)`,
  );
  for (const x of findings)
    console.log(`  [${x.severity}] ${x.ruleId} @ ${x.location}\n      ${x.message.slice(0, 160)}`);
}
// warm re-run of the first file
if (files[0]) {
  const { ms } = await validate(files[0]);
  console.log(`\nwarm re-run ${basename(files[0])}: ${ms.toFixed(0)} ms`);
}
console.log(
  `total wall ${((performance.now() - tStart) / 1000).toFixed(2)} s, rss ${(process.memoryUsage().rss / 1048576).toFixed(0)} MB`,
);
