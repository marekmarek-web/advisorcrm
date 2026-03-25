/**
 * Assistant analytics (Plan 7C.1).
 * AI assistant usage, use-case breakdown, and helpfulness metrics.
 */

import type { TimeWindow } from "./analytics-scope";

export type AssistantUsageMetrics = {
  uniqueUsers: number;
  sessions: number;
  queries: number;
  toolsInvoked: number;
  actionsSuggested: number;
  draftsCreated: number;
  draftsApproved: number;
  draftsRejected: number;
  actionsApplied: number;
};

export type AssistantUseCaseBreakdown = {
  toolOrAction: string;
  count: number;
  percentage: number;
};

export type AssistantHelpfulnessMetrics = {
  actionAcceptanceRate: number;
  draftEditRate: number;
  rejectionRate: number;
  fallbackRate: number;
};

const EVENT_PATTERNS = {
  query: "assistant:query",
  tool_invoked: "assistant:tool_invoked",
  action_suggested: "assistant:action_suggested",
  draft_created: "assistant:draft_created",
  draft_approved: "assistant:draft_approved",
  draft_rejected: "assistant:draft_rejected",
  action_applied: "assistant:action_applied",
  opened: "assistant:opened",
} as const;

export async function getAssistantUsageMetrics(
  tenantId: string,
  window?: TimeWindow,
): Promise<AssistantUsageMetrics> {
  const metrics: AssistantUsageMetrics = {
    uniqueUsers: 0,
    sessions: 0,
    queries: 0,
    toolsInvoked: 0,
    actionsSuggested: 0,
    draftsCreated: 0,
    draftsApproved: 0,
    draftsRejected: 0,
    actionsApplied: 0,
  };

  try {
    const { db, auditLog, eq, and, gte, sql } = await import("db");

    const windowStart = window?.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [stats] = await db.select({
      uniqueUsers: sql<number>`count(distinct ${auditLog.userId})::int`,
      sessions: sql<number>`count(*) filter (where ${auditLog.action} = ${EVENT_PATTERNS.opened})::int`,
      queries: sql<number>`count(*) filter (where ${auditLog.action} = ${EVENT_PATTERNS.query})::int`,
      toolsInvoked: sql<number>`count(*) filter (where ${auditLog.action} = ${EVENT_PATTERNS.tool_invoked})::int`,
      actionsSuggested: sql<number>`count(*) filter (where ${auditLog.action} = ${EVENT_PATTERNS.action_suggested})::int`,
      draftsCreated: sql<number>`count(*) filter (where ${auditLog.action} = ${EVENT_PATTERNS.draft_created})::int`,
      draftsApproved: sql<number>`count(*) filter (where ${auditLog.action} = ${EVENT_PATTERNS.draft_approved})::int`,
      draftsRejected: sql<number>`count(*) filter (where ${auditLog.action} = ${EVENT_PATTERNS.draft_rejected})::int`,
      actionsApplied: sql<number>`count(*) filter (where ${auditLog.action} = ${EVENT_PATTERNS.action_applied})::int`,
    }).from(auditLog)
      .where(and(
        eq(auditLog.tenantId, tenantId),
        sql`${auditLog.action} like 'assistant:%'`,
        gte(auditLog.createdAt, windowStart),
      ));

    if (stats) {
      metrics.uniqueUsers = stats.uniqueUsers;
      metrics.sessions = stats.sessions;
      metrics.queries = stats.queries;
      metrics.toolsInvoked = stats.toolsInvoked;
      metrics.actionsSuggested = stats.actionsSuggested;
      metrics.draftsCreated = stats.draftsCreated;
      metrics.draftsApproved = stats.draftsApproved;
      metrics.draftsRejected = stats.draftsRejected;
      metrics.actionsApplied = stats.actionsApplied;
    }
  } catch { /* best-effort */ }

  return metrics;
}

export async function getAssistantUseCaseBreakdown(
  tenantId: string,
  window?: TimeWindow,
): Promise<AssistantUseCaseBreakdown[]> {
  const breakdown: AssistantUseCaseBreakdown[] = [];

  try {
    const { db, auditLog, eq, and, gte, sql } = await import("db");

    const windowStart = window?.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const rows = await db.select({
      action: auditLog.action,
      count: sql<number>`count(*)::int`,
    }).from(auditLog)
      .where(and(
        eq(auditLog.tenantId, tenantId),
        sql`${auditLog.action} like 'assistant:%'`,
        gte(auditLog.createdAt, windowStart),
      ))
      .groupBy(auditLog.action);

    const total = rows.reduce((sum, r) => sum + r.count, 0);
    for (const row of rows) {
      breakdown.push({
        toolOrAction: row.action as string,
        count: row.count,
        percentage: total > 0 ? Math.round((row.count / total) * 100) / 100 : 0,
      });
    }
  } catch { /* best-effort */ }

  return breakdown.sort((a, b) => b.count - a.count);
}

export async function getAssistantHelpfulness(
  tenantId: string,
  window?: TimeWindow,
): Promise<AssistantHelpfulnessMetrics> {
  const metrics: AssistantHelpfulnessMetrics = {
    actionAcceptanceRate: 0,
    draftEditRate: 0,
    rejectionRate: 0,
    fallbackRate: 0,
  };

  try {
    const usage = await getAssistantUsageMetrics(tenantId, window);

    const totalActions = usage.actionsSuggested;
    if (totalActions > 0) {
      metrics.actionAcceptanceRate = Math.round((usage.actionsApplied / totalActions) * 100) / 100;
    }

    const totalDrafts = usage.draftsCreated;
    if (totalDrafts > 0) {
      metrics.rejectionRate = Math.round((usage.draftsRejected / totalDrafts) * 100) / 100;
      metrics.draftEditRate = Math.round(((totalDrafts - usage.draftsApproved - usage.draftsRejected) / totalDrafts) * 100) / 100;
    }
  } catch { /* best-effort */ }

  return metrics;
}
