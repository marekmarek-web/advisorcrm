/**
 * Backlog and SLA analytics (Plan 7B.4).
 * Backlog metrics, SLA compliance, and aging buckets.
 */

import type { AnalyticsScope, TimeWindow } from "./analytics-scope";

export type BacklogMetrics = {
  pendingReviewCount: number;
  pendingApplyCount: number;
  blockedCount: number;
  unresolvedReminders: number;
  unresolvedEscalations: number;
};

export type SLAComplianceMetrics = {
  policyCode: string;
  totalItems: number;
  breachedItems: number;
  breachRate: number;
  avgTimeToResolutionHours: number;
};

export type AgingBucket = {
  entityType: string;
  bucket_0_24h: number;
  bucket_1_3d: number;
  bucket_3_7d: number;
  bucket_7plus: number;
};

export async function getBacklogMetrics(
  scope: AnalyticsScope,
): Promise<BacklogMetrics> {
  const metrics: BacklogMetrics = {
    pendingReviewCount: 0,
    pendingApplyCount: 0,
    blockedCount: 0,
    unresolvedReminders: 0,
    unresolvedEscalations: 0,
  };

  try {
    const { db, contractUploadReviews, reminders, escalationEvents, eq, and, sql } = await import("db");

    const [reviewStats] = await db.select({
      pending: sql<number>`count(*) filter (where ${contractUploadReviews.status} in ('extracted','review_required'))::int`,
      applyPending: sql<number>`count(*) filter (where ${contractUploadReviews.status} = 'approved')::int`,
      blocked: sql<number>`count(*) filter (where ${contractUploadReviews.status} = 'blocked_for_apply')::int`,
    }).from(contractUploadReviews)
      .where(eq(contractUploadReviews.tenantId, scope.tenantId));

    if (reviewStats) {
      metrics.pendingReviewCount = reviewStats.pending;
      metrics.pendingApplyCount = reviewStats.applyPending;
      metrics.blockedCount = reviewStats.blocked;
    }

    const [reminderCount] = await db.select({
      count: sql<number>`count(*) filter (where ${reminders.status} = 'pending')::int`,
    }).from(reminders)
      .where(eq(reminders.tenantId, scope.tenantId));
    metrics.unresolvedReminders = reminderCount?.count ?? 0;

    const [escCount] = await db.select({
      count: sql<number>`count(*) filter (where ${escalationEvents.status} = 'pending')::int`,
    }).from(escalationEvents)
      .where(eq(escalationEvents.tenantId, scope.tenantId));
    metrics.unresolvedEscalations = escCount?.count ?? 0;
  } catch { /* best-effort */ }

  return metrics;
}

export async function getSLACompliance(
  tenantId: string,
  window?: TimeWindow,
): Promise<SLAComplianceMetrics[]> {
  const results: SLAComplianceMetrics[] = [];

  try {
    const { db, escalationEvents, eq, and, gte, sql } = await import("db");

    const windowStart = window?.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const rows = await db.select({
      policyCode: escalationEvents.policyCode,
      total: sql<number>`count(*)::int`,
      resolved: sql<number>`count(*) filter (where ${escalationEvents.status} = 'resolved')::int`,
      avgResolution: sql<number>`coalesce(avg(extract(epoch from (${escalationEvents.resolvedAt} - ${escalationEvents.createdAt})) / 3600) filter (where ${escalationEvents.status} = 'resolved'), 0)::float`,
    }).from(escalationEvents)
      .where(and(eq(escalationEvents.tenantId, tenantId), gte(escalationEvents.createdAt, windowStart)))
      .groupBy(escalationEvents.policyCode);

    for (const row of rows) {
      const breached = row.total - row.resolved;
      results.push({
        policyCode: row.policyCode as string,
        totalItems: row.total,
        breachedItems: breached,
        breachRate: row.total > 0 ? Math.round((breached / row.total) * 100) / 100 : 0,
        avgTimeToResolutionHours: Math.round(row.avgResolution * 10) / 10,
      });
    }
  } catch { /* best-effort */ }

  return results;
}

export async function getAgingBuckets(
  tenantId: string,
): Promise<AgingBucket[]> {
  const buckets: AgingBucket[] = [];

  try {
    const { db, contractUploadReviews, eq, sql } = await import("db");

    const [reviewBucket] = await db.select({
      h0_24: sql<number>`count(*) filter (where extract(epoch from (now() - ${contractUploadReviews.createdAt})) / 3600 < 24)::int`,
      d1_3: sql<number>`count(*) filter (where extract(epoch from (now() - ${contractUploadReviews.createdAt})) / 3600 between 24 and 72)::int`,
      d3_7: sql<number>`count(*) filter (where extract(epoch from (now() - ${contractUploadReviews.createdAt})) / 3600 between 72 and 168)::int`,
      d7plus: sql<number>`count(*) filter (where extract(epoch from (now() - ${contractUploadReviews.createdAt})) / 3600 > 168)::int`,
    }).from(contractUploadReviews)
      .where(sql`${contractUploadReviews.tenantId} = ${tenantId} and ${contractUploadReviews.status} in ('extracted','review_required','approved','blocked_for_apply')`);

    if (reviewBucket) {
      buckets.push({
        entityType: "review",
        bucket_0_24h: reviewBucket.h0_24,
        bucket_1_3d: reviewBucket.d1_3,
        bucket_3_7d: reviewBucket.d3_7,
        bucket_7plus: reviewBucket.d7plus,
      });
    }
  } catch { /* best-effort */ }

  return buckets;
}
