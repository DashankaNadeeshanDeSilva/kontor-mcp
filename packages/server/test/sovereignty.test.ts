/**
 * NFR-2 sovereignty proof, layer 2 (MCP surface): every tool, resource and prompt the server
 * exposes is exercised over an in-memory transport while all outbound network paths are blocked.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Slow CI runners (Windows) need more than vitest's 5 s default for the full matrix.
const TIMEOUT = 120_000;

import { installNetworkGuard, type NetworkGuard } from "../../core/test/helpers/network-guard.js";
import { createServer } from "../src/server.js";

const sample = (name: string) => fileURLToPath(new URL(`../samples/${name}`, import.meta.url));
const b64 = (name: string) => readFileSync(sample(name)).toString("base64");

let guard: NetworkGuard;
let client: Client;
beforeAll(async () => {
  guard = installNetworkGuard();
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer().connect(b);
  client = new Client({ name: "sovereignty", version: "0" });
  await client.connect(a);
});
afterAll(async () => {
  await client.close();
  guard.restore();
});

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

describe("sovereignty: the whole MCP surface runs with the network blocked", () => {
  it(
    "every tool is called at least once (matrix covers all documented targets)",
    async () => {
      const calls: Array<[string, Record<string, unknown>]> = [
        ["parse_invoice", { file_path: sample("valid-xrechnung-ubl.xml") }],
        ["parse_invoice", { content_base64: b64("valid-zugferd-en16931.pdf") }],
        ["validate_invoice", { file_path: sample("valid-xrechnung-cii.xml"), lang: "en" }],
        ["validate_invoice", { file_path: sample("broken-missing-buyer-reference.xml") }],
        [
          "audit_invoice",
          { file_path: sample("valid-zugferd-en16931.pdf"), known_invoice_numbers: ["X"] },
        ],
        ["generate_invoice", { invoice, lang: "en" }],
        ["generate_invoice", { invoice, target: "zugferd-pdf", profile: "BASIC" }],
        [
          "convert_invoice",
          { file_path: sample("valid-zugferd-en16931.pdf"), target: "extract-xml" },
        ],
        ["convert_invoice", { file_path: sample("valid-xrechnung-ubl.xml"), target: "cii" }],
        [
          "convert_invoice",
          { file_path: sample("valid-xrechnung-cii.xml"), target: "xrechnung-ubl" },
        ],
        [
          "convert_invoice",
          { file_path: sample("valid-xrechnung-ubl.xml"), target: "html-preview" },
        ],
        ["check_obligations", { role: "issuer", counterparty: "b2b", date: "2027-03-01" }],
        ["check_obligations", { role: "receiver", counterparty: "b2g", lang: "en" }],
        ["explain_rule", { rule_id: "BR-DE-15" }],
        ["explain_rule", { rule_id: "KONTOR-PLAUS-IBAN", lang: "en" }],
        ["list_capabilities", {}],
      ];
      const { tools } = await client.listTools();
      const covered = new Set(calls.map(([n]) => n));
      expect(tools.map((t) => t.name).filter((n) => !covered.has(n))).toEqual([]);
      for (const [name, args] of calls) {
        const r = await client.callTool({ name, arguments: args });
        expect(r.isError, `${name} ${JSON.stringify(args).slice(0, 80)}`).toBeFalsy();
      }
      expect(guard.attempts).toEqual([]);
    },
    TIMEOUT,
  );

  it(
    "every resource, resource template instance and prompt",
    async () => {
      const { resources } = await client.listResources();
      expect(resources.length).toBeGreaterThan(0);
      for (const r of resources) await client.readResource({ uri: r.uri });
      await client.readResource({ uri: "kontor://reference/codelists/currencies" });
      const { prompts } = await client.listPrompts();
      expect(prompts.length).toBe(3);
      for (const p of prompts) {
        const args: Record<string, string> = {};
        for (const a of p.arguments ?? []) if (a.required) args[a.name] = "x";
        await client.getPrompt({ name: p.name, arguments: args });
      }
      expect(guard.attempts).toEqual([]);
    },
    TIMEOUT,
  );
});
