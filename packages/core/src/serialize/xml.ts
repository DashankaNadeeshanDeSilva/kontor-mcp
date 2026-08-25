/** Minimal indenting XML builder shared by the UBL and CII serializers. No library on the write path. */

export type XmlNode = string | undefined | XmlNode[];

export const escapeXml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Element with attributes and children; `undefined` children are dropped, nested arrays flattened. */
export function el(
  name: string,
  attrs: Record<string, string | undefined> = {},
  children: XmlNode[] = [],
): XmlNode[] {
  const a = Object.entries(attrs)
    .filter((kv): kv is [string, string] => kv[1] !== undefined)
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join("");
  const flat = children
    .flat(Number.POSITIVE_INFINITY as 1)
    .filter((c): c is string => c !== undefined);
  if (flat.length === 0) return [`<${name}${a}/>`];
  if (flat.length === 1 && !flat[0]?.startsWith("<"))
    return [`<${name}${a}>${escapeXml(flat[0] ?? "")}</${name}>`];
  return [`<${name}${a}>`, ...flat.map((c) => `  ${c}`), `</${name}>`];
}

/** Text element; omitted when the value is undefined or empty. */
export const text = (
  name: string,
  v: string | undefined,
  attrs?: Record<string, string | undefined>,
): XmlNode[] | undefined => (v === undefined || v === "" ? undefined : el(name, attrs, [v]));

/** Wrap children in `name` only if at least one child is present. */
export function group(
  name: string,
  attrs: Record<string, string | undefined>,
  children: XmlNode[],
): XmlNode[] | undefined {
  const present = children.flat(Number.POSITIVE_INFINITY as 1).some((c) => c !== undefined);
  return present ? el(name, attrs, children) : undefined;
}

export const document = (root: XmlNode[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n${root
    .flat(Number.POSITIVE_INFINITY as 1)
    .filter((c) => c !== undefined)
    .join("\n")}\n`;
