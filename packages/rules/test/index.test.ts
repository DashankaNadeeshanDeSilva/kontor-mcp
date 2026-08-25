import { describe, expect, it } from "vitest";
import { RULES_PACKAGE } from "../src/index.js";

describe("@kontor-mcp/rules placeholder", () => {
  it("exports its package name", () => {
    expect(RULES_PACKAGE).toBe("@kontor-mcp/rules");
  });
});
