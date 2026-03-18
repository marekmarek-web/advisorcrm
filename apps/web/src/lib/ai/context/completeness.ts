import type { ClientAiContextRaw } from "./client-context";
import { isAnalysisOutdated } from "./freshness-rules";

export type ContextCompleteness = {
  overall: "high" | "medium" | "low";
  missingAreas: string[];
  outdatedAreas: string[];
  flags: string[];
};

export function computeCompleteness(raw: ClientAiContextRaw): ContextCompleteness {
  const missingAreas: string[] = [];
  const outdatedAreas: string[] = [];
  const flags: string[] = [];

  if (raw.financialSummary.status === "missing") {
    missingAreas.push("financial_analysis");
  }

  if (raw.contractsSummary.length === 0) {
    missingAreas.push("contracts");
  } else {
    const missingContractDetail = raw.contractsSummary.some(
      (c) => !c.contractNumber || (!c.premiumAmount && !c.premiumAnnual)
    );
    if (missingContractDetail) missingAreas.push("contracts_detail");
  }

  if (isAnalysisOutdated(raw.financialSummary.updatedAt ?? null)) {
    outdatedAreas.push("financial_analysis");
    flags.push("outdated_analysis");
  }

  if (raw.serviceStatus.noContactRisk) {
    flags.push("no_contact_risk");
  }

  if (raw.serviceStatus.isOverdue) {
    flags.push("overdue_service_review");
  }

  if (raw.serviceStatus.openServiceTasks > 0) {
    flags.push("open_service_actions");
  }

  const issueCount = missingAreas.length + outdatedAreas.length + flags.length;

  let overall: ContextCompleteness["overall"] = "high";
  if (raw.activeDeals.length === 0 && raw.contractsSummary.length === 0) {
    overall = "low";
  } else if (issueCount >= 3) {
    overall = "low";
  } else if (issueCount > 0) {
    overall = "medium";
  }

  return {
    overall,
    missingAreas: [...new Set(missingAreas)],
    outdatedAreas: [...new Set(outdatedAreas)],
    flags: [...new Set(flags)],
  };
}

export function renderCompletenessHint(completeness: ContextCompleteness): string {
  const qualityLabel: Record<ContextCompleteness["overall"], string> = {
    high: "vysoká",
    medium: "střední",
    low: "nízká",
  };

  const parts = [`Kvalita dat: ${qualityLabel[completeness.overall]}.`];
  if (completeness.missingAreas.length > 0) {
    parts.push(`Chybí: ${completeness.missingAreas.join(", ")}.`);
  }
  if (completeness.outdatedAreas.length > 0) {
    parts.push(`Zastaralé: ${completeness.outdatedAreas.join(", ")}.`);
  }
  if (completeness.flags.length > 0) {
    parts.push(`Flagy: ${completeness.flags.join(", ")}.`);
  }
  return parts.join(" ");
}
