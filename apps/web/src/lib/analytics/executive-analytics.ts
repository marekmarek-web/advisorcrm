/**
 * Executive analytics (Plan 7B.1).
 * Top-level KPIs, pipeline funnel, and trend data for directors/admins.
 */

import type { TimeWindow } from "./analytics-scope";

export type ExecutiveKPIs = {
  totalProcessedDocs: number;
  automationAssistRate: number;
  reviewCompletionRate: number;
  avgTimeToApplyHours: number;
  paymentPortalReadinessRate: number;
  blockedCriticalItems: number;
  teamProductivityTrend: number;
  aiAdoptionTrend: number;
  systemQualityTrend: number;
};

export type ExecutiveFunnel = {
  uploaded: number;
  preprocessed: number;
  classified: number;
  extracted: number;
  reviewed: number;
  approved: number;
  applied: number;
  portalVisible: number;
  followUpCompleted: number;
};

export type ExecutiveTrend = {
  date: string;
  documentsProcessed: number;
  reviewsCompleted: number;
  applicationsApplied: number;
  aiQueriesCount: number;
};

export async function getExecutiveKPIs(
  tenantId: string,
  window?: TimeWindow,
): Promise<ExecutiveKPIs> {
  const kpis: ExecutiveKPIs = {
    totalProcessedDocs: 0,
    automationAssistRate: 0,
    reviewCompletionRate: 0,
    avgTimeToApplyHours: 0,
    paymentPortalReadinessRate: 0,
    blockedCriticalItems: 0,
    teamProductivityTrend: 0,
    aiAdoptionTrend: 0,
    systemQualityTrend: 0,
  };

  try {
    const { db, contractUploadReviews, clientPaymentSetups, auditLog, eq, and, gte, sql } = await import("db");

    const windowStart = window?.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [docStats] = await db.select({
      total: sql<number>`count(*)::int`,
      reviewed: sql<number>`count(*) filter (where ${contractUploadReviews.status} in ('approved','applied','review_completed'))::int`,
      applied: sql<number>`count(*) filter (where ${contractUploadReviews.status} = 'applied')::int`,
      blocked: sql<number>`count(*) filter (where ${contractUploadReviews.status} = 'blocked_for_apply')::int`,
      avgApplyTime: sql<number>`coalesce(avg(extract(epoch from (${contractUploadReviews.updatedAt} - ${contractUploadReviews.createdAt})) / 3600) filter (where ${contractUploadReviews.status} = 'applied'), 0)::float`,
    }).from(contractUploadReviews)
      .where(and(eq(contractUploadReviews.tenantId, tenantId), gte(contractUploadReviews.createdAt, windowStart)));

    if (docStats) {
      kpis.totalProcessedDocs = docStats.total;
      kpis.reviewCompletionRate = docStats.total > 0 ? Math.round((docStats.reviewed / docStats.total) * 100) / 100 : 0;
      kpis.blockedCriticalItems = docStats.blocked;
      kpis.avgTimeToApplyHours = Math.round(docStats.avgApplyTime * 10) / 10;
    }

    const [paymentStats] = await db.select({
      total: sql<number>`count(*)::int`,
      portalReady: sql<number>`count(*) filter (where ${clientPaymentSetups.status} = 'applied')::int`,
    }).from(clientPaymentSetups)
      .where(eq(clientPaymentSetups.tenantId, tenantId));
    if (paymentStats && paymentStats.total > 0) {
      kpis.paymentPortalReadinessRate = Math.round((paymentStats.portalReady / paymentStats.total) * 100) / 100;
    }

    const [aiCount] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(auditLog)
      .where(and(
        eq(auditLog.tenantId, tenantId),
        sql`${auditLog.action} like 'assistant:%'`,
        gte(auditLog.createdAt, windowStart),
      ));
    if (aiCount && kpis.totalProcessedDocs > 0) {
      kpis.aiAdoptionTrend = Math.round((aiCount.count / kpis.totalProcessedDocs) * 100) / 100;
    }
  } catch { /* best-effort */ }

  return kpis;
}

export async function getExecutiveFunnel(
  tenantId: string,
  window?: TimeWindow,
): Promise<ExecutiveFunnel> {
  const funnel: ExecutiveFunnel = {
    uploaded: 0,
    preprocessed: 0,
    classified: 0,
    extracted: 0,
    reviewed: 0,
    approved: 0,
    applied: 0,
    portalVisible: 0,
    followUpCompleted: 0,
  };

  try {
    const { db, contractUploadReviews, eq, and, gte, sql } = await import("db");

    const windowStart = window?.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [counts] = await db.select({
      total: sql<number>`count(*)::int`,
      preprocessed: sql<number>`count(*) filter (where ${contractUploadReviews.status} not in ('uploading','upload_failed'))::int`,
      classified: sql<number>`count(*) filter (where ${contractUploadReviews.detectedDocumentType} is not null)::int`,
      extracted: sql<number>`count(*) filter (where ${contractUploadReviews.status} not in ('uploading','upload_failed','preprocessing'))::int`,
      reviewed: sql<number>`count(*) filter (where ${contractUploadReviews.status} in ('review_completed','approved','applied'))::int`,
      approved: sql<number>`count(*) filter (where ${contractUploadReviews.status} in ('approved','applied'))::int`,
      applied: sql<number>`count(*) filter (where ${contractUploadReviews.status} = 'applied')::int`,
    }).from(contractUploadReviews)
      .where(and(eq(contractUploadReviews.tenantId, tenantId), gte(contractUploadReviews.createdAt, windowStart)));

    if (counts) {
      funnel.uploaded = counts.total;
      funnel.preprocessed = counts.preprocessed;
      funnel.classified = counts.classified;
      funnel.extracted = counts.extracted;
      funnel.reviewed = counts.reviewed;
      funnel.approved = counts.approved;
      funnel.applied = counts.applied;
      funnel.portalVisible = counts.applied;
      funnel.followUpCompleted = 0;
    }
  } catch { /* best-effort */ }

  return funnel;
}

export async function getExecutiveTrends(
  tenantId: string,
  period: "daily" | "weekly" = "daily",
  window?: TimeWindow,
): Promise<ExecutiveTrend[]> {
  const trends: ExecutiveTrend[] = [];

  try {
    const { db, contractUploadReviews, eq, and, gte, sql } = await import("db");

    const windowStart = window?.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const truncFn = period === "weekly" ? "date_trunc('week'," : "date_trunc('day',";

    const rows = await db.select({
      date: sql<string>`${sql.raw(truncFn)} ${contractUploadReviews.createdAt})::date::text`,
      total: sql<number>`count(*)::int`,
      reviewed: sql<number>`count(*) filter (where ${contractUploadReviews.status} in ('review_completed','approved','applied'))::int`,
      applied: sql<number>`count(*) filter (where ${contractUploadReviews.status} = 'applied')::int`,
    }).from(contractUploadReviews)
      .where(and(eq(contractUploadReviews.tenantId, tenantId), gte(contractUploadReviews.createdAt, windowStart)))
      .groupBy(sql`${sql.raw(truncFn)} ${contractUploadReviews.createdAt})`);

    for (const row of rows) {
      trends.push({
        date: row.date,
        documentsProcessed: row.total,
        reviewsCompleted: row.reviewed,
        applicationsApplied: row.applied,
        aiQueriesCount: 0,
      });
    }
  } catch { /* best-effort */ }

  return trends;
}
