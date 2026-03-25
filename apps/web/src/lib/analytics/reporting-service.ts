/**
 * Reporting service (Plan 7D.1).
 * Assembles multi-section reports from analytics services.
 */

import type { AnalyticsScope, TimeWindow } from "./analytics-scope";

export type ReportType =
  | "advisor_weekly"
  | "manager_team"
  | "executive_monthly"
  | "pipeline_quality"
  | "payment_readiness"
  | "assistant_adoption";

export type ReportSection = {
  title: string;
  data: Record<string, unknown>;
};

export type ReportPayload = {
  type: ReportType;
  title: string;
  generatedAt: Date;
  scope: Pick<AnalyticsScope, "tenantId" | "userId" | "scopeType">;
  sections: ReportSection[];
  metadata: Record<string, unknown>;
};

const REPORT_TITLES: Record<ReportType, string> = {
  advisor_weekly: "Týdenní přehled poradce",
  manager_team: "Týmový přehled",
  executive_monthly: "Měsíční manažerský report",
  pipeline_quality: "Kvalita pipeline",
  payment_readiness: "Připravenost plateb",
  assistant_adoption: "Adopce AI asistenta",
};

export async function generateReport(
  type: ReportType,
  scope: AnalyticsScope,
  window?: TimeWindow,
): Promise<ReportPayload> {
  const sections: ReportSection[] = [];
  const w = window ?? { startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), endDate: new Date() };

  try {
    switch (type) {
      case "advisor_weekly": {
        const { getAdvisorSummary, getAdvisorPerformance } = await import("./advisor-performance");
        const [summary, perf] = await Promise.all([
          getAdvisorSummary(scope.tenantId, scope.userId),
          getAdvisorPerformance(scope.tenantId, scope.userId, w),
        ]);
        sections.push({ title: "Souhrn", data: summary as unknown as Record<string, unknown> });
        sections.push({ title: "Výkon", data: perf as unknown as Record<string, unknown> });
        break;
      }

      case "manager_team": {
        const { getTeamAnalyticsSummary, getTeamMemberComparison } = await import("./team-analytics");
        const [summary, comparison] = await Promise.all([
          getTeamAnalyticsSummary(scope),
          getTeamMemberComparison(scope),
        ]);
        sections.push({ title: "Přehled týmu", data: summary as unknown as Record<string, unknown> });
        sections.push({ title: "Srovnání členů", data: { members: comparison } });
        break;
      }

      case "executive_monthly": {
        const { getExecutiveKPIs, getExecutiveFunnel } = await import("./executive-analytics");
        const [kpis, funnel] = await Promise.all([
          getExecutiveKPIs(scope.tenantId, w),
          getExecutiveFunnel(scope.tenantId, w),
        ]);
        sections.push({ title: "KPIs", data: kpis as unknown as Record<string, unknown> });
        sections.push({ title: "Funnel", data: funnel as unknown as Record<string, unknown> });
        break;
      }

      case "pipeline_quality": {
        const { getPipelineMetrics, getPipelineLatency } = await import("./pipeline-analytics");
        const [metrics, latency] = await Promise.all([
          getPipelineMetrics(scope.tenantId, w),
          getPipelineLatency(scope.tenantId, w),
        ]);
        sections.push({ title: "Metriky pipeline", data: metrics as unknown as Record<string, unknown> });
        sections.push({ title: "Latence", data: latency as unknown as Record<string, unknown> });
        break;
      }

      case "payment_readiness": {
        const { getPaymentMetrics, getPaymentQualityBreakdown } = await import("./payment-analytics");
        const [metrics, quality] = await Promise.all([
          getPaymentMetrics(scope.tenantId, w),
          getPaymentQualityBreakdown(scope.tenantId, w),
        ]);
        sections.push({ title: "Metriky plateb", data: metrics as unknown as Record<string, unknown> });
        sections.push({ title: "Kvalita", data: quality as unknown as Record<string, unknown> });
        break;
      }

      case "assistant_adoption": {
        const { getAssistantUsageMetrics, getAssistantHelpfulness } = await import("./assistant-analytics");
        const [usage, helpfulness] = await Promise.all([
          getAssistantUsageMetrics(scope.tenantId, w),
          getAssistantHelpfulness(scope.tenantId, w),
        ]);
        sections.push({ title: "Využití", data: usage as unknown as Record<string, unknown> });
        sections.push({ title: "Užitečnost", data: helpfulness as unknown as Record<string, unknown> });
        break;
      }
    }
  } catch { /* best-effort: return whatever sections were assembled */ }

  return {
    type,
    title: REPORT_TITLES[type],
    generatedAt: new Date(),
    scope: { tenantId: scope.tenantId, userId: scope.userId, scopeType: scope.scopeType },
    sections,
    metadata: { windowStart: w.startDate.toISOString(), windowEnd: w.endDate.toISOString() },
  };
}
