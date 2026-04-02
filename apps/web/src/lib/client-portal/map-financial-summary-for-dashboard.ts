import type { ClientFinancialSummaryView } from "@/app/actions/client-financial-summary";
import type { ClientPortalFinancialSummary } from "@/app/client/ClientDashboardLayout";

/** Stejná logika jako dříve v `client/page.tsx` — jeden zdroj mapování pro web dashboard. */
export function mapFinancialSummaryForClientDashboard(
  raw: ClientFinancialSummaryView
): ClientPortalFinancialSummary | null {
  if (raw.status === "missing" || !raw.primaryAnalysisId) return null;
  return {
    scope: raw.scope,
    householdName: raw.householdName,
    income: raw.income,
    expenses: raw.expenses,
    surplus: raw.surplus,
    assets: raw.assets,
    liabilities: raw.liabilities,
    netWorth: raw.netWorth,
    reserveOk: raw.reserveOk,
    priorities: raw.priorities,
    gaps: raw.gaps,
    goalsCount: raw.goalsCount,
  };
}
