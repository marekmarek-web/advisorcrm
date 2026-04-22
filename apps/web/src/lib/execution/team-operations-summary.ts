/**
 * Team operations summary (Plan 6C.4).
 * Per-advisor operational metrics for manager view.
 */

import { withTenantContext } from "@/lib/db/with-tenant-context";

export type AdvisorOperationalMetrics = {
  advisorId: string;
  advisorName?: string;
  pendingReviews: number;
  blockedPaymentSetups: number;
  followUpBacklog: number;
  overdueReminders: number;
  unresolvedEscalations: number;
  averageReviewAgeHours: number;
  communicationDraftsPending: number;
  communicationDraftsSent: number;
};

export type TeamOperationsSummary = {
  tenantId: string;
  totalPendingReviews: number;
  totalBlockedPayments: number;
  totalOverdueReminders: number;
  totalUnresolvedEscalations: number;
  averageReviewAgeHours: number;
  advisorMetrics: AdvisorOperationalMetrics[];
};

export async function getTeamOperationsSummary(
  tenantId: string,
): Promise<TeamOperationsSummary> {
  const advisorMetrics: AdvisorOperationalMetrics[] = [];

  try {
    const { contractUploadReviews, eq, sql } = await import("db");

    const reviewStats = await withTenantContext({ tenantId }, async (tx) => {
      return await tx
        .select({
          uploadedBy: contractUploadReviews.uploadedBy,
          count: sql<number>`count(*)::int`,
          avgAge: sql<number>`COALESCE(avg(extract(epoch from (now() - ${contractUploadReviews.createdAt})) / 3600), 0)::float`,
        })
        .from(contractUploadReviews)
        .where(eq(contractUploadReviews.tenantId, tenantId))
        .groupBy(contractUploadReviews.uploadedBy);
    });

    for (const stat of reviewStats) {
      if (!stat.uploadedBy) continue;
      advisorMetrics.push({
        advisorId: stat.uploadedBy,
        pendingReviews: stat.count,
        blockedPaymentSetups: 0,
        followUpBacklog: 0,
        overdueReminders: 0,
        unresolvedEscalations: 0,
        averageReviewAgeHours: stat.avgAge,
        communicationDraftsPending: 0,
        communicationDraftsSent: 0,
      });
    }
  } catch { /* best-effort */ }

  const totalPendingReviews = advisorMetrics.reduce((s, m) => s + m.pendingReviews, 0);
  const totalBlockedPayments = advisorMetrics.reduce((s, m) => s + m.blockedPaymentSetups, 0);
  const totalOverdueReminders = advisorMetrics.reduce((s, m) => s + m.overdueReminders, 0);
  const totalUnresolvedEscalations = advisorMetrics.reduce((s, m) => s + m.unresolvedEscalations, 0);
  const avgReviewAge = advisorMetrics.length > 0
    ? advisorMetrics.reduce((s, m) => s + m.averageReviewAgeHours, 0) / advisorMetrics.length
    : 0;

  return {
    tenantId,
    totalPendingReviews,
    totalBlockedPayments,
    totalOverdueReminders,
    totalUnresolvedEscalations,
    averageReviewAgeHours: avgReviewAge,
    advisorMetrics,
  };
}

export async function reassignReview(
  reviewId: string,
  _fromAdvisorId: string,
  toAdvisorId: string,
  tenantId: string,
): Promise<boolean> {
  try {
    const { contractUploadReviews, eq, and } = await import("db");
    await withTenantContext({ tenantId }, async (tx) => {
      await tx.update(contractUploadReviews).set({
        uploadedBy: toAdvisorId,
      }).where(and(
        eq(contractUploadReviews.id, reviewId),
        eq(contractUploadReviews.tenantId, tenantId),
      ));
    });
    return true;
  } catch {
    return false;
  }
}

export async function reassignFollowUp(
  taskId: string,
  toAdvisorId: string,
  tenantId: string,
): Promise<boolean> {
  try {
    const { tasks, eq, and } = await import("db");
    await withTenantContext({ tenantId }, async (tx) => {
      await tx.update(tasks).set({
        assignedTo: toAdvisorId,
      }).where(and(
        eq(tasks.id, taskId),
        eq(tasks.tenantId, tenantId),
      ));
    });
    return true;
  } catch {
    return false;
  }
}
