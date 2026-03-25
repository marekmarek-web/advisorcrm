/**
 * Bottleneck detector (Plan 7C.4).
 * Identifies operational bottlenecks across pipeline, teams, and documents.
 */

export type BottleneckSeverity = "low" | "medium" | "high";

export type BottleneckItem = {
  entityType: string;
  dimension: string;
  value: string;
  severity: BottleneckSeverity;
  metric: string;
  currentValue: number;
  threshold: number;
};

function severity(value: number, warnThreshold: number, criticalThreshold: number): BottleneckSeverity {
  if (value >= criticalThreshold) return "high";
  if (value >= warnThreshold) return "medium";
  return "low";
}

export async function detectBottlenecks(tenantId: string): Promise<BottleneckItem[]> {
  const items: BottleneckItem[] = [];

  try {
    const { getPipelineMetrics } = await import("./pipeline-analytics");
    const pipeline = await getPipelineMetrics(tenantId);

    if (pipeline.extractionFailedRate > 0.05) {
      items.push({
        entityType: "pipeline",
        dimension: "extraction_failure",
        value: `${Math.round(pipeline.extractionFailedRate * 100)}%`,
        severity: severity(pipeline.extractionFailedRate, 0.05, 0.15),
        metric: "extractionFailedRate",
        currentValue: pipeline.extractionFailedRate,
        threshold: 0.05,
      });
    }

    if (pipeline.applyGateBlockRate > 0.10) {
      items.push({
        entityType: "pipeline",
        dimension: "apply_gate_block",
        value: `${Math.round(pipeline.applyGateBlockRate * 100)}%`,
        severity: severity(pipeline.applyGateBlockRate, 0.10, 0.25),
        metric: "applyGateBlockRate",
        currentValue: pipeline.applyGateBlockRate,
        threshold: 0.10,
      });
    }

    if (pipeline.extractionReviewRate > 0.20) {
      items.push({
        entityType: "pipeline",
        dimension: "high_review_rate",
        value: `${Math.round(pipeline.extractionReviewRate * 100)}%`,
        severity: severity(pipeline.extractionReviewRate, 0.20, 0.40),
        metric: "extractionReviewRate",
        currentValue: pipeline.extractionReviewRate,
        threshold: 0.20,
      });
    }
  } catch { /* best-effort */ }

  try {
    const { getBacklogMetrics } = await import("./backlog-analytics");
    const scope = { tenantId, userId: "", roleName: "Admin" as const, visibleUserIds: [], scopeType: "admin" as const };
    const backlog = await getBacklogMetrics(scope);

    if (backlog.pendingReviewCount > 20) {
      items.push({
        entityType: "backlog",
        dimension: "pending_reviews",
        value: String(backlog.pendingReviewCount),
        severity: severity(backlog.pendingReviewCount, 20, 50),
        metric: "pendingReviewCount",
        currentValue: backlog.pendingReviewCount,
        threshold: 20,
      });
    }

    if (backlog.unresolvedEscalations > 5) {
      items.push({
        entityType: "backlog",
        dimension: "unresolved_escalations",
        value: String(backlog.unresolvedEscalations),
        severity: severity(backlog.unresolvedEscalations, 5, 15),
        metric: "unresolvedEscalations",
        currentValue: backlog.unresolvedEscalations,
        threshold: 5,
      });
    }
  } catch { /* best-effort */ }

  return items.sort((a, b) => {
    const sev = { high: 0, medium: 1, low: 2 };
    return sev[a.severity] - sev[b.severity];
  });
}
