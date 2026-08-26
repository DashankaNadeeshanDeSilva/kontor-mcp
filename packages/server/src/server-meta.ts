export const SERVER_NAME = "kontor-mcp" as const;
export const SERVER_VERSION = "1.0.3";

/** One line per tool, also reported by list_capabilities. */
export const TOOL_SUMMARY: Array<{ name: string; readOnly: boolean; summary: string }> = [
  {
    name: "parse_invoice",
    readOnly: true,
    summary: "Detect format and return the EN 16931 semantic model",
  },
  {
    name: "validate_invoice",
    readOnly: true,
    summary: "XSD + official EN 16931 / XRechnung rules + plausibility, KoSIT-equivalent verdict",
  },
  {
    name: "audit_invoice",
    readOnly: true,
    summary: "One-call audit with accept / review / reject recommendation",
  },
  {
    name: "explain_rule",
    readOnly: true,
    summary: "Explain a rule id with DE/EN text and fix hint",
  },
  {
    name: "generate_invoice",
    readOnly: false,
    summary: "Structured data → validated XRechnung 3.0 UBL (optional file output)",
  },
  {
    name: "convert_invoice",
    readOnly: false,
    summary: "Extract XML from ZUGFeRD PDF, UBL ↔ CII, HTML preview (optional file output)",
  },
  {
    name: "check_obligations",
    readOnly: true,
    summary: "German e-invoicing mandate: what applies to whom, from when, with sources",
  },
  {
    name: "list_capabilities",
    readOnly: true,
    summary:
      "Formats, bundled standard versions, KB stats, legal lastVerified, sovereignty statement",
  },
];
