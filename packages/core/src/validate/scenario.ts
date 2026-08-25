/** KoSIT scenario selection + severity mapping (D-017). */
import { type KositLevel, loadScenarios, type Scenario } from "@kontor-mcp/rules";
import type { DetectedFormat } from "../detect/index.js";
import type { FindingSeverity } from "../finding.js";

export function selectScenario(
  format: DetectedFormat,
  customizationIdOverride?: string,
): Scenario | undefined {
  const id = (customizationIdOverride ?? format.customizationId ?? "").trim();
  if (!format.syntax || !id) return undefined;
  return loadScenarios().find((s) => s.syntax === format.syntax && s.customizationId === id);
}

/** SVRL flag (as emitted by the official stylesheets) → KoSIT report level. */
export function levelFromFlag(flag: string | undefined): KositLevel {
  switch (flag) {
    case "warning":
      return "warning";
    case "information":
    case "info":
      return "information";
    default:
      return "error"; // "fatal" and unflagged asserts
  }
}

export function severityFromLevel(level: KositLevel): FindingSeverity {
  return level === "information" ? "info" : level;
}

/** Apply the scenario's customLevel override, if any. */
export function effectiveLevel(
  ruleId: string,
  flagLevel: KositLevel,
  scenario: Scenario | undefined,
): KositLevel {
  return scenario?.customLevels[ruleId] ?? flagLevel;
}
