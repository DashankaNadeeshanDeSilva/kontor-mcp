import {
  DetectError,
  type DetectedFormat,
  detectInvoicePdf,
  PdfExtractError,
  sniffContainer,
  XmlLoadError,
} from "@kontor-mcp/core";
import { ToolError } from "../input.js";

export interface LoadedDocument {
  xml: Uint8Array;
  format?: DetectedFormat;
  pdf?: { filename: string; candidates: string[]; conformanceLevel?: string };
}

/** Bytes → invoice XML (extracting from PDF when needed). Errors become actionable ToolErrors (NG3 for PDFs without XML). */
export async function loadDocument(bytes: Uint8Array): Promise<LoadedDocument> {
  const container = sniffContainer(bytes);
  if (container === "pdf") {
    try {
      const d = await detectInvoicePdf(bytes);
      const pdf: LoadedDocument["pdf"] = { filename: d.filename, candidates: d.candidates };
      if (d.xmp?.conformanceLevel) pdf.conformanceLevel = d.xmp.conformanceLevel;
      return { xml: d.xml, format: d.format, pdf };
    } catch (e) {
      if (e instanceof PdfExtractError && e.code === "KONTOR-PDF-NO-ATTACHMENT") {
        throw new ToolError(
          `${e.message}. Kontor does not OCR or interpret visual PDFs (non-goal NG3): only ZUGFeRD/Factur-X hybrids with embedded XML are supported.`,
        );
      }
      throw toToolError(e);
    }
  }
  if (container === "unknown") throw new ToolError("Input is neither XML nor PDF.");
  return { xml: bytes };
}

export function toToolError(e: unknown): ToolError {
  if (e instanceof ToolError) return e;
  if (e instanceof XmlLoadError || e instanceof DetectError || e instanceof PdfExtractError)
    return new ToolError(e.message);
  return new ToolError(`Unexpected error: ${e instanceof Error ? e.message : String(e)}`);
}

export const DISCLAIMER = {
  de: "Hinweis: Formale/technische Prüfung nach EN 16931 / XRechnung – keine steuerliche oder rechtliche Beratung.",
  en: "Note: formal/technical checks per EN 16931 / XRechnung – not tax or legal advice.",
} as const;
