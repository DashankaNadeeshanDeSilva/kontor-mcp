/** Rule knowledge base (PRD T4): generated baseline for every Schematron assert + hand-curated explanations. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const KB_DIR: string = fileURLToPath(new URL("../kb/", import.meta.url));

export type RuleSyntax = "ubl" | "cii";
export type RuleSource = "en16931" | "xrechnung";
export type RuleSeverity = "error" | "warning" | "info";
export interface Localized {
  de: string;
  en: string;
}

interface GeneratedRule {
  ruleId: string;
  source: RuleSource;
  flag: "fatal" | "warning" | "information";
  officialText: string;
  syntaxes: RuleSyntax[];
  test: Partial<Record<RuleSyntax, string>>;
  context: Partial<Record<RuleSyntax, string>>;
  bt: string[];
}

interface CuratedRule {
  explanation: Localized;
  fixHint: Localized;
  bt?: string[];
  commonCauses?: { de: string[]; en: string[] };
}

export interface RuleEntry {
  ruleId: string;
  source: RuleSource;
  /** Default severity as flagged in the Schematron (scenarios may override it, D-017). */
  severity: RuleSeverity;
  officialText: string;
  syntaxes: RuleSyntax[];
  /** The Schematron test expression per syntax (the "raw" rule). */
  test?: Partial<Record<RuleSyntax, string>>;
  bt: string[];
  curated: boolean;
  explanation: Localized;
  fixHint: Localized;
  commonCauses?: { de: string[]; en: string[] };
}

export type ExplainResult =
  | { found: true; entry: RuleEntry }
  | { found: false; ruleId: string; suggestions: string[] };

let generated: Map<string, GeneratedRule> | undefined;
let curated: Record<string, CuratedRule> | undefined;

function load(): { generated: Map<string, GeneratedRule>; curated: Record<string, CuratedRule> } {
  if (!generated) {
    const list = JSON.parse(
      readFileSync(join(KB_DIR, "generated.json"), "utf8"),
    ) as GeneratedRule[];
    generated = new Map(list.map((r) => [r.ruleId, r]));
  }
  if (!curated) {
    const raw = JSON.parse(readFileSync(join(KB_DIR, "curated.json"), "utf8")) as Record<
      string,
      CuratedRule | string
    >;
    curated = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith("$"))) as Record<
      string,
      CuratedRule
    >;
  }
  return { generated, curated };
}

/** "br_de 15" → "BR-DE-15"; keeps letter suffixes like "BR-DE-23-a" as written in the rule sets. */
export function normalizeRuleId(input: string): string {
  const s = input
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .toUpperCase();
  return s.replace(/-([AB])$/, (_m, x: string) => `-${x.toLowerCase()}`);
}

const baseline = (r: GeneratedRule): Localized => ({
  de: `Offizielle Regel ${r.ruleId} (${r.source === "xrechnung" ? "XRechnung" : "EN 16931"}): ${r.officialText}`,
  en: `Official rule ${r.ruleId} (${r.source === "xrechnung" ? "XRechnung" : "EN 16931"}): ${r.officialText}`,
});

function toEntry(r: GeneratedRule, c: CuratedRule | undefined): RuleEntry {
  const severity: RuleSeverity =
    r.flag === "warning" ? "warning" : r.flag === "information" ? "info" : "error";
  const entry: RuleEntry = {
    ruleId: r.ruleId,
    source: r.source,
    severity,
    officialText: r.officialText,
    syntaxes: r.syntaxes,
    test: r.test,
    bt: c?.bt ?? r.bt,
    curated: Boolean(c),
    explanation: c?.explanation ?? baseline(r),
    fixHint: c?.fixHint ?? {
      de: `Betroffene Elemente prüfen: ${r.bt.join(", ") || "siehe Regeltext"}. Schematron-Test: ${r.test.ubl ?? r.test.cii ?? "–"}`,
      en: `Check the affected elements: ${r.bt.join(", ") || "see rule text"}. Schematron test: ${r.test.ubl ?? r.test.cii ?? "–"}`,
    },
  };
  if (c?.commonCauses) entry.commonCauses = c.commonCauses;
  return entry;
}

export function explainRule(ruleId: string): ExplainResult {
  const { generated, curated } = load();
  const id = normalizeRuleId(ruleId);
  const g = generated.get(id);
  if (g) return { found: true, entry: toEntry(g, curated[id]) };
  return { found: false, ruleId: id, suggestions: suggestRuleIds(id) };
}

export function listRuleIds(): string[] {
  return [...load().generated.keys()];
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] as number;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j] as number;
      prev[j] = Math.min(
        (prev[j] as number) + 1,
        (prev[j - 1] as number) + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = tmp;
    }
  }
  return prev[b.length] as number;
}

/** Nearest known rule ids (same family first, then edit distance). */
export function suggestRuleIds(ruleId: string, limit = 3): string[] {
  const id = normalizeRuleId(ruleId);
  const family = id.replace(/-?\d+(-[ab])?$/, "");
  return listRuleIds()
    .map((k) => ({ k, d: levenshtein(id, k) + (k.startsWith(family) ? 0 : 2) }))
    .sort((x, y) => x.d - y.d || x.k.localeCompare(y.k, undefined, { numeric: true }))
    .slice(0, limit)
    .map((x) => x.k);
}

export function kbStats(): { total: number; curated: number; xrechnung: number; en16931: number } {
  const { generated, curated } = load();
  const all = [...generated.values()];
  return {
    total: all.length,
    curated: Object.keys(curated).length,
    xrechnung: all.filter((r) => r.source === "xrechnung").length,
    en16931: all.filter((r) => r.source === "en16931").length,
  };
}

/** Consistency checks (run by `pnpm kb:lint` and the rules test suite). Returns human-readable problems. */
export function lintKb(): string[] {
  const { generated, curated } = load();
  const problems: string[] = [];
  for (const id of generated.keys()) {
    if (/^BR-DE-/.test(id) && !curated[id]) problems.push(`missing curated entry for ${id}`);
  }
  for (const [id, c] of Object.entries(curated)) {
    if (!generated.has(id)) problems.push(`curated ${id} is not in any bundled rule set`);
    for (const lang of ["de", "en"] as const) {
      if (!c.explanation?.[lang]) problems.push(`${id}: explanation.${lang} missing`);
      if (!c.fixHint?.[lang]) problems.push(`${id}: fixHint.${lang} missing`);
    }
  }
  return problems;
}
