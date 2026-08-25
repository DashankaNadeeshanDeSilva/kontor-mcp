/**
 * Task 0.4 — KoSIT validator oracle harness (CI/dev only; needs Java 17+).
 *
 *   pnpm oracle <file|dir>…            print normalized oracle findings (JSON with --json)
 *   pnpm oracle --diff <file|dir>…     also run Saxon-JS (spike engine) and diff verdicts + rule-ID sets
 *
 * Env: KONTOR_JAVA (path to java binary) overrides PATH lookup.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { validateWithSaxon } from "./spike-saxon.js";

const DL = resolve("fixtures/_downloads");
const JAR = join(DL, "validator-1.6.3-standalone.jar");
const CONF = join(DL, "xrechnung-validator-configuration");

export interface OracleFinding {
  ruleId: string;
  level: string;
  location: string;
  message: string;
}
export interface OracleResult {
  file: string;
  verdict: "accept" | "reject" | "unknown";
  scenario: string;
  findings: OracleFinding[];
}

function javaBin(): string {
  if (process.env.KONTOR_JAVA) return process.env.KONTOR_JAVA;
  const brew = "/opt/homebrew/opt/openjdk@21/bin/java";
  return existsSync(brew) ? brew : "java";
}

function collectXml(paths: string[]): string[] {
  const out: string[] = [];
  for (const p of paths) {
    const abs = resolve(p);
    if (statSync(abs).isDirectory()) {
      for (const f of readdirSync(abs, { recursive: true }) as string[])
        if (f.endsWith(".xml")) out.push(join(abs, f));
    } else out.push(abs);
  }
  return out.sort();
}

function parseReport(xml: string, file: string): OracleResult {
  const verdict = /<rep:accept\b/.test(xml)
    ? "accept"
    : /<rep:reject\b/.test(xml)
      ? "reject"
      : "unknown";
  const scenario = /<rep:scenarioMatched>\s*<s:scenario>\s*<s:name>([^<]*)/.exec(xml)?.[1] ?? "?";
  const findings: OracleFinding[] = [];
  const re = /<rep:message\b([^>]*)>([\s\S]*?)<\/rep:message>/g;
  for (const m of xml.matchAll(re)) {
    const a = m[1] ?? "";
    findings.push({
      ruleId: /\bcode="([^"]*)"/.exec(a)?.[1] ?? "?",
      level: /\blevel="([^"]*)"/.exec(a)?.[1] ?? "?",
      location: /\bxpathLocation="([^"]*)"/.exec(a)?.[1] ?? "",
      message: (m[2] ?? "").replace(/\s+/g, " ").trim(),
    });
  }
  return { file, verdict, scenario, findings };
}

export function runOracle(files: string[]): OracleResult[] {
  if (!existsSync(JAR)) throw new Error(`missing ${JAR} — run \`pnpm artifacts\` first`);
  const out = mkdtempSync(join(tmpdir(), "kontor-oracle-"));
  try {
    execFileSync(
      javaBin(),
      ["-jar", JAR, "-s", join(CONF, "scenarios.xml"), "-r", CONF, "-o", out, ...files],
      {
        stdio: ["ignore", "ignore", "ignore"],
      },
    );
  } catch {
    /* exit code 1 = at least one rejected document; reports are still written */
  }
  const results = files.map((f) => {
    const rep = join(out, `${basename(f, ".xml")}-report.xml`);
    return existsSync(rep)
      ? parseReport(readFileSync(rep, "utf8"), f)
      : { file: f, verdict: "unknown" as const, scenario: "?", findings: [] };
  });
  rmSync(out, { recursive: true, force: true });
  return results;
}

const errorLevels = new Set(["error", "fatal"]);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const diff = args.includes("--diff");
  const json = args.includes("--json");
  const files = collectXml(args.filter((a) => !a.startsWith("--")));
  if (!files.length) {
    console.error("usage: pnpm oracle [--diff] [--json] <file|dir>…");
    process.exit(2);
  }
  const results = runOracle(files);
  if (json && !diff) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  let mismatches = 0;
  for (const r of results) {
    const name = basename(r.file);
    if (!diff) {
      console.log(`${name}: ${r.verdict.toUpperCase()} [${r.scenario}]`);
      for (const f of r.findings)
        console.log(`  [${f.level}] ${f.ruleId} — ${f.message.slice(0, 120)}`);
      continue;
    }
    const s = await validateWithSaxon(r.file);
    const saxonVerdict = s.findings.some((f) => errorLevels.has(f.severity)) ? "reject" : "accept";
    const oracleIds = new Set(r.findings.map((f) => f.ruleId));
    const saxonIds = new Set(s.findings.map((f) => f.ruleId));
    const onlyOracle = [...oracleIds].filter((x) => !saxonIds.has(x));
    const onlySaxon = [...saxonIds].filter((x) => !oracleIds.has(x));
    const verdictOk = saxonVerdict === r.verdict;
    const idsOk = onlyOracle.length === 0 && onlySaxon.length === 0;
    if (!verdictOk || !idsOk) mismatches++;
    console.log(
      `${verdictOk ? "✓" : "✗"} ${name}: oracle=${r.verdict} saxon=${saxonVerdict} ids=${idsOk ? "same" : `oracle-only[${onlyOracle}] saxon-only[${onlySaxon}]`} (${s.ms.toFixed(0)} ms)`,
    );
  }
  if (diff) {
    console.log(`\n${results.length - mismatches}/${results.length} files agree`);
    if (mismatches) process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
