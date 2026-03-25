import { describe, it, expect, vi } from "vitest";
import { detectBottlenecks } from "../bottleneck-detector";

vi.mock("../pipeline-analytics", () => ({
  getPipelineMetrics: vi.fn().mockResolvedValue({
    preprocessSuccessRate: 0.95,
    ocrFallbackUsage: 0,
    classificationAccuracyProxy: 0.9,
    extractionSuccessRate: 0.88,
    extractionFailedRate: 0.08,
    extractionReviewRate: 0.25,
    retryRate: 0,
    applyGateBlockRate: 0.12,
  }),
}));

vi.mock("../backlog-analytics", () => ({
  getBacklogMetrics: vi.fn().mockResolvedValue({
    pendingReviewCount: 30,
    pendingApplyCount: 5,
    blockedCount: 3,
    unresolvedReminders: 2,
    unresolvedEscalations: 8,
  }),
}));

describe("detectBottlenecks", () => {
  it("detects pipeline bottlenecks", async () => {
    const items = await detectBottlenecks("t1");
    expect(items.length).toBeGreaterThan(0);
    const pipelineItems = items.filter(i => i.entityType === "pipeline");
    expect(pipelineItems.length).toBeGreaterThanOrEqual(2);
  });

  it("detects backlog bottlenecks", async () => {
    const items = await detectBottlenecks("t1");
    const backlogItems = items.filter(i => i.entityType === "backlog");
    expect(backlogItems.length).toBeGreaterThanOrEqual(1);
  });

  it("sorts by severity (high first)", async () => {
    const items = await detectBottlenecks("t1");
    if (items.length >= 2) {
      const severityMap = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < items.length; i++) {
        expect(severityMap[items[i].severity]).toBeGreaterThanOrEqual(severityMap[items[i - 1].severity]);
      }
    }
  });

  it("includes dimension and metric info", async () => {
    const items = await detectBottlenecks("t1");
    for (const item of items) {
      expect(item.dimension).toBeDefined();
      expect(item.metric).toBeDefined();
      expect(typeof item.currentValue).toBe("number");
      expect(typeof item.threshold).toBe("number");
    }
  });
});
