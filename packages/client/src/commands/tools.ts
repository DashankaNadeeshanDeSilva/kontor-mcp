/** `kontor-agent tools` — protocol introspection without an LLM. */
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

function schemaSummary(schema: unknown): string {
  const s = schema as { properties?: Record<string, unknown>; required?: string[] } | undefined;
  if (!s?.properties) return "";
  const req = new Set(s.required ?? []);
  return Object.keys(s.properties)
    .map((k) => (req.has(k) ? `${k}*` : k))
    .join(", ");
}

export async function renderTools(client: Client): Promise<string> {
  const caps = client.getServerCapabilities() ?? {};
  const out: string[] = [];
  const { tools } = await client.listTools();
  out.push(`Tools (${tools.length})`);
  for (const t of tools) {
    const a = t.annotations ?? {};
    const flags = [
      a.readOnlyHint ? "readOnly" : "writes",
      a.destructiveHint ? "destructive" : "",
      a.idempotentHint ? "idempotent" : "",
      a.openWorldHint === false ? "closedWorld" : "",
    ]
      .filter(Boolean)
      .join(" ");
    out.push(`  ${t.name}${t.title ? ` — ${t.title}` : ""}  [${flags}]`);
    out.push(`    in:  ${schemaSummary(t.inputSchema) || "(none)"}`);
    if (t.outputSchema) out.push(`    out: ${schemaSummary(t.outputSchema)}`);
  }
  if (caps.resources) {
    const { resources } = await client.listResources();
    out.push("", `Resources (${resources.length})`);
    for (const r of resources) out.push(`  ${r.uri}${r.description ? ` — ${r.description}` : ""}`);
    const { resourceTemplates } = await client.listResourceTemplates();
    if (resourceTemplates.length) {
      out.push("", `Resource templates (${resourceTemplates.length})`);
      for (const r of resourceTemplates) {
        out.push(`  ${r.uriTemplate}${r.description ? ` — ${r.description}` : ""}`);
      }
    }
  }
  if (caps.prompts) {
    const { prompts } = await client.listPrompts();
    out.push("", `Prompts (${prompts.length})`);
    for (const p of prompts) {
      const args = (p.arguments ?? []).map((x) => (x.required ? `${x.name}*` : x.name)).join(", ");
      out.push(`  ${p.name}(${args})${p.description ? ` — ${p.description}` : ""}`);
    }
  }
  return `${out.join("\n")}\n`;
}
