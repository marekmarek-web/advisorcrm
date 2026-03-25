import { describe, it, expect, vi } from "vitest";
import { generateReport } from "../reporting-service";
import type { AnalyticsScope } from "../analytics-scope";

vi.mock("../advisor-performance", () => ({
  getAdvisorSummary: vi.fn().mockResolvedValue({ pendingReviews: 5, blockedItems: 2 }),
  getAdvisorPerformance: vi.fn().mockResolvedValue({ documentsProcessed: 10, averageReviewTimeHours: 20 }),
}));

vi.mock("../team-analytics", () => ({
  getTeamAnalyticsSummary: vi.fn().mockResolvedValue({ totalPendingReviews: 15 }),
  getTeamMemberComparison: vi.fn().mockResolvedValue([{ userId: "u1", pendingReviews: 5 }]),
}));

vi.mock("../executive-analytics", () => ({
  getExecutiveKPIs: vi.fn().mockResolvedValue({ totalProcessedDocs: 100 }),
  getExecutiveFunnel: vi.fn().mockResolvedValue({ uploaded: 100, applied: 80 }),
}));

vi.mock("../pipeline-analytics", () => ({
  getPipelineMetrics: vi.fn().mockResolvedValue({ extractionSuccessRate: 0.9 }),
  getPipelineLatency: vi.fn().mockResolvedValue({ avgReviewToApproveHours: 12 }),
}));

vi.mock("../payment-analytics", () => ({
  getPaymentMetrics: vi.fn().mockResolvedValue({ created: 50, applied: 40 }),
  getPaymentQualityBreakdown: vi.fn().mockResolvedValue({ missingIban: 2 }),
}));

vi.mock("../assistant-analytics", () => ({
  getAssistantUsageMetrics: vi.fn().mockResolvedValue({ uniqueUsers: 5, queries: 100 }),
  getAssistantHelpfulness: vi.fn().mockResolvedValue({ actionAcceptanceRate: 0.8 }),
}));

const scope: AnalyticsScope = {
  tenantId: "t1",
  userId: "u1",
  roleName: "Admin",
  visibleUserIds: ["u1", "u2"],
  scopeType: "admin",
};

describe("generateReport", () => {
  it("generates advisor_weekly with 2 sections", async () => {
    const report = await generateReport("advisor_weekly", scope);
    expect(report.type).toBe("advisor_weekly");
    expect(report.title).toBeDefined();
    expect(report.sections.length).toBe(2);
    expect(report.generatedAt).toBeInstanceOf(Date);
  });

  it("generates manager_team report", async () => {
    const report = await generateReport("manager_team", scope);
    expect(report.type).toBe("manager_team");
    expect(report.sections.length).toBe(2);
  });

  it("generates executive_monthly report", async () => {
    const report = await generateReport("executive_monthly", scope);
    expect(report.type).toBe("executive_monthly");
    expect(report.sections.length).toBe(2);
  });

  it("generates pipeline_quality report", async () => {
    const report = await generateReport("pipeline_quality", scope);
    expect(report.type).toBe("pipeline_quality");
    expect(report.sections.length).toBe(2);
  });

  it("generates payment_readiness report", async () => {
    const report = await generateReport("payment_readiness", scope);
    expect(report.type).toBe("payment_readiness");
    expect(report.sections.length).toBe(2);
  });

  it("generates assistant_adoption report", async () => {
    const report = await generateReport("assistant_adoption", scope);
    expect(report.type).toBe("assistant_adoption");
    expect(report.sections.length).toBe(2);
  });

  it("includes metadata with time window", async () => {
    const report = await generateReport("advisor_weekly", scope);
    expect(report.metadata.windowStart).toBeDefined();
    expect(report.metadata.windowEnd).toBeDefined();
  });

  it("includes scope info", async () => {
    const report = await generateReport("advisor_weekly", scope);
    expect(report.scope.tenantId).toBe("t1");
    expect(report.scope.userId).toBe("u1");
    expect(report.scope.scopeType).toBe("admin");
  });
});
