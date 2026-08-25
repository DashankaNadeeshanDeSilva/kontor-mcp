import { BT_MAP } from "../model/bt-map.js";
import type { InvoiceModel } from "../model/schema.js";

export interface LossEntry {
  /**
   * dropped = present in source, absent after conversion; changed = value differs; added = the target
   * syntax forced a value that was not in the source (e.g. UBL's mandatory OrderReference/ID);
   * profile = source profile carries data outside the EN 16931 core model.
   */
  kind: "dropped" | "changed" | "added" | "profile";
  bt?: string;
  /** JSON pointer into the semantic model, e.g. /lines/2/price/grossPrice */
  path: string;
  sourceValue?: string;
  resultValue?: string;
  message: { de: string; en: string };
}

function flatten(v: unknown, path: string, out: Map<string, string>): void {
  if (v === undefined || v === null) return;
  if (typeof v === "string") {
    out.set(path, v);
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => {
      flatten(x, `${path}/${i}`, out);
    });
  } else if (typeof v === "object")
    for (const [k, x] of Object.entries(v as Record<string, unknown>))
      flatten(x, `${path}/${k}`, out);
  else out.set(path, String(v));
}

/** `/lines/2/price/netPrice` → BT-146 via the BT map key `lines[].price.netPrice`. */
export function btForPath(pointer: string): string | undefined {
  const key = pointer
    .split("/")
    .filter(Boolean)
    .map((seg) => (/^\d+$/.test(seg) ? "[]" : `.${seg}`))
    .join("")
    .replace(/\.\[\]/g, "[]")
    .replace(/^\./, "");
  return BT_MAP[key];
}

/** Mechanical diff of two semantic models: every source leaf must survive unchanged. */
export function diffModels(source: InvoiceModel, result: InvoiceModel): LossEntry[] {
  const a = new Map<string, string>();
  const b = new Map<string, string>();
  flatten(source, "", a);
  flatten(result, "", b);
  const out: LossEntry[] = [];
  for (const [path, sv] of a) {
    const rv = b.get(path);
    if (rv === sv) continue;
    const bt = btForPath(path);
    const label = bt ? `${bt} (${path})` : path;
    if (rv === undefined) {
      out.push({
        kind: "dropped",
        ...(bt ? { bt } : {}),
        path,
        sourceValue: sv,
        message: {
          de: `${label} ging bei der Konvertierung verloren.`,
          en: `${label} was lost in conversion.`,
        },
      });
    } else {
      out.push({
        kind: "changed",
        ...(bt ? { bt } : {}),
        path,
        sourceValue: sv,
        resultValue: rv,
        message: {
          de: `${label} wurde von "${sv}" zu "${rv}" geändert.`,
          en: `${label} changed from "${sv}" to "${rv}".`,
        },
      });
    }
  }
  for (const [path, rv] of b) {
    if (a.has(path)) continue;
    const bt = btForPath(path);
    const label = bt ? `${bt} (${path})` : path;
    out.push({
      kind: "added",
      ...(bt ? { bt } : {}),
      path,
      resultValue: rv,
      message: {
        de: `${label} = "${rv}" wurde vom Zielformat erzwungen (nicht in der Quelle).`,
        en: `${label} = "${rv}" was forced by the target syntax (not in the source).`,
      },
    });
  }
  return out;
}
