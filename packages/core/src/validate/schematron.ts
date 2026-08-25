/** Layer 2 — official Schematron (precompiled XSLT → SEF) executed by Saxon-JS; SVRL → Finding. */
import { loadSef, type Scenario, type StylesheetName } from "@kontor-mcp/rules";
import SaxonJS from "saxon-js";
import type { Finding } from "../finding.js";
import { loadXml, XML_NAMESPACES } from "../xml/index.js";
import { effectiveLevel, levelFromFlag, severityFromLevel } from "./scenario.js";

const NS_TO_PREFIX = new Map(Object.entries(XML_NAMESPACES).map(([p, ns]) => [ns, p]));

/** Saxon-JS emits `/Q{ns}local[n]/…`; rewrite to the conventional prefixed form (`/ubl:Invoice[1]/cbc:ID[1]`). */
export function normalizeLocation(loc: string): string {
  return loc.replace(/Q\{([^}]*)\}([A-Za-z_][\w.-]*)/g, (_m, ns: string, local: string) => {
    const p = NS_TO_PREFIX.get(ns);
    return p ? `${p}:${local}` : local;
  });
}

export async function runStylesheet(
  xmlText: string,
  sheet: StylesheetName,
  scenario: Scenario | undefined,
): Promise<Finding[]> {
  const res = await SaxonJS.transform(
    { stylesheetInternal: loadSef(sheet), sourceText: xmlText, destination: "serialized" },
    "async",
  );
  const svrl = loadXml(String(res.principalResult), { maxBytes: 64 * 1024 * 1024 });
  const source = sheet.startsWith("EN16931") ? "schematron-en16931" : "schematron-xrechnung";
  const findings: Finding[] = [];
  for (const node of svrl.nodes("//svrl:failed-assert | //svrl:successful-report")) {
    const el = node as unknown as { getAttribute(n: string): string | null };
    const ruleId = el.getAttribute("id") ?? "?";
    const level = effectiveLevel(
      ruleId,
      levelFromFlag(el.getAttribute("flag") ?? undefined),
      scenario,
    );
    const message = svrl.string("svrl:text", node).replace(/\s+/g, " ").trim();
    const location = normalizeLocation(el.getAttribute("location") ?? "");
    findings.push({
      ruleId,
      severity: severityFromLevel(level),
      source,
      message,
      ...(location ? { location } : {}),
    });
  }
  return findings;
}
