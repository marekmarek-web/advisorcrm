/**
 * Target registry (Plan 7C.3).
 * KPI targets with threshold evaluation and breach detection.
 */

export type TargetOperator = "lt" | "gt" | "lte" | "gte";
export type TargetSeverity = "warning" | "critical";
export type EntityScope = "advisor" | "team" | "tenant";

export type TargetDefinition = {
  code: string;
  metric: string;
  label: string;
  operator: TargetOperator;
  threshold: number;
  severity: TargetSeverity;
  entityScope: EntityScope;
};

export type TargetBreachItem = {
  code: string;
  metric: string;
  currentValue: number;
  threshold: number;
  severity: TargetSeverity;
  breached: boolean;
};

export const TARGETS: TargetDefinition[] = [
  { code: "max_avg_review_time", metric: "averageReviewTimeHours", label: "Avg review time < 48h", operator: "lt", threshold: 48, severity: "warning", entityScope: "advisor" },
  { code: "max_blocked_payment_rate", metric: "blockedPaymentRate", label: "Blocked payment rate < 15%", operator: "lt", threshold: 0.15, severity: "critical", entityScope: "tenant" },
  { code: "min_apply_success_rate", metric: "applyCompletionRate", label: "Apply success rate >= 85%", operator: "gte", threshold: 0.85, severity: "warning", entityScope: "advisor" },
  { code: "min_ai_adoption_rate", metric: "aiAdoptionRate", label: "AI adoption rate >= 30%", operator: "gte", threshold: 0.30, severity: "warning", entityScope: "team" },
  { code: "max_overdue_followup_rate", metric: "overdueRatio", label: "Overdue follow-up rate < 10%", operator: "lt", threshold: 0.10, severity: "warning", entityScope: "advisor" },
  { code: "min_portal_readiness_rate", metric: "portalVisibilityRate", label: "Portal readiness rate >= 80%", operator: "gte", threshold: 0.80, severity: "critical", entityScope: "tenant" },
];

export function evaluateTarget(target: TargetDefinition, currentValue: number): TargetBreachItem {
  let breached = false;
  switch (target.operator) {
    case "lt": breached = currentValue >= target.threshold; break;
    case "gt": breached = currentValue <= target.threshold; break;
    case "lte": breached = currentValue > target.threshold; break;
    case "gte": breached = currentValue < target.threshold; break;
  }
  return {
    code: target.code,
    metric: target.metric,
    currentValue,
    threshold: target.threshold,
    severity: target.severity,
    breached,
  };
}

export function evaluateTargets(
  metrics: Record<string, number>,
  scope?: EntityScope,
): TargetBreachItem[] {
  const filtered = scope ? TARGETS.filter(t => t.entityScope === scope) : TARGETS;
  const results: TargetBreachItem[] = [];

  for (const target of filtered) {
    const currentValue = metrics[target.metric];
    if (currentValue === undefined) continue;
    results.push(evaluateTarget(target, currentValue));
  }

  return results;
}

export function getBreaches(items: TargetBreachItem[]): TargetBreachItem[] {
  return items.filter(i => i.breached);
}
