/**
 * NFR-2 sovereignty proof, layer 1 (library): every core operation runs with all outbound
 * network paths blocked and recorded; plus a static guard that no runtime source in
 * core / rules / server imports a network module (the inbound HTTP host is the one exception).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditInvoice,
  checkObligations,
  convertInvoice,
  extractEmbeddedXml,
  generateInvoice,
  validateInvoice,
} from "../src/index.js";
import { installNetworkGuard, type NetworkGuard } from "./helpers/network-guard.js";

const fx = (p: string) =>
  readFileSync(
    fileURLToPath(
      new URL(
        /^(spike|plausibility)\//.test(p) ? `../../../fixtures/${p}` : `../fixtures/${p}`,
        import.meta.url,
      ),
    ),
  );

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

let guard: NetworkGuard;
beforeAll(() => {
  guard = installNetworkGuard();
});
afterAll(() => {
  guard.restore();
});

describe("sovereignty: no outbound network from the core library (NFR-2)", () => {
  it("the guard itself works", async () => {
    expect(() => fetch("http://example.invalid/")).toThrow(/KONTOR-SOVEREIGNTY/);
    expect(guard.attempts).toEqual(["fetch(http://example.invalid/)"]);
    guard.attempts.length = 0;
  });

  it("validate + audit (UBL, CII, XRechnung extension, ZUGFeRD PDF) make no network attempt", async () => {
    for (const f of [
      "detect/ubl-invoice-xrechnung-extension.xml",
      "detect/ubl-creditnote-xrechnung.xml",
      "detect/cii-facturx-basic.xml",
      "spike/invalid-ubl-missing-buyerref.xml",
    ]) {
      await validateInvoice(fx(f));
    }
    for (const f of ["spike/valid-ubl.xml", "plausibility/broken-leitweg-vat-math.xml"]) {
      await auditInvoice(fx(f), { plausibility: { today: new Date("2026-08-26") } });
    }
    const pdf = readFileSync(
      fileURLToPath(new URL("../../server/samples/valid-zugferd-en16931.pdf", import.meta.url)),
    );
    const embedded = await extractEmbeddedXml(pdf);
    await auditInvoice(embedded.xml, { plausibility: { today: new Date("2026-08-26") } });
    expect(guard.attempts).toEqual([]);
  });

  it("generate (UBL + ZUGFeRD PDF/A-3) and convert (all targets) make no network attempt", async () => {
    await generateInvoice(invoice);
    await generateInvoice(invoice, { target: "zugferd-pdf" });
    const ubl = fx("spike/valid-ubl.xml");
    for (const target of ["cii", "xrechnung-ubl", "html-preview"] as const) {
      await convertInvoice(ubl, { target });
    }
    checkObligations({ role: "issuer", counterparty: "b2b", date: "2027-03-01" });
    expect(guard.attempts).toEqual([]);
  });
});

describe("sovereignty: static guard over runtime sources", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const NETWORK =
    /from\s+["'](node:)?(net|http|https|http2|tls|dns|dgram)["']|["']undici["']|\bfetch\s*\(/;
  const ALLOWED = new Set(["server/src/http.ts"]);
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory()
        ? walk(p)
        : p.endsWith(".ts") && !p.endsWith(".d.ts")
          ? [p]
          : [];
    });
  it("only the inbound HTTP host touches a network module", () => {
    const offenders: string[] = [];
    for (const pkg of ["core", "rules", "server"]) {
      for (const file of walk(join(root, pkg, "src"))) {
        const rel = relative(root, file).split("\\").join("/");
        if (ALLOWED.has(rel)) continue;
        if (NETWORK.test(readFileSync(file, "utf8"))) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
