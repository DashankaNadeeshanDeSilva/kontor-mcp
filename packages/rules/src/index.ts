/**
 * @kontor-mcp/rules — bundled standards artifacts (D-018) and, from Task 1.5, the rule knowledge base.
 * Artifacts are produced by `pnpm rules:build` (tools/build-rules-artifacts.ts); see artifacts/MANIFEST.json and PROVENANCE.md.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

export const RULES_PACKAGE = "@kontor-mcp/rules" as const;

/** Versions of bundled standards (kept in sync with PROVENANCE.md / artifacts/MANIFEST.json). */
export const bundledStandards = {
  xrechnung: "3.0.2",
  xrechnungSchematron: "2.5.0",
  validatorConfiguration: "2026-01-31",
  en16931: "1.3.16",
  ublXsd: "2.1",
  ciiXsd: "D16B",
} as const;

export const ARTIFACT_DIR: string = fileURLToPath(new URL("../artifacts/", import.meta.url));

export type StylesheetName =
  | "EN16931-UBL-validation"
  | "EN16931-CII-validation"
  | "XRechnung-UBL-validation"
  | "XRechnung-CII-validation";

export type ScenarioSyntax = "ubl-invoice" | "ubl-creditnote" | "cii";
export type KositLevel = "information" | "warning" | "error";

/** One KoSIT validator scenario (projection of scenarios.xml, D-017). */
export interface Scenario {
  name: string;
  syntax: ScenarioSyntax;
  /** Exact CustomizationID / GuidelineSpecifiedDocumentContextParameter value the scenario matches. */
  customizationId: string;
  /** Stylesheets in execution order. */
  schematron: StylesheetName[];
  /** Per-scenario severity overrides (rule id → level). */
  customLevels: Record<string, KositLevel>;
}

let scenariosCache: readonly Scenario[] | undefined;
export function loadScenarios(): readonly Scenario[] {
  scenariosCache ??= JSON.parse(
    readFileSync(join(ARTIFACT_DIR, "scenarios.json"), "utf8"),
  ) as Scenario[];
  return scenariosCache;
}

const sefCache = new Map<StylesheetName, unknown>();
/** Parsed SEF (Saxon-JS `stylesheetInternal`), cached for the process lifetime (NFR-3). */
export function loadSef(name: StylesheetName): unknown {
  let sef = sefCache.get(name);
  if (!sef) {
    sef = JSON.parse(
      gunzipSync(readFileSync(join(ARTIFACT_DIR, "sef", `${name}.sef.json.gz`))).toString("utf8"),
    );
    sefCache.set(name, sef);
  }
  return sef;
}

export interface XsdFile {
  fileName: string;
  contents: string;
}
export interface XsdSet {
  /** The main schema document. */
  main: XsdFile;
  /** Imported/included schemas (file names relative to the set root). */
  preload: XsdFile[];
}

const xsdCache = new Map<ScenarioSyntax, XsdSet>();
/** XSD set for a syntax; file names keep the relative layout the schemaLocation hints expect. */
export function loadXsdSet(syntax: ScenarioSyntax): XsdSet {
  let set = xsdCache.get(syntax);
  if (set) return set;
  const read = (dir: string, file: string): XsdFile => ({
    fileName: file,
    contents: readFileSync(join(ARTIFACT_DIR, "xsd", dir, file), "utf8"),
  });
  if (syntax === "cii") {
    const files = readdirSync(join(ARTIFACT_DIR, "xsd/cii")).filter((f) => f.endsWith(".xsd"));
    const mainName = "CrossIndustryInvoice_100pD16B.xsd";
    set = {
      main: read("cii", mainName),
      preload: files.filter((f) => f !== mainName).map((f) => read("cii", f)),
    };
  } else {
    const mainName =
      syntax === "ubl-invoice" ? "maindoc/UBL-Invoice-2.1.xsd" : "maindoc/UBL-CreditNote-2.1.xsd";
    const common = readdirSync(join(ARTIFACT_DIR, "xsd/ubl/common")).filter((f) =>
      f.endsWith(".xsd"),
    );
    set = { main: read("ubl", mainName), preload: common.map((f) => read("ubl", `common/${f}`)) };
  }
  xsdCache.set(syntax, set);
  return set;
}

export * from "./codelists.js";
export * from "./kb.js";
export * from "./legal.js";
