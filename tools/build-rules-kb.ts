/**
 * Generates packages/rules/kb/generated.json — one baseline entry per Schematron assert (id, flag, official text,
 * XPath test per syntax, referenced BTs) from the pinned .sch sources. Curated texts live in kb/curated.json.
 * Usage: pnpm artifacts && pnpm kb:build
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const DL = join(root, "fixtures/_downloads");

const SOURCES: Array<{ file: string; source: "en16931" | "xrechnung"; syntax: "ubl" | "cii" }> = [
  {
    file: "en16931-ubl/schematron/preprocessed/EN16931-UBL-validation-preprocessed.sch",
    source: "en16931",
    syntax: "ubl",
  },
  {
    file: "en16931-cii/schematron/preprocessed/EN16931-CII-validation-preprocessed.sch",
    source: "en16931",
    syntax: "cii",
  },
  {
    file: "xrechnung-schematron/schematron/ubl/XRechnung-UBL-validation.sch",
    source: "xrechnung",
    syntax: "ubl",
  },
  {
    file: "xrechnung-schematron/schematron/cii/XRechnung-CII-validation.sch",
    source: "xrechnung",
    syntax: "cii",
  },
];

export interface GeneratedRule {
  ruleId: string;
  source: "en16931" | "xrechnung";
  /** SVRL flag as written in the Schematron. */
  flag: "fatal" | "warning" | "information";
  officialText: string;
  syntaxes: Array<"ubl" | "cii">;
  test: Partial<Record<"ubl" | "cii", string>>;
  context: Partial<Record<"ubl" | "cii", string>>;
  bt: string[];
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
const cleanText = (s: string) =>
  decode(
    s
      .replace(/<value-of[^>]*select="([^"]*)"[^>]*\/>/g, "{$1}")
      .replace(/<name\s*\/>/g, "{element}")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();

const rules = new Map<string, GeneratedRule>();
for (const src of SOURCES) {
  const text = readFileSync(join(DL, src.file), "utf8");
  const ruleRe = /<(?:sch:)?rule\b((?:\s+[\w:.-]+="[^"]*")*)\s*>([\s\S]*?)<\/(?:sch:)?rule>/g;
  for (const rm of text.matchAll(ruleRe)) {
    const context = decode(/\bcontext="([^"]*)"/.exec(rm[1] ?? "")?.[1] ?? "");
    const assertRe =
      /<(?:sch:)?assert\b((?:\s+[\w:.-]+="[^"]*")*)\s*>([\s\S]*?)<\/(?:sch:)?assert>/g;
    for (const am of (rm[2] ?? "").matchAll(assertRe)) {
      const attrs = am[1] ?? "";
      const id = /\bid="([^"]*)"/.exec(attrs)?.[1];
      if (!id) continue;
      const flag = (/\bflag="([^"]*)"/.exec(attrs)?.[1] ?? "fatal") as GeneratedRule["flag"];
      const test = decode(/\btest="([^"]*)"/.exec(attrs)?.[1] ?? "");
      const officialText = cleanText(am[2] ?? "");
      let r = rules.get(id);
      if (!r) {
        r = {
          ruleId: id,
          source: src.source,
          flag,
          officialText,
          syntaxes: [],
          test: {},
          context: {},
          bt: [],
        };
        rules.set(id, r);
      }
      if (!r.syntaxes.includes(src.syntax)) r.syntaxes.push(src.syntax);
      if (!r.test[src.syntax]) r.test[src.syntax] = test;
      if (!r.context[src.syntax]) r.context[src.syntax] = context;
      if (officialText.length > r.officialText.length) r.officialText = officialText;
    }
  }
}
for (const r of rules.values()) {
  const refs = new Set<string>();
  for (const m of r.officialText.matchAll(/\b(B[TG]-(?:DEX-)?\d{1,3})\b/g)) refs.add(m[1] ?? "");
  r.bt = [...refs].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  r.syntaxes.sort();
}
const out = [...rules.values()].sort((a, b) =>
  a.ruleId.localeCompare(b.ruleId, undefined, { numeric: true }),
);
writeFileSync(join(root, "packages/rules/kb/generated.json"), `${JSON.stringify(out, null, 1)}\n`);
console.log(
  `generated ${out.length} rule entries (${out.filter((r) => r.source === "xrechnung").length} XRechnung)`,
);
