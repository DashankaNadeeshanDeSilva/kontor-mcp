/** Document input convention (PRD §5.4) + path/size hygiene (NFR-5). */
import { readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, resolve } from "node:path";
import { z } from "zod";

export const DEFAULT_MAX_MB = 20;
export const ALLOWED_EXTENSIONS = new Set([".xml", ".pdf"]);

export const DocumentInputSchema = z.object({
  file_path: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Absolute path on the machine running this server to an XML (UBL/CII) or ZUGFeRD/Factur-X PDF file. " +
        "For chat attachments or sandboxed uploads (e.g. /mnt/user-data/...) the server cannot see that filesystem — pass content_base64 instead.",
    ),
  content_base64: z
    .string()
    .min(1)
    .optional()
    .describe("Base64-encoded document content (alternative to file_path)"),
  content_type: z
    .enum(["application/xml", "text/xml", "application/pdf"])
    .optional()
    .describe("MIME type of content_base64; auto-detected when omitted"),
});
export type DocumentInput = z.infer<typeof DocumentInputSchema>;

export const LangSchema = z
  .enum(["de", "en"])
  .default("de")
  .describe("Language of explanations and summaries");
export type Lang = "de" | "en";

/** User-facing tool error (message is safe to show; never carries a stack). */
export class ToolError extends Error {
  override readonly name = "ToolError";
}

export function maxBytes(): number {
  const mb = Number(process.env.KONTOR_MAX_FILE_MB ?? DEFAULT_MAX_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_MAX_MB) * 1024 * 1024;
}

/** ENOENT vs. EACCES/EPERM need different advice (Desktop verification finding F10). */
function fsError(e: unknown, abs: string): ToolError {
  const code = (e as { code?: string } | null)?.code;
  if (code === "EACCES" || code === "EPERM") {
    return new ToolError(
      `Permission denied reading ${abs}. The file exists but this server process may not read it. ` +
        "On macOS, folders like Desktop, Documents and Downloads are protected: grant the MCP host app " +
        "(e.g. Claude Desktop) access under System Settings → Privacy & Security → Files and Folders " +
        "or Full Disk Access, or move the file elsewhere. Alternatively pass the document via content_base64.",
    );
  }
  if (code === "ENOENT") {
    return new ToolError(
      `File not found: ${abs}. This server only sees the local filesystem of the machine it runs on; ` +
        "for attachments or sandboxed uploads pass the document via content_base64 instead.",
    );
  }
  return new ToolError(`Cannot read ${abs}: ${e instanceof Error ? e.message : String(e)}`);
}

export function resolveInput(input: DocumentInput): { bytes: Uint8Array; label: string } {
  const has = [input.file_path, input.content_base64].filter(Boolean).length;
  if (has !== 1) throw new ToolError("Provide exactly one of file_path or content_base64.");
  const cap = maxBytes();
  if (input.file_path) {
    const p = input.file_path;
    if (!isAbsolute(p)) throw new ToolError(`file_path must be absolute (got "${p}").`);
    const abs = resolve(p);
    if (!ALLOWED_EXTENSIONS.has(extname(abs).toLowerCase())) {
      throw new ToolError(`Unsupported file extension "${extname(abs)}"; expected .xml or .pdf.`);
    }
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(abs);
    } catch (e) {
      throw fsError(e, abs);
    }
    if (!st.isFile()) throw new ToolError(`Not a regular file: ${abs}`);
    if (st.size > cap)
      throw new ToolError(
        `File is ${st.size} bytes; the limit is ${cap} bytes (KONTOR_MAX_FILE_MB).`,
      );
    try {
      return { bytes: new Uint8Array(readFileSync(abs)), label: abs };
    } catch (e) {
      throw fsError(e, abs);
    }
  }
  const b64 = (input.content_base64 ?? "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4 !== 0)
    throw new ToolError("content_base64 is not valid base64.");
  if ((b64.length * 3) / 4 > cap)
    throw new ToolError(`Content exceeds the ${cap}-byte limit (KONTOR_MAX_FILE_MB).`);
  return {
    bytes: new Uint8Array(Buffer.from(b64, "base64")),
    label: `<${input.content_type ?? "base64 content"}>`,
  };
}
