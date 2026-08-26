/**
 * NFR-5 hardening at the MCP boundary: hostile inputs must fail cleanly — a tool error or a
 * finding, never a crash, stack trace, file-content leak or unbounded work.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";

const sample = (name: string) => fileURLToPath(new URL(`../samples/${name}`, import.meta.url));
const coreFixture = (name: string) =>
  fileURLToPath(new URL(`../../core/fixtures/detect/${name}`, import.meta.url));

let client: Client;
let tmp: string;
beforeAll(async () => {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer().connect(b);
  client = new Client({ name: "security", version: "0" });
  await client.connect(a);
  tmp = mkdtempSync(join(tmpdir(), "kontor-sec-"));
});
afterAll(async () => {
  await client.close();
  rmSync(tmp, { recursive: true, force: true });
});

async function call(name: string, args: Record<string, unknown>) {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
  return { isError: !!r.isError, text, sc: (r.structuredContent ?? {}) as Record<string, unknown> };
}
const SECRET = "KONTOR_SECRET_MARKER_5f3a";

describe("XML attacks through the tool boundary", () => {
  it("XXE and billion-laughs are rejected as KONTOR-XML-DTD; nothing is resolved or expanded", async () => {
    for (const f of ["attack-xxe.xml", "attack-billion-laughs.xml"]) {
      const t0 = performance.now();
      const r = await call("validate_invoice", { file_path: coreFixture(f) });
      expect(performance.now() - t0).toBeLessThan(2000);
      expect(r.isError || r.sc.verdict === "invalid").toBe(true);
      expect(`${r.text}${JSON.stringify(r.sc)}`).toMatch(/KONTOR-XML-DTD|DOCTYPE/);
      expect(r.text).not.toMatch(/root:|\/etc\/passwd content/);
    }
  });
  it("parameter-entity XXE via content_base64 is rejected the same way", async () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY % p SYSTEM "http://127.0.0.1:9/evil.dtd"> %p;]><Invoice/>`;
    const r = await call("parse_invoice", { content_base64: Buffer.from(xml).toString("base64") });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/DOCTYPE|DTD/);
  });
  it("deeply nested XML is rejected by depth, not by stack overflow", async () => {
    const depth = 5000;
    const xml = `${"<a>".repeat(depth)}x${"</a>".repeat(depth)}`;
    const r = await call("parse_invoice", { content_base64: Buffer.from(xml).toString("base64") });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/depth|nest/i);
    expect(r.text).not.toMatch(/Maximum call stack/);
  });
  it("oversized content_base64 is refused before parsing (KONTOR_MAX_FILE_MB)", async () => {
    const prev = process.env.KONTOR_MAX_FILE_MB;
    process.env.KONTOR_MAX_FILE_MB = "1";
    try {
      const big = Buffer.alloc(1_100_000, 0x20).toString("base64");
      const r = await call("parse_invoice", { content_base64: big });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/KONTOR_MAX_FILE_MB|limit/);
    } finally {
      if (prev === undefined) delete process.env.KONTOR_MAX_FILE_MB;
      else process.env.KONTOR_MAX_FILE_MB = prev;
    }
  });
});

describe("path hygiene (file_path)", () => {
  it("rejects traversal, relative, directory, wrong extension and special files with a clean message", async () => {
    const dir = join(tmp, "dir.xml");
    mkdirSync(dir);
    for (const p of [
      "../../etc/passwd",
      `${sample("valid-xrechnung-ubl.xml")}/../../../../../../etc/hosts`,
      "/etc/hosts",
      "/dev/null",
      dir,
      "samples/valid-xrechnung-ubl.xml",
    ]) {
      const r = await call("validate_invoice", { file_path: p });
      expect(r.isError, p).toBe(true);
      expect(r.text).not.toMatch(/\n\s+at /);
      expect(r.text).not.toMatch(/127\.0\.0\.1\s+localhost/); // never echoes file content
    }
  });
  it("a .xml symlink to a non-XML secret is read but never echoed back", async () => {
    const secret = join(tmp, "secret.txt");
    writeFileSync(secret, `${SECRET}\nroot:x:0:0`);
    const link = join(tmp, "link.xml");
    symlinkSync(secret, link);
    const r = await call("parse_invoice", { file_path: link });
    expect(r.isError).toBe(true);
    expect(r.text).not.toContain(SECRET);
  });
});

describe("output_path hygiene (generate_invoice / convert_invoice)", () => {
  const invoice = {
    number: "RE-1",
    issueDate: "2026-08-25",
    dueDate: "2026-09-24",
    buyerReference: "04011000-12345-03",
    seller: {
      name: "S",
      vatId: "DE123456789",
      address: { street: "a", city: "b", postCode: "10115" },
      contactName: "c",
      phone: "+49 30 1234567",
      email: "s@example.org",
    },
    buyer: {
      name: "B",
      email: "b@example.org",
      address: { street: "a", city: "b", postCode: "53113" },
    },
    payment: { iban: "DE75512108001245126199" },
    lines: [{ description: "x", quantity: 1, unit: "HUR", netPrice: 1 }],
  };
  it("never overwrites, never writes to a directory, a wrong extension or a relative path (parent dirs are created by design)", async () => {
    const existing = join(tmp, "existing.xml");
    writeFileSync(existing, SECRET);
    const cases: Array<[string, RegExp]> = [
      [existing, /exists|overwrite/i],
      [tmp, /\.xml|extension|director/i],
      [join(tmp, "out.exe"), /\.xml|extension/i],
      ["relative/out.xml", /absolute/i],
    ];
    for (const [p, re] of cases) {
      const r = await call("generate_invoice", { invoice, output_path: p });
      expect(r.isError, p).toBe(true);
      expect(r.text, p).toMatch(re);
      expect(r.text).not.toMatch(/\n\s+at /);
    }
    expect(readFileSync(existing, "utf8")).toBe(SECRET);
    const conv = await call("convert_invoice", {
      file_path: sample("valid-xrechnung-ubl.xml"),
      target: "cii",
      output_path: existing,
    });
    expect(conv.isError).toBe(true);
  });
});

describe("PDF attacks", () => {
  it("encrypted PDF, fake PDF and garbage are rejected cleanly", async () => {
    for (const f of ["encrypted.pdf", "fake.pdf"]) {
      const r = await call("parse_invoice", { file_path: coreFixture(f) });
      expect(r.isError, f).toBe(true);
      expect(r.text).not.toMatch(/\n\s+at /);
    }
    const r = await call("parse_invoice", {
      content_base64: Buffer.from("%PDF-1.7\n garbage").toString("base64"),
      content_type: "application/pdf",
    });
    expect(r.isError).toBe(true);
  });
});
