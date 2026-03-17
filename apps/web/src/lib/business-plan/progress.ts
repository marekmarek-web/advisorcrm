/**
 * Compute plan progress and health from plan, targets, and actuals.
 */

import type {
  PlanProgress,
  MetricProgress,
  PlanHealthStatus,
  MetricUnit,
  BusinessPlanMetricType,
} from "./types";
import { computeAllMetrics } from "./metrics";
import type { MetricsActuals } from "./metrics";

export type PlanWithTargets = {
  planId: string;
  tenantId: string;
  userId: string;
  periodType: string;
  year: number;
  periodNumber: number;
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;
  targets: { metricType: BusinessPlanMetricType; targetValue: number; unit: MetricUnit }[];
};

const SLIP_TOLERANCE = 0.1;
const SLIP_SLIGHT_THRESHOLD = 0.25;

function getHealth(
  target: number,
  actual: number,
  elapsed: number,
  periodEnd: Date
): PlanHealthStatus {
  if (target <= 0) return "no_data";
  const ratio = actual / target;
  if (actual >= target) return actual > target ? "exceeded" : "achieved";
  if (elapsed >= 1) return "significant_slip";
  const expectedMin = elapsed - SLIP_TOLERANCE;
  if (ratio >= expectedMin) return "on_track";
  if (ratio >= elapsed - SLIP_SLIGHT_THRESHOLD) return "slight_slip";
  return "significant_slip";
}

function getOverallHealth(metrics: MetricProgress[]): PlanHealthStatus {
  const statuses = metrics.map((m) => m.health);
  if (statuses.every((s) => s === "achieved" || s === "exceeded"))
    return "achieved";
  if (statuses.some((s) => s === "significant_slip")) return "significant_slip";
  if (statuses.some((s) => s === "slight_slip")) return "slight_slip";
  if (statuses.some((s) => s === "on_track")) return "on_track";
  if (statuses.every((s) => s === "no_data" || s === "not_applicable"))
    return "no_data";
  return "on_track";
}

/**
 * Compute progress for a plan. Fetches actuals from CRM and fills health for each target.
 */
export async function computeProgress(
  plan: PlanWithTargets,
  actuals: MetricsActuals
): Promise<PlanProgress> {
  const now = new Date();
  const periodStart = plan.periodStart;
  const periodEnd = plan.periodEnd;
  const elapsed =
    periodEnd.getTime() <= periodStart.getTime()
      ? 0
      : Math.min(
          1,
          (now.getTime() - periodStart.getTime()) /
            (periodEnd.getTime() - periodStart.getTime())
        );

  const metrics: MetricProgress[] = plan.targets.map((t) => {
    const actual = actuals[t.metricType] ?? 0;
    const target = t.targetValue;
    const progressPct = target > 0 ? Math.round((actual / target) * 100) : 0;
    const health = getHealth(target, actual, elapsed, periodEnd);
    return {
      metricType: t.metricType,
      target,
      actual,
      progressPct,
      health,
      unit: t.unit,
    };
  });

  return {
    planId: plan.planId,
    periodStart,
    periodEnd,
    periodLabel: plan.periodLabel,
    metrics,
    overallHealth: getOverallHealth(metrics),
  };
}
