/** Legal timeline data for check_obligations (T7): facts with sources and a "last verified" date. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const LEGAL_DIR: string = fileURLToPath(new URL("../legal/", import.meta.url));

export interface LegalSource {
  title: string;
  url: string;
  quote?: string;
}
export interface LegalFact {
  value: string | number | boolean | string[];
  sources: string[];
}
export interface LegalTimeline {
  lastVerified: string;
  verifiedBy: string;
  sources: Record<string, LegalSource>;
  facts: Record<string, LegalFact>;
}

let cached: LegalTimeline | undefined;
export function loadLegalTimeline(): LegalTimeline {
  if (!cached)
    cached = JSON.parse(readFileSync(join(LEGAL_DIR, "timeline.json"), "utf8")) as LegalTimeline;
  return cached;
}
