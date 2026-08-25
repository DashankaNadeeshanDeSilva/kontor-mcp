/**
 * Builds the runtime artifacts bundled in @kontor-mcp/rules (D-018) from the pinned downloads:
 *   packages/rules/artifacts/sef/*.sef.json.gz   — Saxon-JS SEFs (compile-sef.sh, incl. D-019 patch), gzipped
 *   packages/rules/artifacts/xsd/{ubl,cii}/…     — XSD subset the KoSIT scenarios reference
 *   packages/rules/artifacts/scenarios.json      — typed projection of KoSIT scenarios.xml (D-017)
 *   packages/rules/artifacts/MANIFEST.json       — source versions + sha256 of every produced file
 * Usage: pnpm artifacts && pnpm rules:build
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { loadXml } from "../packages/core/src/xml/index.js";

const root = resolve(new URL("..", import.meta.url).pathname);
const DL = join(root, "fixtures/_downloads");
const CONF = join(DL, "xrechnung-validator-configuration");
const SEF_SRC = join(DL, "sef");
const OUT = join(root, "packages/rules/artifacts");

const SHEETS = [
  "EN16931-UBL-validation",
  "EN16931-CII-validation",
  "XRechnung-UBL-validation",
  "XRechnung-CII-validation",
];

if (!existsSync(CONF)) throw new Error("run `pnpm artifacts` first (fixtures/_downloads missing)");
if (SHEETS.some((s) => !existsSync(join(SEF_SRC, `${s}.sef.json`)))) {
  console.log("compiling SEFs (tools/compile-sef.sh)…");
  execFileSync("sh", [join(root, "tools/compile-sef.sh")], { stdio: "inherit", cwd: root });
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "sef"), { recursive: true });

// 1) SEFs → gzip
for (const s of SHEETS) {
  const raw = readFileSync(join(SEF_SRC, `${s}.sef.json`));
  writeFileSync(join(OUT, "sef", `${s}.sef.json.gz`), gzipSync(raw, { level: 9 }));
}

// 2) XSD subset
cpSync(join(CONF, "resources/ubl/2.1/xsd/common"), join(OUT, "xsd/ubl/common"), {
  recursive: true,
});
mkdirSync(join(OUT, "xsd/ubl/maindoc"), { recursive: true });
for (const f of ["UBL-Invoice-2.1.xsd", "UBL-CreditNote-2.1.xsd"]) {
  cpSync(join(CONF, "resources/ubl/2.1/xsd/maindoc", f), join(OUT, "xsd/ubl/maindoc", f));
}
cpSync(join(CONF, "resources/cii/16b/xsd"), join(OUT, "xsd/cii"), { recursive: true });

// 3) scenarios.xml → scenarios.json
const sx = loadXml(readFileSync(join(CONF, "scenarios.xml")));
const S = "http://www.xoev.de/de/validator/framework/1/scenarios";
const scenarios = sx.nodes(`/*[local-name()='scenarios']/*[local-name()='scenario']`).map((n) => {
  const q = (p: string) => sx.string(p, n);
  const match = q("*[local-name()='match']");
  const customizationId = /'([^']+)'/.exec(match)?.[1] ?? "";
  const rootEl =
    /\/(invoice:Invoice|creditnote:CreditNote|rsm:CrossIndustryInvoice)/.exec(match)?.[1] ?? "";
  const syntax =
    rootEl === "invoice:Invoice"
      ? "ubl-invoice"
      : rootEl === "creditnote:CreditNote"
        ? "ubl-creditnote"
        : "cii";
  const schematron = sx
    .nodes(
      "*[local-name()='validateWithSchematron']/*[local-name()='resource']/*[local-name()='location']",
      n,
    )
    .map((l) =>
      String((l as { textContent: string | null }).textContent ?? "")
        .replace(/^.*\//, "")
        .replace(/\.xsl$/, ""),
    );
  const customLevels: Record<string, string> = {};
  for (const c of sx.nodes("*[local-name()='createReport']/*[local-name()='customLevel']", n)) {
    const el = c as unknown as {
      textContent: string | null;
      getAttribute(n: string): string | null;
    };
    customLevels[String(el.textContent ?? "").trim()] = el.getAttribute("level") ?? "error";
  }
  return { name: q("*[local-name()='name']"), syntax, customizationId, schematron, customLevels };
});
if (scenarios.length !== 11) throw new Error(`expected 11 scenarios, got ${scenarios.length}`);
void S;
writeFileSync(join(OUT, "scenarios.json"), `${JSON.stringify(scenarios, null, 2)}\n`);

// 4) manifest
const files: Record<string, string> = {};
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f !== "MANIFEST.json")
      files[relative(OUT, p)] = createHash("sha256").update(readFileSync(p)).digest("hex");
  }
};
walk(OUT);
const manifest = {
  generatedBy: "tools/build-rules-artifacts.ts",
  sources: {
    "xrechnung-validator-configuration": "2026-01-31 (XRechnung 3.0.2, Schematron 2.5.0)",
    en16931: "1.3.16",
    "saxon-js": JSON.parse(readFileSync(join(root, "node_modules/saxon-js/package.json"), "utf8"))
      .version,
    patches: ["D-019: BR-DE-19 IBAN xs:integer→xs:decimal (tools/compile-sef.sh)"],
  },
  files,
};
writeFileSync(join(OUT, "MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`built ${Object.keys(files).length} artifact files into packages/rules/artifacts`);
