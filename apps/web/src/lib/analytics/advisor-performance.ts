/**
 * Advisor performance service (Plan 7A.2).
 * Personal summary, performance metrics, and bottleneck analysis.
 */

import type { TimeWindow } from "./analytics-scope";

export type AdvisorSummary = {
  pendingReviews: number;
  blockedItems: number;
  paymentSetupsWaiting: number;
  tasksDue: number;
  overdueTasks: number;
  communicationDraftsAwaiting: number;
  applyReadyItems: number;
  escalations: number;
};

export type AdvisorPerformanceMetrics = {
  documentsProcessed: number;
  averageReviewTimeHours: number;
  applyCompletionRate: number;
  correctionRate: number;
  followUpCompletionRate: number;
  overdueRatio: number;
  aiAssistantUsageCount: number;
};

export type AdvisorBottleneck = {
  topBlockedReasons: { reason: string; count: number }[];
  mostCorrectedFields: { field: string; count: number }[];
  worstDocTypes: { docType: string; failRate: number }[];
};

export async function getAdvisorSummary(
  tenantId: string,
  userId: string,
): Promise<AdvisorSummary> {
  const summary: AdvisorSummary = {
    pendingReviews: 0,
    blockedItems: 0,
    paymentSetupsWaiting: 0,
    tasksDue: 0,
    overdueTasks: 0,
    communicationDraftsAwaiting: 0,
    applyReadyItems: 0,
    escalations: 0,
  };

  try {
    const { db, contractUploadReviews, clientPaymentSetups, tasks, reminders, communicationDrafts, escalationEvents, eq, and, sql } = await import("db");

    const [reviewCounts] = await db.select({
      pending: sql<number>`count(*) filter (where ${contractUploadReviews.status} in ('extracted','review_required'))::int`,
      blocked: sql<number>`count(*) filter (where ${contractUploadReviews.status} = 'blocked_for_apply')::int`,
      applyReady: sql<number>`count(*) filter (where ${contractUploadReviews.status} = 'approved')::int`,
    }).from(contractUploadReviews)
      .where(and(eq(contractUploadReviews.tenantId, tenantId), eq(contractUploadReviews.assignedTo, userId)));

    if (reviewCounts) {
      summary.pendingReviews = reviewCounts.pending;
      summary.blockedItems = reviewCounts.blocked;
      summary.applyReadyItems = reviewCounts.applyReady;
    }

    const [paymentCount] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(clientPaymentSetups)
      .where(and(eq(clientPaymentSetups.tenantId, tenantId), eq(clientPaymentSetups.needsHumanReview, true)));
    summary.paymentSetupsWaiting = paymentCount?.count ?? 0;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const [taskCounts] = await db.select({
      due: sql<number>`count(*) filter (where ${tasks.dueDate} = ${todayStr} and ${tasks.completedAt} is null)::int`,
      overdue: sql<number>`count(*) filter (where ${tasks.dueDate} < ${todayStr} and ${tasks.completedAt} is null)::int`,
    }).from(tasks)
      .where(and(eq(tasks.tenantId, tenantId), eq(tasks.assignedTo, userId)));
    if (taskCounts) {
      summary.tasksDue = taskCounts.due;
      summary.overdueTasks = taskCounts.overdue;
    }

    const [draftCount] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(communicationDrafts)
      .where(and(eq(communicationDrafts.tenantId, tenantId), eq(communicationDrafts.createdBy, userId), eq(communicationDrafts.status, "draft")));
    summary.communicationDraftsAwaiting = draftCount?.count ?? 0;

    const [escCount] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(escalationEvents)
      .where(and(eq(escalationEvents.tenantId, tenantId), eq(escalationEvents.escalatedTo, userId), eq(escalationEvents.status, "pending")));
    summary.escalations = escCount?.count ?? 0;
  } catch { /* best-effort */ }

  return summary;
}

