import { describe, expect, it } from "vitest";
import type { Finding } from "../src/index.js";

describe("Finding model", () => {
  it("accepts a minimal finding shaped per PRD §5.2", () => {
    const f: Finding = {
      ruleId: "BR-DE-15",
      severity: "error",
      source: "schematron-xrechnung",
      message: "Buyer reference MUST be provided",
    };
    expect(f.ruleId).toBe("BR-DE-15");
  });
});
