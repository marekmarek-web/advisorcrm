import { describe, it, expect } from "vitest";
import { evaluateTarget, evaluateTargets, getBreaches, TARGETS } from "../target-registry";

describe("evaluateTarget", () => {
  it("detects breach when value exceeds lt threshold", () => {
    const target = TARGETS.find(t => t.code === "max_avg_review_time")!;
    const result = evaluateTarget(target, 60);
    expect(result.breached).toBe(true);
    expect(result.currentValue).toBe(60);
  });

  it("no breach when value below lt threshold", () => {
    const target = TARGETS.find(t => t.code === "max_avg_review_time")!;
    const result = evaluateTarget(target, 30);
    expect(result.breached).toBe(false);
  });

  it("detects breach when value below gte threshold", () => {
    const target = TARGETS.find(t => t.code === "min_apply_success_rate")!;
    const result = evaluateTarget(target, 0.5);
    expect(result.breached).toBe(true);
  });

  it("no breach when value meets gte threshold", () => {
    const target = TARGETS.find(t => t.code === "min_apply_success_rate")!;
    const result = evaluateTarget(target, 0.90);
    expect(result.breached).toBe(false);
  });
});

describe("evaluateTargets", () => {
  it("evaluates all matching metrics", () => {
    const metrics = {
      averageReviewTimeHours: 30,
      applyCompletionRate: 0.90,
      overdueRatio: 0.05,
    };
    const results = evaluateTargets(metrics, "advisor");
    expect(results.length).toBe(3);
    expect(results.every(r => r.breached === false)).toBe(true);
  });

  it("skips metrics not in provided data", () => {
    const metrics = { averageReviewTimeHours: 30 };
    const results = evaluateTargets(metrics, "advisor");
    expect(results.length).toBe(1);
  });

  it("filters by entity scope", () => {
    const metrics = {
      averageReviewTimeHours: 30,
      blockedPaymentRate: 0.20,
    };
    const advisorResults = evaluateTargets(metrics, "advisor");
    const tenantResults = evaluateTargets(metrics, "tenant");
    expect(advisorResults.length).toBe(1);
    expect(tenantResults.length).toBe(1);
  });

  it("evaluates all targets when no scope filter", () => {
    const metrics: Record<string, number> = {};
    for (const t of TARGETS) metrics[t.metric] = 0;
    const results = evaluateTargets(metrics);
    expect(results.length).toBe(TARGETS.length);
  });
});

describe("getBreaches", () => {
  it("returns only breached items", () => {
    const items = [
      { code: "a", metric: "m1", currentValue: 60, threshold: 48, severity: "warning" as const, breached: true },
      { code: "b", metric: "m2", currentValue: 30, threshold: 48, severity: "warning" as const, breached: false },
    ];
    expect(getBreaches(items).length).toBe(1);
    expect(getBreaches(items)[0].code).toBe("a");
  });

  it("returns empty when no breaches", () => {
    const items = [
      { code: "a", metric: "m1", currentValue: 30, threshold: 48, severity: "warning" as const, breached: false },
    ];
    expect(getBreaches(items)).toEqual([]);
  });
});
