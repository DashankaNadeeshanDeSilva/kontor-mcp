import { describe, expect, it } from "vitest";
import { CLIENT_NAME } from "../src/index.js";

describe("@kontor-mcp/client placeholder", () => {
  it("exports the CLI name", () => {
    expect(CLIENT_NAME).toBe("kontor-agent");
  });
});
