/**
 * Task 1.4 AC: verdict parity with the KoSIT oracle over the entire official XRechnung test suite.
 * Oracle verdicts are recorded by `pnpm oracle` (needs Java) into fixtures/conformance/oracle-verdicts.txt;
 * the suite instances come from `pnpm artifacts`. Skipped when the downloads are absent.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateInvoice } from "../src/validate/index.js";

const root = new URL(
  "../../../fixtures/_downloads/xrechnung-testsuite/instances/",
  import.meta.url,
);
const verdictsFile = new URL("../../../fixtures/conformance/oracle-verdicts.txt", import.meta.url);
const available = existsSync(root) && existsSync(verdictsFile);

const oracle = new Map<string, "accept" | "reject">();
if (available) {
  for (const line of readFileSync(verdictsFile, "utf8").split("\n")) {
    const [name, v] = line.trim().split(/\s+/);
    if (name && (v === "accept" || v === "reject")) oracle.set(name, v);
  }
}

describe.skipIf(!available)(
  "conformance — official XRechnung test suite vs KoSIT oracle verdicts",
  () => {
    const files: Array<[string, string]> = [];
    const walk = (rel: string) => {
      for (const e of readdirSync(new URL(rel, root), { withFileTypes: true })) {
        if (e.isDirectory()) walk(`${rel}${e.name}/`);
        else if (e.name.endsWith(".xml")) files.push([rel, e.name]);
      }
    };
    if (available) walk("");
    it("covers the whole suite", () => expect(files.length).toBeGreaterThanOrEqual(86));
    for (const [dir, f] of files) {
      const expected = oracle.get(f.replace(/\.xml$/, ""));
      it.skipIf(!expected)(`${dir}${f} → ${expected}`, async () => {
        const r = await validateInvoice(readFileSync(new URL(`${dir}${f}`, root)));
        expect(r.valid ? "accept" : "reject").toBe(expected);
      });
    }
  },
);
