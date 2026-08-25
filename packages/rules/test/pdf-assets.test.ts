import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadPdfAsset, PDF_ASSETS } from "../src/index.js";

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("bundled PDF assets (Task 2.7) — bytes match PROVENANCE.md", () => {
  it("Liberation Sans 2.1.5 Regular + Bold (SIL OFL 1.1)", () => {
    expect(sha256(loadPdfAsset("LiberationSans-Regular.ttf"))).toBe(
      "76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8",
    );
    expect(sha256(loadPdfAsset("LiberationSans-Bold.ttf"))).toBe(
      "788abee4c806d660e8aee46689dd8540cd4bb98da03dcc9d171ce3efd99a9173",
    );
  });
  it("sRGB2014.icc from color.org, unaltered", () => {
    expect(sha256(loadPdfAsset("sRGB2014.icc"))).toBe(
      "384b832de3412066743b52a75ee906b6fb9fb8d9e09e936fc2c43223815c6e0a",
    );
  });
  it("declares versions and licences", () => {
    expect(PDF_ASSETS.font.version).toBe("2.1.5");
    expect(PDF_ASSETS.font.license).toBe("OFL-1.1");
    expect(PDF_ASSETS.icc.name).toBe("sRGB2014.icc");
  });
  it("caches loaded bytes (same instance on repeat)", () => {
    expect(loadPdfAsset("sRGB2014.icc")).toBe(loadPdfAsset("sRGB2014.icc"));
  });
});
