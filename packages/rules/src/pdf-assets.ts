/**
 * Bundled PDF assets for ZUGFeRD PDF/A-3 generation (Task 2.7): embedded font + OutputIntent ICC profile.
 * Loaded from disk once per process; never fetched (NFR-2). Provenance: PROVENANCE.md "PDF assets".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const PDF_ASSET_DIR: string = fileURLToPath(new URL("../pdf/", import.meta.url));

export type PdfAssetName =
  | "LiberationSans-Regular.ttf"
  | "LiberationSans-Bold.ttf"
  | "sRGB2014.icc";

export const PDF_ASSETS = {
  font: {
    family: "Liberation Sans",
    version: "2.1.5",
    license: "OFL-1.1",
    regular: "LiberationSans-Regular.ttf" as const,
    bold: "LiberationSans-Bold.ttf" as const,
  },
  icc: {
    name: "sRGB2014.icc" as const,
    identifier: "sRGB IEC61966-2.1",
    registry: "http://www.color.org",
  },
} as const;

const cache = new Map<PdfAssetName, Uint8Array>();
export function loadPdfAsset(name: PdfAssetName): Uint8Array {
  let bytes = cache.get(name);
  if (!bytes) {
    bytes = new Uint8Array(readFileSync(join(PDF_ASSET_DIR, name)));
    cache.set(name, bytes);
  }
  return bytes;
}
