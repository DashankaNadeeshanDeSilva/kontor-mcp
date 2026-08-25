/** EN 16931 code lists extracted from the pinned validation artefacts (tools/build-codelists.ts). */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const CODELISTS_DIR: string = fileURLToPath(new URL("../codelists/", import.meta.url));

export interface Codelist {
  list: string;
  title: { de: string; en: string };
  standard: string;
  rule: string;
  source: string;
  count: number;
  codes: string[];
  /** Curated DE/EN names for the commonly used codes (subset). */
  common: Record<string, { de: string; en: string }>;
}

export function listCodelists(): string[] {
  return readdirSync(CODELISTS_DIR)
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

const cache = new Map<string, Codelist>();
export function loadCodelist(name: string): Codelist | undefined {
  if (!/^[a-z0-9-]+$/.test(name) || !listCodelists().includes(name)) return undefined;
  let c = cache.get(name);
  if (!c) {
    c = JSON.parse(readFileSync(join(CODELISTS_DIR, `${name}.json`), "utf8")) as Codelist;
    cache.set(name, c);
  }
  return c;
}
