/**
 * Pipeline analytics (Plan 7B.2).
 * Preprocessing, extraction, classification metrics and breakdowns.
 */

import type { TimeWindow } from "./analytics-scope";

export type PipelineMetrics = {
  preprocessSuccessRate: number;
  ocrFallbackUsage: number;
  classificationAccuracyProxy: number;
  extractionSuccessRate: number;
  extractionFailedRate: number;
  extractionReviewRate: number;
  retryRate: number;
  applyGateBlockRate: number;
};

export type PipelineBreakdown = {
  dimension: string;
  value: string;
  total: number;
  successRate: number;
  averageAgeHours: number;
};

export type PipelineLatency = {
  avgPreprocessDurationMs: number;
  avgExtractionDurationMs: number;
  avgReviewToApproveHours: number;
  avgApproveToApplyHours: number;
};

export async function getPipelineMetrics(
  tenantId: string,
  window?: TimeWindow,
): Promise<PipelineMetrics> {
  const metrics: PipelineMetrics = {
    preprocessSuccessRate: 0,
    ocrFallbackUsage: 0,
    classificationAccuracyProxy: 0,
    extractionSuccessRate: 0,
    extractionFailedRate: 0,
    extractionReviewRate: 0,
    retryRate: 0,
    applyGateBlockRate: 0,
  };

  try {
    const { db, contractUploadReviews, eq, and, gte, sql } = await import("db");

    const windowStart = window?.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [stats] = await db.select({
      total: sql<number>`count(*)::int`,
      preprocessed: sql<number>`count(*) filter (where ${contractUploadReviews.status} not in ('uploading','upload_failed'))::int`,
      classified: sql<number>`count(*) filter (where ${contractUploadReviews.detectedDocumentType} is not null)::int`,
      extracted: sql<number>`count(*) filter (where ${contractUploadReviews.status} not in ('uploading','upload_failed','preprocessing','extraction_failed'))::int`,
      extractionFailed: sql<number>`count(*) filter (where ${contractUploadReviews.status} = 'extraction_failed')::int`,
      reviewRequired: sql<number>`count(*) filter (where ${contractUploadReviews.status} = 'review_required')::int`,
      blocked: sql<number>`count(*) filter (where ${contractUploadReviews.status} = 'blocked_for_apply')::int`,
    }).from(contractUploadReviews)
      .where(and(eq(contractUploadReviews.tenantId, tenantId), gte(contractUploadReviews.createdAt, windowStart)));

    if (stats && stats.total > 0) {
      metrics.preprocessSuccessRate = Math.round((stats.preprocessed / stats.total) * 100) / 100;
      metrics.classificationAccuracyProxy = Math.round((stats.classified / stats.total) * 100) / 100;
      metrics.extractionSuccessRate = Math.round((stats.extracted / stats.total) * 100) / 100;
      metrics.extractionFailedRate = Math.round((stats.extractionFailed / stats.total) * 100) / 100;
      metrics.extractionReviewRate = Math.round((stats.reviewRequired / stats.total) * 100) / 100;
      metrics.applyGateBlockRate = Math.round((stats.blocked / stats.total) * 100) / 100;
    }
  } catch { /* best-effort */ }

  return metrics;
}

export async function getPipelineBreakdown(
  tenantId: string,
  dimension: "documentType" | "institution" | "advisor",
  window?: TimeWindow,
): Promise<PipelineBreakdown[]> {
  const breakdowns: PipelineBreakdown[] = [];

  try {
    const { db, contractUploadReviews, eq, and, gte, sql } = await import("db");

    const windowStart = window?.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const groupCol = dimension === "documentType"
      ? contractUploadReviews.detectedDocumentType
      : dimension === "advisor"
        ? contractUploadReviews.assignedTo
        : contractUploadReviews.detectedDocumentType;

    const rows = await db.select({
      value: groupCol,
      total: sql<number>`count(*)::int`,
      applied: sql<number>`count(*) filter (where ${contractUploadReviews.status} = 'applied')::int`,
      avgAge: sql<number>`coalesce(avg(extract(epoch from (now() - ${contractUploadReviews.createdAt})) / 3600), 0)::float`,
    }).from(contractUploadReviews)
      .where(and(eq(contractUploadReviews.tenantId, tenantId), gte(contractUploadReviews.createdAt, windowStart)))
      .groupBy(groupCol);

    for (const row of rows) {
      breakdowns.push({
        dimension,
        value: (row.value as string) ?? "unknown",
        total: row.total,
        successRate: row.total > 0 ? Math.round((row.applied / row.total) * 100) / 100 : 0,
        averageAgeHours: Math.round(row.avgAge * 10) / 10,
      });
    }
  } catch { /* best-effort */ }

  return breakdowns;
}

export async function getPipelineLatency(
  tenantId: string,
  window?: TimeWindow,
): Promise<PipelineLatency> {
  const latency: PipelineLatency = {
    avgPreprocessDurationMs: 0,
    avgExtractionDurationMs: 0,
    avgReviewToApproveHours: 0,
    avgApproveToApplyHours: 0,
  };

  try {
    const { db, contractUploadReviews, eq, and, gte, sql } = await import("db");

    const windowStart = window?.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [stats] = await db.select({
      avgTotal: sql<number>`coalesce(avg(extract(epoch from (${contractUploadReviews.updatedAt} - ${contractUploadReviews.createdAt})) / 3600), 0)::float`,
    }).from(contractUploadReviews)
      .where(and(
        eq(contractUploadReviews.tenantId, tenantId),
        gte(contractUploadReviews.createdAt, windowStart),
      ));

    if (stats) {
      latency.avgReviewToApproveHours = Math.round(stats.avgTotal * 10) / 10;
    }
  } catch { /* best-effort */ }

  return latency;
}
