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
  it("lists parse_invoice, validate_invoice, audit_invoice, explain_rule with annotations and output schemas", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "audit_invoice",
      "convert_invoice",
      "explain_rule",
      "generate_invoice",
      "parse_invoice",
      "validate_invoice",
    ]);
    for (const t of tools) {
      expect(t.annotations).toMatchObject({
        readOnlyHint: !["generate_invoice", "convert_invoice"].includes(t.name),
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

describe("audit_invoice + Phase-2 server work (Task 2.2, F5, F10)", () => {
  it("lists audit_invoice with an output schema and advertises the attachment convention in instructions", async () => {
    const tools = await client.listTools();
    const audit = tools.tools.find((t) => t.name === "audit_invoice");
    expect(audit?.outputSchema).toBeTruthy();
    expect(audit?.description).toMatch(/content_base64/);
    expect(client.getInstructions()).toMatch(/content_base64/);
  });

  it("audit_invoice: broken sample → reject with header facts, tax breakdown and rationale", async () => {
    const r = await call("audit_invoice", {
      file_path: sample("broken-missing-buyer-reference.xml"),
      lang: "en",
    });
    expect(r.isError).toBeFalsy();
    expect(r.sc.recommendation).toBe("reject");
    expect(r.sc.verdict).toBe("invalid");
    const header = r.sc.header as Structured;
    expect(Array.isArray(header.taxBreakdown)).toBe(true);
    expect((header.taxBreakdown as Structured[]).length).toBeGreaterThan(0);
    expect((r.sc.rationale as Structured).en).toMatch(/BR-DE-15/);
    expect(r.text).toMatch(/Recommendation: REJECT/);
    expect(r.text).toMatch(/VAT breakdown \(BG-23\)/);
    expect(r.text).toContain("not tax or legal advice");
  });

  it("audit_invoice: ZUGFeRD PDF via file_path carries pdf provenance; duplicates → review (DE text)", async () => {
    const r = await call("audit_invoice", { file_path: sample("valid-zugferd-en16931.pdf") });
    expect(r.isError).toBeFalsy();
    const header = r.sc.header as Structured;
    expect(((header.source as Structured)?.pdf as Structured)?.filename).toBeTruthy();
    expect(r.text).toMatch(/Empfehlung: /);

    const parsed = await call("parse_invoice", { file_path: sample("valid-xrechnung-ubl.xml") });
    const number = (parsed.sc.invoice as Structured).number as string;
    const dup = await call("audit_invoice", {
      file_path: sample("valid-xrechnung-ubl.xml"),
      known_invoice_numbers: [number],
    });
    expect(dup.sc.recommendation).toBe("review");
    expect(dup.text).toMatch(/Empfehlung: PRÜFEN/);
  });

  it("distinguishes a missing file from an unreadable one (F10: macOS privacy hint)", async () => {
    const missing = await call("parse_invoice", { file_path: sample("nope.xml") });
    expect(missing.text).toMatch(/File not found/);
    expect(missing.text).not.toMatch(/Full Disk Access/);

    if (process.getuid?.() === 0 || process.platform === "win32") return; // chmod 000 is not enforced
    const { mkdtempSync, writeFileSync, chmodSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "kontor-eacces-"));
    const p = join(dir, "locked.xml");
    writeFileSync(p, "<a/>");
    chmodSync(p, 0o000);
    try {
      const locked = await call("parse_invoice", { file_path: p });
      expect(locked.isError).toBe(true);
      expect(locked.text).toMatch(/permission/i);
      expect(locked.text).toMatch(/Full Disk Access/);
      expect(locked.text).not.toMatch(/File not found/);
    } finally {
      chmodSync(p, 0o600);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("generate_invoice (Task 2.3)", () => {
  const invoice = {
    number: "RE-2026-0815",
    issueDate: "2026-08-25",
    dueDate: "2026-09-24",
    buyerReference: "04011000-12345-03",
    seller: {
      name: "Muster Consulting GmbH",
      vatId: "DE123456789",
      address: { street: "Musterstraße 1", city: "Berlin", postCode: "10115" },
      contactName: "Erika Muster",
      phone: "+49 30 1234567",
      email: "rechnung@muster-consulting.example",
    },
    buyer: {
      name: "Bundesamt für Beispiele",
      email: "rechnungseingang@bfb.example",
      address: { street: "Amtsweg 2", city: "Bonn", postCode: "53113" },
    },
    payment: { iban: "DE75512108001245126199" },
    lines: [{ description: "Beratung", quantity: 10, unit: "HUR", netPrice: 120 }],
  };

  it("is listed as a non-read-only tool and generates a valid XRechnung", async () => {
    const tools = await client.listTools();
    const t = tools.tools.find((x) => x.name === "generate_invoice");
    expect(t?.annotations?.readOnlyHint).toBe(false);
    expect(t?.annotations?.destructiveHint).toBe(false);

    const r = await call("generate_invoice", { invoice, lang: "en" });
    expect(r.isError).toBeFalsy();
    expect(r.sc.valid).toBe(true);
    expect(r.sc.plausible).toBe(true);
    expect(String(r.sc.xml)).toContain("xrechnung_3.0");
    expect((r.sc.totals as Structured).payable).toBe("1428.00");
    expect(r.text).toMatch(/VALID/);
    expect(r.text).toContain("1428.00");
  });

  it("is fail-honest: missing payment → valid:false with BR-DE findings, XML still returned", async () => {
    const { payment: _p, ...noPayment } = invoice;
    const r = await call("generate_invoice", { invoice: noPayment, lang: "de" });
    expect(r.isError).toBeFalsy();
    expect(r.sc.valid).toBe(false);
    expect((r.sc.findings as Structured[]).some((f) => String(f.ruleId).startsWith("BR-DE-"))).toBe(
      true,
    );
    expect(r.text).toMatch(/UNGÜLTIG/);
    expect(String(r.sc.xml)).toContain("<cbc:ID>RE-2026-0815</cbc:ID>");
  });

  it("writes to output_path (absolute .xml), refuses to overwrite unless asked", async () => {
    const { mkdtempSync, readFileSync: read, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "kontor-gen-"));
    const out = join(dir, "re-2026-0815.xml");
    try {
      const first = await call("generate_invoice", { invoice, output_path: out });
      expect(first.isError).toBeFalsy();
      expect(first.sc.writtenTo).toBe(out);
      expect(read(out, "utf8")).toContain("<cbc:ID>RE-2026-0815</cbc:ID>");

      const second = await call("generate_invoice", { invoice, output_path: out });
      expect(second.isError).toBe(true);
      expect(second.text).toMatch(/exists/);

      const third = await call("generate_invoice", { invoice, output_path: out, overwrite: true });
      expect(third.isError).toBeFalsy();

      const bad = await call("generate_invoice", { invoice, output_path: "relative.xml" });
      expect(bad.isError).toBe(true);
      const badExt = await call("generate_invoice", { invoice, output_path: join(dir, "x.txt") });
      expect(badExt.isError).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("convert_invoice (Task 2.4)", () => {
  it("extract-xml from a ZUGFeRD PDF and html-preview from UBL", async () => {
    const x = await call("convert_invoice", {
      file_path: sample("valid-zugferd-en16931.pdf"),
      target: "extract-xml",
    });
    expect(x.isError).toBeFalsy();
    expect(x.sc.mimeType).toBe("application/xml");
    expect(String(x.sc.artifact)).toContain("<rsm:CrossIndustryInvoice");
    expect(x.text).toMatch(/extract-xml/);

    const h = await call("convert_invoice", {
      file_path: sample("valid-xrechnung-ubl.xml"),
      target: "html-preview",
      lang: "en",
    });
    expect(h.sc.mimeType).toBe("text/html");
    expect(String(h.sc.artifact)).toMatch(/^<!DOCTYPE html>/);
    expect(String(h.sc.artifact)).not.toMatch(/<script/i);
  });

  it("UBL → cii is post-validated and reports loss; ZUGFeRD → xrechnung-ubl reports the pinned ID", async () => {
    const c = await call("convert_invoice", {
      file_path: sample("valid-xrechnung-ubl.xml"),
      target: "cii",
      lang: "de",
    });
    expect(c.isError).toBeFalsy();
    expect(c.sc.valid).toBe(true);
    expect(String(c.sc.artifact)).toContain("<rsm:CrossIndustryInvoice");
    expect(c.sc.lossReport).toEqual([]);
    expect(c.text).toMatch(/GÜLTIG/);

    const u = await call("convert_invoice", {
      file_path: sample("valid-zugferd-en16931.pdf"),
      target: "xrechnung-ubl",
      lang: "en",
    });
    expect(u.isError).toBeFalsy();
    expect(typeof u.sc.valid).toBe("boolean");
    const loss = u.sc.lossReport as Structured[];
    expect(loss.some((l) => l.kind === "changed" && l.bt === "BT-24")).toBe(true);
    expect(u.text).toMatch(/BT-24/);
  });

  it("writes the artifact to output_path with the extension matching the target", async () => {
    const { mkdtempSync, existsSync, rmSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "kontor-conv-"));
    try {
      const ok = await call("convert_invoice", {
        file_path: sample("valid-xrechnung-ubl.xml"),
        target: "html-preview",
        output_path: join(dir, "p.html"),
      });
      expect(ok.isError).toBeFalsy();
      expect(existsSync(join(dir, "p.html"))).toBe(true);
      const wrongExt = await call("convert_invoice", {
        file_path: sample("valid-xrechnung-ubl.xml"),
        target: "cii",
        output_path: join(dir, "x.html"),
      });
      expect(wrongExt.isError).toBe(true);
      const again = await call("convert_invoice", {
        file_path: sample("valid-xrechnung-ubl.xml"),
        target: "html-preview",
        output_path: join(dir, "p.html"),
      });
      expect(again.isError).toBe(true);
      expect(again.text).toMatch(/exists/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
