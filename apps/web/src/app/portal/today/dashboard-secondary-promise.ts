import { getServiceRecommendationsForDashboard } from "@/app/actions/service-engine";
import { getMeetingNotesForBoard } from "@/app/actions/meeting-notes";
import { listFinancialAnalyses } from "@/app/actions/financial-analyses";
import { getProductionSummary } from "@/app/actions/production";
import { getBusinessPlanWidgetData } from "@/app/actions/business-plan";
import type { DashboardSecondaryBundle } from "./dashboard-secondary-types";

/** Spustí paralelní načítání sekundárních dat nástěnky (nezávisle na dokončení KPI promise). */
export function createDashboardSecondaryDataPromise(): Promise<DashboardSecondaryBundle> {
  let productionError: string | null = null;
  return Promise.all([
    getServiceRecommendationsForDashboard(10).catch(() => []),
    getMeetingNotesForBoard().catch(() => []),
    listFinancialAnalyses().catch(() => []),
    getProductionSummary("month").catch((e) => {
      productionError = e instanceof Error ? e.message : "Nepodařilo se načíst produkci.";
      return null;
    }),
    getBusinessPlanWidgetData().catch(() => null),
  ]).then(([serviceRecommendations, initialNotes, initialAnalyses, productionSummary, businessPlanWidgetData]) => ({
    serviceRecommendations,
    initialNotes,
    initialAnalyses,
    productionSummary,
    productionError,
    businessPlanWidgetData,
  }));
}
