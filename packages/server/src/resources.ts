/** kontor://samples/{name} — bundled sample invoices (Apache-2.0 sources, see PROVENANCE.md). */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

export const SAMPLES_DIR: string = fileURLToPath(new URL("../samples/", import.meta.url));

const SAMPLE_INFO: Record<string, string> = {
  "valid-xrechnung-ubl.xml": "Valid XRechnung 3.0 invoice (UBL) from the official test suite",
  "valid-xrechnung-cii.xml": "Valid XRechnung 3.0 invoice (CII) — semantic twin of the UBL sample",
  "broken-missing-buyer-reference.xml": "XRechnung UBL invoice without BuyerReference → BR-DE-15",
  "valid-zugferd-en16931.pdf":
    "ZUGFeRD 2 / Factur-X PDF/A-3 (EN 16931 profile) with embedded factur-x.xml",
};

export function listSamples(): string[] {
  return readdirSync(SAMPLES_DIR)
    .filter((f) => /\.(xml|pdf)$/.test(f))
    .sort();
}

const mime = (name: string) => (name.endsWith(".pdf") ? "application/pdf" : "application/xml");

export function registerResources(server: McpServer): void {
  server.registerResource(
    "samples",
    new ResourceTemplate("kontor://samples/{name}", {
      list: async () => ({
        resources: listSamples().map((name) => ({
          uri: `kontor://samples/${name}`,
          name,
          mimeType: mime(name),
          description: SAMPLE_INFO[name] ?? "Sample invoice",
        })),
      }),
    }),
    {
      title: "Sample invoices",
      description: "Curated sample e-invoices for test drives and demos",
    },
    async (uri, { name }) => {
      const file = String(name);
      if (!listSamples().includes(file)) throw new Error(`Unknown sample "${file}"`);
      const bytes = readFileSync(join(SAMPLES_DIR, file));
      return {
        contents: [
          file.endsWith(".pdf")
            ? { uri: uri.href, mimeType: mime(file), blob: bytes.toString("base64") }
            : { uri: uri.href, mimeType: mime(file), text: bytes.toString("utf8") },
        ],
      };
    },
  );
}
