import { bundledStandards, kbStats, listCodelists, loadLegalTimeline } from "@kontor-mcp/rules";
import { z } from "zod";
import { type Lang, LangSchema } from "../input.js";
import { SERVER_NAME, SERVER_VERSION, TOOL_SUMMARY } from "../server-meta.js";

export const CapabilitiesInputSchema = z.object({ lang: LangSchema });

export const CapabilitiesOutputSchema = z.object({
  server: z.object({ name: z.string(), version: z.string() }),
  formats: z.object({
    read: z.array(z.string()),
    write: z.array(z.string()),
    validate: z.array(z.string()),
    pdfProfiles: z.array(z.string()),
  }),
  bundledStandards: z.object({
    xrechnung: z.string(),
    xrechnungSchematron: z.string(),
    validatorConfiguration: z.string(),
    en16931: z.string(),
    ublXsd: z.string(),
    ciiXsd: z.string(),
  }),
  knowledgeBase: z.object({
    total: z.number(),
    curated: z.number(),
    xrechnung: z.number(),
    en16931: z.number(),
  }),
  codelists: z.array(z.string()),
  legal: z.object({ lastVerified: z.string(), verifiedBy: z.string() }),
  tools: z.array(z.object({ name: z.string(), readOnly: z.boolean(), summary: z.string() })),
  resources: z.array(z.string()),
  prompts: z.array(z.string()),
  sovereignty: z.string(),
  limits: z.object({ maxFileMb: z.number() }),
});
export type CapabilitiesOutput = z.infer<typeof CapabilitiesOutputSchema>;

export function runCapabilities(
  input: z.infer<typeof CapabilitiesInputSchema>,
  maxFileMb: number,
): { output: CapabilitiesOutput; text: string } {
  const tl = loadLegalTimeline();
  const output: CapabilitiesOutput = {
    server: { name: SERVER_NAME, version: SERVER_VERSION },
    formats: {
      read: [
        "UBL 2.1 Invoice / CreditNote (XML)",
        "UN/CEFACT CII D16B (XML)",
        "ZUGFeRD / Factur-X PDF/A-3 (embedded XML, all profiles)",
      ],
      write: [
        `XRechnung ${bundledStandards.xrechnung} UBL (generate_invoice, convert_invoice)`,
        "CII D16B (convert_invoice)",
        "HTML preview (convert_invoice)",
      ],
      validate: [
        `XRechnung ${bundledStandards.xrechnung} (UBL + CII)`,
        `EN 16931 ${bundledStandards.en16931} (UBL + CII)`,
        "Kontor plausibility checks (KONTOR-PLAUS-*)",
      ],
      pdfProfiles: ["MINIMUM", "BASIC WL", "BASIC", "EN 16931", "EXTENDED", "XRECHNUNG"],
    },
    bundledStandards: { ...bundledStandards },
    knowledgeBase: kbStats(),
    codelists: listCodelists(),
    legal: { lastVerified: tl.lastVerified, verifiedBy: tl.verifiedBy },
    tools: TOOL_SUMMARY,
    resources: [
      "kontor://samples/{name}",
      "kontor://reference/rules",
      "kontor://reference/codelists/{list}",
      "kontor://reference/cheatsheet",
    ],
    prompts: ["audit-incoming-invoice", "draft-supplier-rejection", "create-invoice-interview"],
    sovereignty:
      "Fully offline: no network calls at runtime, no telemetry, no persistence — documents are processed in memory on the machine running this server and forgotten after the call. Legal parameters and rule sets are bundled and versioned.",
    limits: { maxFileMb },
  };
  return { output, text: render(output, input.lang) };
}

function render(o: CapabilitiesOutput, lang: Lang): string {
  const L = lang === "de";
  return [
    `${o.server.name} ${o.server.version} — ${L ? "Fähigkeiten" : "capabilities"}`,
    `${L ? "Standards" : "Standards"}: XRechnung ${o.bundledStandards.xrechnung} (Schematron ${o.bundledStandards.xrechnungSchematron}), EN 16931 ${o.bundledStandards.en16931}, KoSIT ${o.bundledStandards.validatorConfiguration}, UBL ${o.bundledStandards.ublXsd}, CII ${o.bundledStandards.ciiXsd}`,
    `${L ? "Lesen" : "Read"}: ${o.formats.read.join(" · ")}`,
    `${L ? "Schreiben" : "Write"}: ${o.formats.write.join(" · ")}`,
    `${L ? "Regelwissen" : "Knowledge base"}: ${o.knowledgeBase.total} ${L ? "Regeln" : "rules"} (${o.knowledgeBase.curated} ${L ? "kuratiert DE/EN" : "curated DE/EN"}) · ${L ? "Codelisten" : "code lists"}: ${o.codelists.join(", ")}`,
    `${L ? "Rechtsstand" : "Legal parameters"}: ${L ? "geprüft am" : "verified"} ${o.legal.lastVerified}`,
    `Tools: ${o.tools.map((t) => `${t.name}${t.readOnly ? "" : " (writes files)"}`).join(", ")}`,
    `${L ? "Ressourcen" : "Resources"}: ${o.resources.join(", ")} · Prompts: ${o.prompts.join(", ")}`,
    `${L ? "Limit" : "Limit"}: ${o.limits.maxFileMb} MB ${L ? "pro Datei" : "per file"}`,
    o.sovereignty,
  ].join("\n");
}
