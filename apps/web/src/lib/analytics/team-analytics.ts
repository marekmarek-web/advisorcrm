/**
 * Team analytics service (Plan 7A.3).
 * Team-level summaries, member comparisons, and heatmap data.
 */

import type { AnalyticsScope } from "./analytics-scope";

export type TeamAnalyticsSummary = {
  tenantId: string;
  totalPendingReviews: number;
  totalBlockedItems: number;
  totalOverdueFollowUps: number;
  unresolvedEscalations: number;
  applyBacklog: number;
  blockedPayments: number;
  aiUsageTotal: number;
  averageReviewAgeHours: number;
};

export type TeamMemberComparison = {
  userId: string;
  userName?: string;
  pendingReviews: number;
  overdueItems: number;
  averageReviewAgeHours: number;
  correctionRate: number;
  applySuccessRate: number;
  escalationCount: number;
  communicationBacklog: number;
};

export type HeatmapEntry = {
  dimension: string;
  value: string;
  metric: number;
  severity: "low" | "medium" | "high";
};

export async function getTeamAnalyticsSummary(
  scope: AnalyticsScope,
): Promise<TeamAnalyticsSummary> {
  const summary: TeamAnalyticsSummary = {
    tenantId: scope.tenantId,
    totalPendingReviews: 0,
    totalBlockedItems: 0,
    totalOverdueFollowUps: 0,
    unresolvedEscalations: 0,
    applyBacklog: 0,
    blockedPayments: 0,
    aiUsageTotal: 0,
    averageReviewAgeHours: 0,
  };

  try {
    const { db, contractUploadReviews, clientPaymentSetups, reminders, escalationEvents, auditLog, eq, and, inArray, sql } = await import("db");

    const userFilter = scope.visibleUserIds.length > 0
      ? inArray(contractUploadReviews.assignedTo, scope.visibleUserIds)
      : eq(contractUploadReviews.tenantId, scope.tenantId);

    const [reviewStats] = await db.select({
      pending: sql<number>`count(*) filter (where ${contractUploadReviews.status} in ('extracted','review_required'))::int`,
      blocked: sql<number>`count(*) filter (where ${contractUploadReviews.status} = 'blocked_for_apply')::int`,
      applyBacklog: sql<number>`count(*) filter (where ${contractUploadReviews.status} = 'approved')::int`,
      avgAge: sql<number>`coalesce(avg(extract(epoch from (now() - ${contractUploadReviews.createdAt})) / 3600), 0)::float`,
    }).from(contractUploadReviews)
      .where(and(eq(contractUploadReviews.tenantId, scope.tenantId), userFilter));

    if (reviewStats) {
      summary.totalPendingReviews = reviewStats.pending;
      summary.totalBlockedItems = reviewStats.blocked;
      summary.applyBacklog = reviewStats.applyBacklog;
      summary.averageReviewAgeHours = Math.round(reviewStats.avgAge * 10) / 10;
    }

    const [paymentCount] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(clientPaymentSetups)
      .where(and(eq(clientPaymentSetups.tenantId, scope.tenantId), eq(clientPaymentSetups.needsHumanReview, true)));
    summary.blockedPayments = paymentCount?.count ?? 0;

    const [reminderCount] = await db.select({
      overdue: sql<number>`count(*) filter (where ${reminders.dueAt} < now() and ${reminders.status} = 'pending')::int`,
    }).from(reminders)
      .where(eq(reminders.tenantId, scope.tenantId));
    summary.totalOverdueFollowUps = reminderCount?.overdue ?? 0;

    const [escCount] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(escalationEvents)
      .where(and(eq(escalationEvents.tenantId, scope.tenantId), eq(escalationEvents.status, "pending")));
    summary.unresolvedEscalations = escCount?.count ?? 0;

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [aiCount] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(auditLog)
      .where(and(
        eq(auditLog.tenantId, scope.tenantId),
        sql`${auditLog.action} like 'assistant:%'`,
        sql`${auditLog.createdAt} >= ${weekAgo}`,
      ));
    summary.aiUsageTotal = aiCount?.count ?? 0;
  } catch { /* best-effort */ }

  return summary;
}

export async function getTeamMemberComparison(
  scope: AnalyticsScope,
): Promise<TeamMemberComparison[]> {
  const members: TeamMemberComparison[] = [];

  try {
    const { db, contractUploadReviews, eq, and, inArray, sql } = await import("db");

    if (scope.visibleUserIds.length === 0) return members;

    const stats = await db.select({
      userId: contractUploadReviews.assignedTo,
      pending: sql<number>`count(*) filter (where ${contractUploadReviews.status} in ('extracted','review_required'))::int`,
      avgAge: sql<number>`coalesce(avg(extract(epoch from (now() - ${contractUploadReviews.createdAt})) / 3600), 0)::float`,
      total: sql<number>`count(*)::int`,
      applied: sql<number>`count(*) filter (where ${contractUploadReviews.status} = 'applied')::int`,
    }).from(contractUploadReviews)
      .where(and(
        eq(contractUploadReviews.tenantId, scope.tenantId),
        inArray(contractUploadReviews.assignedTo, scope.visibleUserIds),
      ))
      .groupBy(contractUploadReviews.assignedTo);

    for (const s of stats) {
      if (!s.userId) continue;
      members.push({
        userId: s.userId,
        pendingReviews: s.pending,
        overdueItems: 0,
        averageReviewAgeHours: Math.round(s.avgAge * 10) / 10,
        correctionRate: 0,
        applySuccessRate: s.total > 0 ? Math.round((s.applied / s.total) * 100) / 100 : 0,
        escalationCount: 0,
        communicationBacklog: 0,
      });
    }
  } catch { /* best-effort */ }

  return members;
}

export async function getTeamHeatmapData(
  scope: AnalyticsScope,
): Promise<HeatmapEntry[]> {
  const entries: HeatmapEntry[] = [];

  try {
    const { db, contractUploadReviews, eq, and, inArray, sql } = await import("db");

    if (scope.visibleUserIds.length === 0) return entries;

    const perUser = await db.select({
      userId: contractUploadReviews.assignedTo,
      count: sql<number>`count(*)::int`,
    }).from(contractUploadReviews)
      .where(and(
        eq(contractUploadReviews.tenantId, scope.tenantId),
        inArray(contractUploadReviews.assignedTo, scope.visibleUserIds),
        sql`${contractUploadReviews.status} in ('extracted','review_required','blocked_for_apply')`,
      ))
      .groupBy(contractUploadReviews.assignedTo);

    for (const row of perUser) {
      if (!row.userId) continue;
      entries.push({
        dimension: "advisor_backlog",
        value: row.userId,
        metric: row.count,
        severity: row.count > 10 ? "high" : row.count > 5 ? "medium" : "low",
      });
    }
  } catch { /* best-effort */ }

  return entries;
}
