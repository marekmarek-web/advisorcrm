/**
 * Email delivery adapter (Plan 6A.4).
 * Wraps Resend infrastructure with draft lifecycle and execution tracking.
 */

import { sendEmail, logNotification } from "@/lib/email/send-email";
import type { ExecutionAction } from "./execution-service";

export type DeliveryState =
  | "draft" | "approved" | "scheduled" | "sending"
  | "sent" | "delivered" | "failed" | "cancelled" | "bounced";

export type EmailDeliveryResult = {
  ok: boolean;
  deliveryState: DeliveryState;
  messageId?: string;
  error?: string;
};

export async function sendEmailDraft(
  action: ExecutionAction,
): Promise<Record<string, unknown>> {
  const meta = action.metadata ?? {};
  const to = meta.recipientEmail as string;
  const subject = meta.subject as string;
  const html = meta.html as string;

  if (!to) return { ok: false, deliveryState: "failed", error: "NO_RECIPIENT_EMAIL" };
  if (!subject || !html) return { ok: false, deliveryState: "failed", error: "INCOMPLETE_DRAFT" };

  const result = await sendEmail({ to, subject, html });

  await logNotification({
    tenantId: action.tenantId,
    contactId: meta.contactId as string | undefined,
    channel: "email",
    template: meta.templateType as string | undefined,
    subject,
    recipient: to,
    status: result.ok ? "sent" : "failed",
  });

  return {
    ok: result.ok,
    deliveryState: result.ok ? "sent" : "failed",
    messageId: result.messageId,
    error: result.error,
  };
}

export async function scheduleEmailDraft(
  draft: {
    tenantId: string;
    sourceId: string;
    recipientEmail: string;
    subject: string;
    html: string;
    contactId?: string;
    templateType?: string;
  },
  sendAt: Date,
): Promise<{ executionId: string; scheduledFor: Date }> {
  const { scheduleAction } = await import("./execution-service");
  const action = await scheduleAction({
    sourceType: "ai_draft",
    sourceId: draft.sourceId,
    actionType: "communication_schedule",
    executionMode: "scheduled_after_approval",
    tenantId: draft.tenantId,
    riskLevel: "low",
    metadata: {
      recipientEmail: draft.recipientEmail,
      subject: draft.subject,
      html: draft.html,
      contactId: draft.contactId,
      templateType: draft.templateType,
    },
  }, sendAt);
  return { executionId: action.executionId, scheduledFor: sendAt };
}

export async function cancelScheduledEmail(
  executionId: string,
  tenantId: string,
): Promise<boolean> {
  const { cancelAction } = await import("./execution-service");
  return cancelAction(executionId, tenantId);
}

export async function getDeliveryStatus(
  executionId: string,
  tenantId: string,
): Promise<{ status: string; failureCode?: string } | null> {
  try {
    const { executionActions, eq, and } = await import("db");
    const { withServiceTenantContext } = await import("@/lib/db/service-db");
    const [row] = await withServiceTenantContext({ tenantId }, (tx) =>
      tx
        .select({
          status: executionActions.status,
          failureCode: executionActions.failureCode,
        })
        .from(executionActions)
        .where(and(eq(executionActions.id, executionId), eq(executionActions.tenantId, tenantId)))
        .limit(1),
    );
    if (!row) return null;
    return {
      status: row.status,
      failureCode: row.failureCode ?? undefined,
    };
  } catch {
    return null;
  }
}
