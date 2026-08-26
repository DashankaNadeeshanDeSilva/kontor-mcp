import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SERVER_VERSION } from "../src/server-meta.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const read = (p: string) => readFileSync(join(root, p), "utf8");
const json = (p: string) => JSON.parse(read(p)) as Record<string, unknown>;

describe("version sites agree (bump with tools/bump-version.sh)", () => {
  const sites: Record<string, string> = {};
  for (const p of ["rules", "core", "server", "client"]) {
    sites[`packages/${p}/package.json`] = json(`packages/${p}/package.json`).version as string;
  }
  const meta = json("packages/server/server.json") as {
    version: string;
    packages: { registryType: string; version?: string; identifier: string }[];
  };
  sites["server.json#version"] = meta.version;
  meta.packages.forEach((pkg, i) => {
    // OCI entries carry the version as the image tag in the identifier (registry rule); others in `version`.
    sites[`server.json#packages[${i}]`] =
      pkg.registryType === "oci" ? (pkg.identifier.split(":")[1] ?? "") : (pkg.version ?? "");
  });
  sites["SERVER_VERSION"] = SERVER_VERSION;
  sites["CLIENT_VERSION"] =
    /CLIENT_VERSION = "([^"]+)"/.exec(read("packages/client/src/connect.ts"))?.[1] ?? "";

  it("all nine sites equal SERVER_VERSION", () => {
    expect(Object.keys(sites).length).toBe(9);
    for (const [site, v] of Object.entries(sites)) expect(v, site).toBe(SERVER_VERSION);
  });
  it("version is a plain semver (no v prefix — the image tag is derived from it)", () => {
    expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it("CHANGELOG has a section for it", () => {
    expect(read("CHANGELOG.md")).toContain(`## [${SERVER_VERSION}]`);
  });
});
