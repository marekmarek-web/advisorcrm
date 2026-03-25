import { describe, it, expect, vi } from "vitest";
import {
  scoreFromRate,
  computeOverallScore,
  deriveStatus,
  deriveTrend,
  computeHealthScore,
  type HealthScoreComponents,
} from "../health-scoring";

vi.mock("../advisor-performance", () => ({
  getAdvisorPerformance: vi.fn().mockResolvedValue({
    documentsProcessed: 10,
    averageReviewTimeHours: 20,
    applyCompletionRate: 0.9,
    correctionRate: 0.1,
    followUpCompletionRate: 0.8,
    overdueRatio: 0.05,
    aiAssistantUsageCount: 5,
  }),
}));

vi.mock("../pipeline-analytics", () => ({
  getPipelineMetrics: vi.fn().mockResolvedValue({
    preprocessSuccessRate: 0.95,
    ocrFallbackUsage: 0,
    classificationAccuracyProxy: 0.9,
    extractionSuccessRate: 0.88,
    extractionFailedRate: 0.05,
    extractionReviewRate: 0.1,
    retryRate: 0,
    applyGateBlockRate: 0.08,
  }),
}));

vi.mock("../payment-analytics", () => ({
  getPaymentMetrics: vi.fn().mockResolvedValue({
    created: 100,
    blocked: 10,
    applied: 80,
    awaitingReview: 5,
    correctionRate: 0.1,
    portalVisibilityRate: 0.8,
  }),
}));

describe("scoreFromRate", () => {
  it("converts rate to 0-100 score", () => {
    expect(scoreFromRate(0.85)).toBe(85);
    expect(scoreFromRate(1)).toBe(100);
    expect(scoreFromRate(0)).toBe(0);
  });

  it("inverts when flag set", () => {
    expect(scoreFromRate(0.2, true)).toBe(80);
    expect(scoreFromRate(1, true)).toBe(0);
  });

  it("clamps to 0-100", () => {
    expect(scoreFromRate(-0.5)).toBe(0);
    expect(scoreFromRate(1.5)).toBe(100);
  });
});

describe("computeOverallScore", () => {
  it("computes weighted average", () => {
    const components: HealthScoreComponents = {
      reviewTimeliness: 80,
      correctionRate: 80,
      blockedRatio: 80,
      slaCompliance: 80,
      followUpResponsiveness: 80,
      aiActionAcceptance: 80,
      paymentQuality: 80,
    };
    expect(computeOverallScore(components)).toBe(80);
  });

  it("handles mixed scores", () => {
    const components: HealthScoreComponents = {
      reviewTimeliness: 100,
      correctionRate: 50,
      blockedRatio: 70,
      slaCompliance: 90,
      followUpResponsiveness: 60,
      aiActionAcceptance: 40,
      paymentQuality: 80,
    };
    const result = computeOverallScore(components);
    expect(result).toBeGreaterThan(50);
    expect(result).toBeLessThan(90);
  });
});

describe("deriveStatus", () => {
  it("healthy for >= 80", () => expect(deriveStatus(80)).toBe("healthy"));
  it("warning for 60-79", () => expect(deriveStatus(65)).toBe("warning"));
  it("critical for < 60", () => expect(deriveStatus(45)).toBe("critical"));
});

describe("deriveTrend", () => {
  it("stable when no previous", () => expect(deriveTrend(80)).toBe("stable"));
  it("improving when up by > 3", () => expect(deriveTrend(85, 80)).toBe("improving"));
  it("declining when down by > 3", () => expect(deriveTrend(75, 80)).toBe("declining"));
  it("stable when within +-3", () => expect(deriveTrend(81, 80)).toBe("stable"));
});

describe("computeHealthScore", () => {
  it("returns score for advisor entity", async () => {
    const result = await computeHealthScore("t1", "advisor", "u1");
    expect(result.overall).toBeGreaterThan(0);
    expect(result.status).toBeDefined();
    expect(result.trend).toBe("stable");
    expect(result.components.reviewTimeliness).toBeDefined();
  });

  it("returns score for pipeline entity", async () => {
    const result = await computeHealthScore("t1", "pipeline");
    expect(result.overall).toBeGreaterThan(0);
  });

  it("returns score for payments entity", async () => {
    const result = await computeHealthScore("t1", "payments");
    expect(result.overall).toBeGreaterThan(0);
  });

  it("returns score for team entity (defaults)", async () => {
    const result = await computeHealthScore("t1", "team");
    expect(result.overall).toBeGreaterThan(0);
    expect(result.status).toBeDefined();
  });
});
