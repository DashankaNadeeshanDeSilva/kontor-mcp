/**
 * @kontor-mcp/core — MCP-free library for EN 16931 e-invoices (XRechnung, ZUGFeRD/Factur-X).
 */
export * from "./detect/index.js";
export type { Finding, FindingSeverity, FindingSource } from "./finding.js";
export * from "./model/index.js";
export * from "./parse/index.js";
export * from "./pdf/index.js";
export * from "./xml/index.js";
export const CORE_PACKAGE = "@kontor-mcp/core" as const;
