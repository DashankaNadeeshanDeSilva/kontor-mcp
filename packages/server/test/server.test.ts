import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";

const sample = (name: string) => fileURLToPath(new URL(`../samples/${name}`, import.meta.url));
const b64 = (name: string) => readFileSync(sample(name)).toString("base64");

let client: Client;
beforeAll(async () => {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer().connect(b);
  client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(a);
});
afterAll(async () => {
  await client.close();
});

type Structured = Record<string, unknown>;
async function call(name: string, args: Record<string, unknown>) {
  const r = await client.callTool({ name, arguments: args });
  return {
    ...r,
    sc: (r.structuredContent ?? {}) as Structured,
    text: (r.content as Array<{ text?: string }>)[0]?.text ?? "",
  };
}

describe("kontor-mcp server (Task 1.6)", () => {
  it("lists parse_invoice, validate_invoice, explain_rule with annotations and output schemas", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["explain_rule", "parse_invoice", "validate_invoice"]);
    for (const t of tools) {
      expect(t.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
      expect(t.outputSchema).toBeDefined();
      expect(t.title).toBeTruthy();
    }
  });

  it("parse_invoice via file_path returns format + typed model + annotated model", async () => {
    const r = await call("parse_invoice", { file_path: sample("valid-xrechnung-ubl.xml") });
    expect(r.isError).toBeFalsy();
    expect(r.sc.format).toMatchObject({
      container: "xml",
      syntax: "ubl-invoice",
      cius: "xrechnung",
      version: "3.0",
    });
    expect((r.sc.invoice as Structured).number).toBe("123456XX");
    expect((r.sc.invoiceAnnotated as Structured).number).toEqual({ bt: "BT-1", value: "123456XX" });
    expect(r.text).toContain("123456XX");
  });

  it("parse_invoice via content_base64 handles a ZUGFeRD PDF end-to-end", async () => {
    const r = await call("parse_invoice", {
      content_base64: b64("valid-zugferd-en16931.pdf"),
      content_type: "application/pdf",
    });
    expect(r.isError).toBeFalsy();
    expect(r.sc.format).toMatchObject({ container: "pdf", syntax: "cii", profile: "en16931" });
    expect((r.sc.pdf as Structured).filename).toBe("factur-x.xml");
  });

  it("validate_invoice rejects the broken sample with BR-DE-15 enriched from the KB", async () => {
    const r = await call("validate_invoice", {
      file_path: sample("broken-missing-buyer-reference.xml"),
      lang: "en",
    });
    expect(r.isError).toBeFalsy();
    expect(r.sc.verdict).toBe("invalid");
    const findings = r.sc.findings as Array<Structured>;
    const f = findings.find((x) => x.ruleId === "BR-DE-15");
    expect(f?.severity).toBe("error");
    expect((f?.explanation as Structured)?.en).toMatch(/buyer reference/i);
    expect((f?.fixHint as Structured)?.de).toBeTruthy();
    expect(r.sc.stats).toMatchObject({ error: 1 });
    expect((r.sc.ruleSets as Array<Structured>).map((x) => x.name)).toContain(
      "XRechnung Schematron",
    );
    expect(r.text).toMatch(/INVALID/);
    expect(r.text).toContain("BR-DE-15");
  });

  it("validate_invoice returns valid_with_warnings / valid and respects skip_layers", async () => {
    const a = await call("validate_invoice", { file_path: sample("valid-xrechnung-cii.xml") });
    expect(["valid", "valid_with_warnings"]).toContain(a.sc.verdict);
    const b = await call("validate_invoice", {
      file_path: sample("broken-missing-buyer-reference.xml"),
      skip_layers: ["schematron"],
    });
    expect(b.sc.verdict).toBe("valid");
    expect((b.sc.layers as Structured).schematron).toBe("skipped");
  });

  it("explain_rule returns curated DE text by default and suggestions for unknown ids", async () => {
    const r = await call("explain_rule", { rule_id: "br-de-15" });
    expect(r.sc.found).toBe(true);
    expect((r.sc.entry as Structured).ruleId).toBe("BR-DE-15");
    expect(r.text).toMatch(/Leitweg/);
    expect(r.text).toMatch(/keine (steuerliche|Rechts)/i);
    const u = await call("explain_rule", { rule_id: "BR-DE-99", lang: "en" });
    expect(u.sc.found).toBe(false);
    expect((u.sc.suggestions as string[]).length).toBeGreaterThan(0);
    expect(u.isError).toBeFalsy();
  });

  it("enforces input hygiene (NFR-5): absolute path, existence, extension, size, exactly one source", async () => {
    for (const args of [
      {},
      { file_path: "samples/valid-xrechnung-ubl.xml" },
      { file_path: sample("does-not-exist.xml") },
      { file_path: fileURLToPath(new URL("../package.json", import.meta.url)) },
      { file_path: sample("valid-xrechnung-ubl.xml"), content_base64: "PGE+" },
      { content_base64: "!!!not base64!!!" },
    ]) {
      const r = await call("parse_invoice", args);
      expect(r.isError, JSON.stringify(args)).toBe(true);
      expect(r.text).not.toMatch(/\n\s+at /); // no stack traces
    }
  });

  it("serves the sample invoices as kontor://samples/{name} resources", async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((x) => x.uri);
    expect(uris).toContain("kontor://samples/valid-xrechnung-ubl.xml");
    expect(uris).toContain("kontor://samples/valid-zugferd-en16931.pdf");
    const xml = await client.readResource({
      uri: "kontor://samples/broken-missing-buyer-reference.xml",
    });
    expect(xml.contents[0]).toMatchObject({ mimeType: "application/xml" });
    expect((xml.contents[0] as { text?: string }).text).toMatch(/<(ubl:)?Invoice/);
    const pdf = await client.readResource({ uri: "kontor://samples/valid-zugferd-en16931.pdf" });
    expect((pdf.contents[0] as { blob?: string }).blob?.length).toBeGreaterThan(1000);
    await expect(
      client.readResource({ uri: "kontor://samples/../package.json" }),
    ).rejects.toThrow();
  });
});
