/**
 * Execution service (Plan 6A.1).
 * Unified layer for turning approved drafts/recommendations into real-world actions.
 */

import { logAudit } from "@/lib/audit";

export type ActionFamily =
  | "communication_send" | "communication_schedule"
  | "task_create" | "reminder_schedule"
  | "calendar_event_create" | "notification_emit"
  | "escalation_emit" | "portal_apply_prepare" | "portal_apply_execute";

export type ExecutionMode =
  | "manual_only" | "draft_only" | "approval_required"
  | "scheduled_after_approval" | "auto_disabled";

export type ExecutionStatus =
  | "pending" | "approved" | "scheduled" | "executing"
  | "completed" | "failed" | "cancelled";

export type RiskLevel = "low" | "medium" | "high";

export type ExecutionAction = {
  executionId: string;
  sourceType: "ai_draft" | "user_action" | "cron" | "escalation";
  sourceId: string;
  actionType: ActionFamily;
  executionMode: ExecutionMode;
  status: ExecutionStatus;
  scheduledFor?: Date;
  executedAt?: Date;
  executedBy?: string;
  approvedBy?: string;
  tenantId: string;
  riskLevel: RiskLevel;
  qualityGateSnapshot?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  resultPayload?: Record<string, unknown>;
  failureCode?: string;
  retryCount?: number;
};

export type ExecutionContext = {
  tenantId: string;
  userId: string;
  roleName: string;
};

function generateExecutionId(): string {
  return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function persistAction(action: ExecutionAction): Promise<void> {
  try {
    const { db, executionActions } = await import("db");
    await db.insert(executionActions).values({
      id: action.executionId,
      tenantId: action.tenantId,
      sourceType: action.sourceType,
      sourceId: action.sourceId,
      actionType: action.actionType,
      executionMode: action.executionMode,
      status: action.status,
      scheduledFor: action.scheduledFor,
      executedAt: action.executedAt,
      executedBy: action.executedBy,
      approvedBy: action.approvedBy,
      riskLevel: action.riskLevel,
      metadata: action.metadata,
      resultPayload: action.resultPayload,
      failureCode: action.failureCode,
      retryCount: action.retryCount ?? 0,
    });
  } catch { /* persistence is best-effort in v1 */ }
}

async function updateActionStatus(
  executionId: string,
  status: ExecutionStatus,
  extra?: { resultPayload?: Record<string, unknown>; failureCode?: string; executedAt?: Date },
): Promise<void> {
  try {
    const { db, executionActions, eq } = await import("db");
    await db.update(executionActions).set({
      status,
      ...extra,
      updatedAt: new Date(),
    }).where(eq(executionActions.id, executionId));
  } catch { /* best-effort */ }
}

export async function executeAction(
  action: Omit<ExecutionAction, "executionId" | "status">,
  context: ExecutionContext,
): Promise<ExecutionAction> {
  const executionId = generateExecutionId();
  const fullAction: ExecutionAction = {
    ...action,
    executionId,
    status: "executing",
    executedBy: context.userId,
    executedAt: new Date(),
  };

  const { validateExecution } = await import("./execution-guards");
  const guardResult = validateExecution(fullAction, context);
  if (!guardResult.allowed) {
    fullAction.status = "failed";
    fullAction.failureCode = guardResult.blockedReasons[0] ?? "GUARD_BLOCKED";
    fullAction.resultPayload = { blockedReasons: guardResult.blockedReasons };
    await persistAction(fullAction);
    return fullAction;
  }

  await persistAction(fullAction);

  try {
    const result = await dispatchAction(fullAction, context);
    fullAction.status = "completed";
    fullAction.resultPayload = result;
    await updateActionStatus(executionId, "completed", { resultPayload: result, executedAt: new Date() });
  } catch (err) {
    fullAction.status = "failed";
    fullAction.failureCode = err instanceof Error ? err.message.slice(0, 100) : "UNKNOWN_ERROR";
    await updateActionStatus(executionId, "failed", { failureCode: fullAction.failureCode });
  }

  logAudit({
    tenantId: context.tenantId,
    userId: context.userId,
    action: `execution:${action.actionType}`,
    entityType: "execution_action",
    entityId: executionId,
    metadata: { status: fullAction.status, sourceType: action.sourceType },
  });

  return fullAction;
}

export async function scheduleAction(
  action: Omit<ExecutionAction, "executionId" | "status">,
  scheduledFor: Date,
): Promise<ExecutionAction> {
  const executionId = generateExecutionId();
  const fullAction: ExecutionAction = {
    ...action,
    executionId,
    status: "scheduled",
    scheduledFor,
  };
  await persistAction(fullAction);
  return fullAction;
}

export async function cancelAction(executionId: string, tenantId: string): Promise<boolean> {
  try {
    const { db, executionActions, eq, and } = await import("db");
    const [row] = await db.select().from(executionActions)
      .where(and(eq(executionActions.id, executionId), eq(executionActions.tenantId, tenantId)))
      .limit(1);
    if (!row) return false;
    if (row.status !== "pending" && row.status !== "scheduled") return false;
    await updateActionStatus(executionId, "cancelled");
    return true;
  } catch {
    return false;
  }
}

async function dispatchAction(
  action: ExecutionAction,
  _context: ExecutionContext,
): Promise<Record<string, unknown>> {
  switch (action.actionType) {
    case "communication_send": {
      const { sendEmailDraft } = await import("./email-delivery-adapter");
      return await sendEmailDraft(action);
    }
    case "notification_emit":
      return { dispatched: true, channel: "notification" };
    case "task_create":
      return { dispatched: true, channel: "task" };
    case "reminder_schedule":
      return { dispatched: true, channel: "reminder" };
    case "calendar_event_create":
      return { dispatched: true, channel: "calendar" };
    default:
      return { dispatched: true, actionType: action.actionType };
  }
}
