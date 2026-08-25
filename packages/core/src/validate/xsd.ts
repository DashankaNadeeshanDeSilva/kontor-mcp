/** Layer 1 — XSD validation with xmllint-wasm (libxml2 in WebAssembly; no network, no native code). */
import { loadXsdSet, type ScenarioSyntax } from "@kontor-mcp/rules";
import { memoryPages, validateXML } from "xmllint-wasm";
import type { Finding } from "../finding.js";

export async function validateXsd(xmlText: string, syntax: ScenarioSyntax): Promise<Finding[]> {
  const set = loadXsdSet(syntax);
  const result = await validateXML({
    xml: [{ fileName: "document.xml", contents: xmlText }],
    schema: [{ fileName: set.main.fileName, contents: set.main.contents }],
    preload: set.preload,
    disableFileNameValidation: true,
    initialMemoryPages: 64 * memoryPages.MiB,
    maxMemoryPages: 1 * memoryPages.GiB,
  });
  if (result.valid) return [];
  const findings: Finding[] = result.errors.map((e) => ({
    ruleId: "XSD",
    severity: "fatal",
    source: "xsd",
    message: e.message.replace(/^Schemas validity error\s*:\s*/, ""),
    ...(e.loc ? { location: `line ${e.loc.lineNumber}` } : {}),
  }));
  if (findings.length === 0) {
    findings.push({
      ruleId: "XSD",
      severity: "fatal",
      source: "xsd",
      message: result.rawOutput.trim() || "schema validation failed",
    });
  }
  return findings;
}
