/**
 * Apply shared-facts patch into personal payload and set provenance.
 * Used when user confirms refresh ("Přepsat vše" / "Přepsat vybrané").
 */

import type { FinancialAnalysisData } from "@/lib/analyses/financial/types";

export type ProvenanceValue = "linked" | "overridden" | "imported";

/** Paths that we can set provenance for (same as in diff). */
const APPLICABLE_PATHS = [
  "cashflow.incomes.main",
  "cashflow.incomes.otherDetails",
  "liabilities.other",
  "incomeProtection.persons",
] as const;

/**
 * Merge patch into current payload for given paths and build _provenance.
 * Returns merged data and provenance map (to be stored in payload.data._provenance).
 */
export function mergePatchWithProvenance(
  currentPayload: FinancialAnalysisData,
  patch: Partial<FinancialAnalysisData>,
  pathsToApply: string[]
): {
  data: FinancialAnalysisData;
  provenance: Record<string, ProvenanceValue>;
} {
  const data = JSON.parse(JSON.stringify(currentPayload)) as FinancialAnalysisData & {
    _provenance?: Record<string, ProvenanceValue>;
  };
  const existingProvenance = { ...(data._provenance ?? {}) };
  const provenance: Record<string, ProvenanceValue> = { ...existingProvenance };

  const applySet = new Set(pathsToApply);

  if (applySet.has("cashflow.incomes.main") && patch.cashflow?.incomes?.main != null) {
    if (!data.cashflow) data.cashflow = {} as FinancialAnalysisData["cashflow"];
    if (!data.cashflow.incomes) data.cashflow.incomes = {};
    data.cashflow.incomes.main = patch.cashflow.incomes.main;
    provenance["cashflow.incomes.main"] = "linked";
  }
  if (applySet.has("cashflow.incomes.otherDetails") && patch.cashflow?.incomes?.otherDetails?.length) {
    if (!data.cashflow) data.cashflow = {} as FinancialAnalysisData["cashflow"];
    if (!data.cashflow.incomes) data.cashflow.incomes = {};
    data.cashflow.incomes.otherDetails = patch.cashflow.incomes.otherDetails;
    provenance["cashflow.incomes.otherDetails"] = "linked";
  }
  if (applySet.has("liabilities.other") && patch.liabilities && "other" in patch.liabilities) {
    data.liabilities = { ...data.liabilities, other: patch.liabilities.other } as FinancialAnalysisData["liabilities"];
    provenance["liabilities.other"] = "linked";
  }
  if (applySet.has("incomeProtection.persons") && patch.incomeProtection?.persons?.length) {
    data.incomeProtection = { persons: patch.incomeProtection.persons };
    provenance["incomeProtection.persons"] = "linked";
  }

  if (data._provenance) {
    (data as unknown as Record<string, unknown>)._provenance = provenance;
  } else {
    (data as unknown as Record<string, unknown>)._provenance = provenance;
  }
  return { data, provenance };
}

/**
 * Build list of paths that the patch actually touches (for "apply all").
 */
export function getPathsTouchedByPatch(patch: Partial<FinancialAnalysisData>): string[] {
  const paths: string[] = [];
  if (patch.cashflow?.incomes?.main != null) paths.push("cashflow.incomes.main");
  if (patch.cashflow?.incomes?.otherDetails?.length) paths.push("cashflow.incomes.otherDetails");
  if (patch.liabilities && "other" in patch.liabilities) paths.push("liabilities.other");
  if (patch.incomeProtection?.persons?.length) paths.push("incomeProtection.persons");
  return paths;
}

export { APPLICABLE_PATHS };
