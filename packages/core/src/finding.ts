/** Canonical finding model across all validation layers (PRD §5.2). */
export type FindingSeverity = "fatal" | "error" | "warning" | "info";
export type FindingSource = "xsd" | "schematron-en16931" | "schematron-xrechnung" | "plausibility";

export interface Finding {
  /** e.g. "BR-DE-15", "XSD", "KONTOR-PLAUS-IBAN" */
  ruleId: string;
  severity: FindingSeverity;
  source: FindingSource;
  /** XPath into the source XML */
  location?: string;
  /** original validator message */
  message: string;
  explanation?: { de: string; en: string };
  fixHint?: { de: string; en: string };
  /** related business terms, e.g. ["BT-10"] */
  bt?: string[];
}
