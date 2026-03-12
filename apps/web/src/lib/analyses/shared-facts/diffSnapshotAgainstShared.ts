/**
 * Diff current personal FA payload against proposed patch from shared facts.
 * Returns list of changes for UI (path, current value, proposed value).
 */

import type { FinancialAnalysisData } from "@/lib/analyses/financial/types";
import { sharedFactsToProposedPersonalPatch } from "./sharedFactsMapper";
import type { SharedFactForApply } from "./sharedFactsMapper";

export interface DiffItem {
  path: string;
  label: string;
  current: unknown;
  proposed: unknown;
  status: "unchanged" | "updated" | "new";
}

const PATH_LABELS: Record<string, string> = {
  "cashflow.incomes.main": "Hlavní příjem",
  "cashflow.incomes.otherDetails": "Ostatní příjmy",
  "liabilities.other": "Ostatní závazky",
  "incomeProtection.persons": "Zajištění příjmů (příspěvek firmy)",
};

function getAtPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const p of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[p];
  }
  return current;
}

export function diffSnapshotAgainstShared(
  currentPayload: FinancialAnalysisData,
  facts: SharedFactForApply[]
): DiffItem[] {
  const patch = sharedFactsToProposedPersonalPatch(facts, currentPayload);
  const data = currentPayload as unknown as Record<string, unknown>;
  const patchData = patch as Record<string, unknown>;
  const items: DiffItem[] = [];

  if (patchData.cashflow?.incomes) {
    const inc = (patchData.cashflow as Record<string, unknown>).incomes as Record<string, unknown>;
    if (inc.main != null) {
      const cur = (data.cashflow as Record<string, unknown>)?.incomes as Record<string, unknown>;
      items.push({
        path: "cashflow.incomes.main",
        label: PATH_LABELS["cashflow.incomes.main"] ?? "Hlavní příjem",
        current: cur?.main,
        proposed: inc.main,
        status:
          Number(cur?.main) !== Number(inc.main) ? (cur?.main != null ? "updated" : "new") : "unchanged",
      });
    }
    if (Array.isArray(inc.otherDetails) && inc.otherDetails.length > 0) {
      const cur = (data.cashflow as Record<string, unknown>)?.incomes as Record<string, unknown>;
      const curLen = Array.isArray(cur?.otherDetails) ? cur.otherDetails.length : 0;
      items.push({
        path: "cashflow.incomes.otherDetails",
        label: PATH_LABELS["cashflow.incomes.otherDetails"] ?? "Ostatní příjmy",
        current: curLen,
        proposed: inc.otherDetails.length,
        status: inc.otherDetails.length > curLen ? "updated" : "unchanged",
      });
    }
  }

  if (patchData.liabilities && (patchData.liabilities as Record<string, unknown>).other != null) {
    const cur = (data.liabilities as Record<string, unknown>)?.other;
    const prop = (patchData.liabilities as Record<string, unknown>).other;
    items.push({
      path: "liabilities.other",
      label: PATH_LABELS["liabilities.other"] ?? "Ostatní závazky",
      current: cur,
      proposed: prop,
      status: Number(cur) !== Number(prop) ? "updated" : "unchanged",
    });
  }

  if (patchData.incomeProtection?.persons) {
    const persons = (patchData.incomeProtection as { persons: unknown[] }).persons;
    const first = persons[0] as Record<string, unknown> | undefined;
    const companyMonthly = first?.funding && typeof first.funding === "object"
      ? (first.funding as Record<string, unknown>).companyContributionMonthly
      : undefined;
    const curPersons = (data.incomeProtection as { persons?: unknown[] } | undefined)?.persons;
    const curFirst = curPersons?.[0] as Record<string, unknown> | undefined;
    const curMonthly = curFirst?.funding && typeof curFirst.funding === "object"
      ? (curFirst.funding as Record<string, unknown>).companyContributionMonthly
      : undefined;
    items.push({
      path: "incomeProtection.persons",
      label: PATH_LABELS["incomeProtection.persons"] ?? "Příspěvek firmy na pojištění",
      current: curMonthly,
      proposed: companyMonthly,
      status:
        Number(curMonthly) !== Number(companyMonthly)
          ? (curMonthly != null ? "updated" : "new")
          : "unchanged",
    });
  }

  return items.filter((i) => i.status !== "unchanged");
}
