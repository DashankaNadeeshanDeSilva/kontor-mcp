/** Generic table-driven XPath → object extractor shared by the UBL and CII maps. */
import type { XmlDocument } from "../xml/index.js";

export type FieldSpec = string | { path: string; date?: true };

export interface GroupSpec {
  fields?: Record<string, FieldSpec>;
  groups?: Record<string, { path: string; many?: true; spec: GroupSpec }>;
  /** Optional fix-up after extraction (e.g. UBL "#CODE#note" convention). */
  post?: (o: Record<string, unknown>) => Record<string, unknown>;
}

/** CII `format="102"` dates are YYYYMMDD; everything else passes through. */
export function normalizeDate(v: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : v.trim();
}

export function extractGroup(
  doc: XmlDocument,
  ctx: Node,
  spec: GroupSpec,
): Record<string, unknown> {
  let out: Record<string, unknown> = {};
  for (const [key, f] of Object.entries(spec.fields ?? {})) {
    const path = typeof f === "string" ? f : f.path;
    const raw = doc.string(path, ctx);
    if (raw === "") continue;
    out[key] = typeof f !== "string" && f.date ? normalizeDate(raw) : raw;
  }
  for (const [key, g] of Object.entries(spec.groups ?? {})) {
    const nodes = doc.nodes(g.path, ctx);
    if (g.many) {
      const items = nodes
        .map((n) => extractGroup(doc, n, g.spec))
        .filter((o) => Object.keys(o).length > 0);
      if (items.length > 0) out[key] = items;
    } else if (nodes[0]) {
      const o = extractGroup(doc, nodes[0], g.spec);
      if (Object.keys(o).length > 0) out[key] = o;
    }
  }
  if (spec.post) out = spec.post(out);
  return out;
}