export async function getAdvisorPerformance(
  tenantId: string,
  userId: string,
  window?: TimeWindow,
): Promise<AdvisorPerformanceMetrics> {
  const metrics: AdvisorPerformanceMetrics = {
    documentsProcessed: 0,
    averageReviewTimeHours: 0,
    applyCompletionRate: 0,
    correctionRate: 0,
    followUpCompletionRate: 0,
    overdueRatio: 0,
    aiAssistantUsageCount: 0,
  };

  const windowStart = window?.startDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    const { db, contractUploadReviews, contractReviewCorrections, auditLog, tasks, eq, and, gte, sql } = await import("db");

    const [docStats] = await db.select({
      total: sql<number>`count(*)::int`,
      avgAge: sql<number>`coalesce(avg(extract(epoch from (now() - ${contractUploadReviews.createdAt})) / 3600), 0)::float`,
      applied: sql<number>`count(*) filter (where ${contractUploadReviews.status} = 'applied')::int`,
    }).from(contractUploadReviews)
      .where(and(
        eq(contractUploadReviews.tenantId, tenantId),
        eq(contractUploadReviews.assignedTo, userId),
        gte(contractUploadReviews.createdAt, windowStart),
      ));
    if (docStats) {
      metrics.documentsProcessed = docStats.total;
      metrics.averageReviewTimeHours = Math.round(docStats.avgAge * 10) / 10;
      metrics.applyCompletionRate = docStats.total > 0 ? Math.round((docStats.applied / docStats.total) * 100) / 100 : 0;
    }

    const [corrCount] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(contractReviewCorrections)
      .where(and(
        eq(contractReviewCorrections.tenantId, tenantId),
        eq(contractReviewCorrections.correctedBy, userId),
        gte(contractReviewCorrections.createdAt, windowStart),
      ));
    const corrected = corrCount?.count ?? 0;
    metrics.correctionRate = metrics.documentsProcessed > 0 ? Math.round((corrected / metrics.documentsProcessed) * 100) / 100 : 0;

    const todayStr = new Date().toISOString().slice(0, 10);
    const [taskStats] = await db.select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${tasks.completedAt} is not null)::int`,
      overdue: sql<number>`count(*) filter (where ${tasks.dueDate} < ${todayStr} and ${tasks.completedAt} is null)::int`,
    }).from(tasks)
      .where(and(eq(tasks.tenantId, tenantId), eq(tasks.assignedTo, userId)));
    if (taskStats && taskStats.total > 0) {
      metrics.followUpCompletionRate = Math.round((taskStats.completed / taskStats.total) * 100) / 100;
      metrics.overdueRatio = Math.round((taskStats.overdue / taskStats.total) * 100) / 100;
    }

    const [aiCount] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(auditLog)
      .where(and(
        eq(auditLog.tenantId, tenantId),
        eq(auditLog.userId, userId),
        sql`${auditLog.action} like 'assistant:%'`,
        gte(auditLog.createdAt, windowStart),
      ));
    metrics.aiAssistantUsageCount = aiCount?.count ?? 0;
  } catch { /* best-effort */ }

  return metrics;
}

export async function getAdvisorBottlenecks(
  tenantId: string,
  userId: string,
): Promise<AdvisorBottleneck> {
  const bottleneck: AdvisorBottleneck = {
    topBlockedReasons: [],
    mostCorrectedFields: [],
    worstDocTypes: [],
  };

  try {
    const { db, contractReviewCorrections, eq, and, sql } = await import("db");

    const corrections = await db.select({
      correctedFields: contractReviewCorrections.correctedFields,
    }).from(contractReviewCorrections)
      .where(and(eq(contractReviewCorrections.tenantId, tenantId), eq(contractReviewCorrections.correctedBy, userId)))
      .limit(200);

    const fieldCounts = new Map<string, number>();
    for (const c of corrections) {
      const fields = c.correctedFields as string[] | null;
      if (fields) {
        for (const f of fields) {
          fieldCounts.set(f, (fieldCounts.get(f) ?? 0) + 1);
        }
      }
    }
    bottleneck.mostCorrectedFields = [...fieldCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([field, count]) => ({ field, count }));
  } catch { /* best-effort */ }

  return bottleneck;
}
