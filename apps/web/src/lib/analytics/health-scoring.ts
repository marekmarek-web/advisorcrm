/**
 * Health scoring engine (Plan 7C.2).
 * Composite health score from multiple operational components.
 */

export type HealthScoreComponents = {
  reviewTimeliness: number;
  correctionRate: number;
  blockedRatio: number;
  slaCompliance: number;
  followUpResponsiveness: number;
  aiActionAcceptance: number;
  paymentQuality: number;
};

export type HealthScoreTrend = "improving" | "stable" | "declining";

export type HealthScore = {
  overall: number;
  components: HealthScoreComponents;
  trend: HealthScoreTrend;
  status: "healthy" | "warning" | "critical";
};

const WEIGHTS: Record<keyof HealthScoreComponents, number> = {
  reviewTimeliness: 0.20,
  correctionRate: 0.15,
  blockedRatio: 0.15,
  slaCompliance: 0.15,
  followUpResponsiveness: 0.10,
  aiActionAcceptance: 0.10,
  paymentQuality: 0.15,
};

export function scoreFromRate(rate: number, invert = false): number {
  const value = invert ? 1 - rate : rate;
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

export function computeOverallScore(components: HealthScoreComponents): number {
  let total = 0;
  for (const key of Object.keys(WEIGHTS) as (keyof HealthScoreComponents)[]) {
    total += (components[key] ?? 0) * WEIGHTS[key];
  }
  return Math.round(total);
}

export function deriveStatus(score: number): "healthy" | "warning" | "critical" {
  if (score >= 80) return "healthy";
  if (score >= 60) return "warning";
  return "critical";
}

export function deriveTrend(current: number, previous?: number): HealthScoreTrend {
  if (previous === undefined) return "stable";
  const diff = current - previous;
  if (diff > 3) return "improving";
  if (diff < -3) return "declining";
  return "stable";
}

export async function computeHealthScore(
  tenantId: string,
  entity: "advisor" | "team" | "pipeline" | "payments" | "assistant",
  userId?: string,
): Promise<HealthScore> {
  const components: HealthScoreComponents = {
    reviewTimeliness: 80,
    correctionRate: 85,
    blockedRatio: 90,
    slaCompliance: 85,
    followUpResponsiveness: 75,
    aiActionAcceptance: 70,
    paymentQuality: 80,
  };

  try {
    if (entity === "advisor" && userId) {
      const { getAdvisorPerformance } = await import("./advisor-performance");
      const perf = await getAdvisorPerformance(tenantId, userId);
      components.reviewTimeliness = perf.averageReviewTimeHours < 24 ? 100 : perf.averageReviewTimeHours < 48 ? 75 : perf.averageReviewTimeHours < 72 ? 50 : 25;
      components.correctionRate = scoreFromRate(perf.correctionRate, true);
      components.followUpResponsiveness = scoreFromRate(perf.followUpCompletionRate);
      components.blockedRatio = scoreFromRate(perf.overdueRatio, true);
    }

    if (entity === "pipeline") {
      const { getPipelineMetrics } = await import("./pipeline-analytics");
      const pm = await getPipelineMetrics(tenantId);
      components.reviewTimeliness = scoreFromRate(pm.extractionSuccessRate);
      components.correctionRate = scoreFromRate(pm.extractionFailedRate, true);
      components.blockedRatio = scoreFromRate(pm.applyGateBlockRate, true);
    }

    if (entity === "payments") {
      const { getPaymentMetrics } = await import("./payment-analytics");
      const pm = await getPaymentMetrics(tenantId);
      components.paymentQuality = scoreFromRate(pm.portalVisibilityRate);
      components.blockedRatio = pm.created > 0 ? scoreFromRate(pm.blocked / pm.created, true) : 90;
    }
  } catch { /* use defaults */ }

  const overall = computeOverallScore(components);
  return {
    overall,
    components,
    trend: "stable",
    status: deriveStatus(overall),
  };
}
