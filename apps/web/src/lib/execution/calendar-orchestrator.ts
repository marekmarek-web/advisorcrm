/**
 * Calendar orchestrator (Plan 6C.1).
 * AI-safe wrapper around events.ts for calendar event creation.
 */

import { validateExecution } from "./execution-guards";
import type { ExecutionContext } from "./execution-service";
import { withTenantContext } from "@/lib/db/with-tenant-context";

export type CalendarEventParams = {
  title: string;
  startAt: Date;
  endAt: Date;
  tenantId: string;
  assignedTo: string;
  contactId?: string;
  relatedReviewId?: string;
  relatedPaymentSetupId?: string;
  notes?: string;
  eventType?: string;
};

export type DeadlineInput = {
  entityType: "review" | "payment" | "task" | "contract";
  entityId: string;
  createdAt: Date;
  dueAt?: Date;
};

export function deriveDeadlines(inputs: DeadlineInput[]): { entityId: string; deadlineAt: Date; type: string }[] {
  const deadlines: { entityId: string; deadlineAt: Date; type: string }[] = [];

  for (const input of inputs) {
    if (input.dueAt) {
      deadlines.push({ entityId: input.entityId, deadlineAt: input.dueAt, type: `${input.entityType}_due` });
      continue;
    }

    const ageMs = Date.now() - input.createdAt.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);

    switch (input.entityType) {
      case "review":
        if (ageHours > 48) {
          const deadline = new Date(input.createdAt.getTime() + 96 * 60 * 60 * 1000);
          deadlines.push({ entityId: input.entityId, deadlineAt: deadline, type: "review_resolution" });
        }
        break;
      case "payment":
        if (ageHours > 24) {
          const deadline = new Date(input.createdAt.getTime() + 72 * 60 * 60 * 1000);
          deadlines.push({ entityId: input.entityId, deadlineAt: deadline, type: "payment_handling" });
        }
        break;
      case "task":
        if (ageHours > 24) {
          const deadline = new Date(input.createdAt.getTime() + 48 * 60 * 60 * 1000);
          deadlines.push({ entityId: input.entityId, deadlineAt: deadline, type: "task_overdue" });
        }
        break;
      case "contract":
        deadlines.push({
          entityId: input.entityId,
          deadlineAt: new Date(input.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
          type: "contract_expiry",
        });
        break;
    }
  }

  return deadlines;
}

export async function createFollowupEvent(
  params: CalendarEventParams,
  context: ExecutionContext,
): Promise<{ ok: boolean; eventId?: string; blockedReasons?: string[] }> {
  const guardResult = validateExecution(
    {
      executionId: "",
      sourceType: "user_action",
      sourceId: params.relatedReviewId ?? params.contactId ?? "calendar",
      actionType: "calendar_event_create",
      executionMode: "approval_required",
      status: "executing",
      tenantId: params.tenantId,
      riskLevel: "low",
    },
    context,
  );

  if (!guardResult.allowed) {
    return { ok: false, blockedReasons: guardResult.blockedReasons };
  }

  try {
    const { events } = await import("db");
    const insertedId = await withTenantContext(
      { tenantId: params.tenantId, userId: context.userId },
      async (tx) => {
        const [row] = await tx.insert(events).values({
          tenantId: params.tenantId,
          title: params.title,
          startAt: params.startAt,
          endAt: params.endAt,
          contactId: params.contactId,
          assignedTo: params.assignedTo,
          notes: params.notes,
          eventType: params.eventType ?? "followup",
          status: "scheduled",
        }).returning({ id: events.id });
        return row?.id;
      },
    );
    return { ok: true, eventId: insertedId };
  } catch {
    return { ok: false, blockedReasons: ["CALENDAR_CREATE_FAILED"] };
  }
}

export async function createReviewDeadlineReminder(
  reviewId: string,
  dueAt: Date,
  tenantId: string,
  assignedTo: string,
  context: ExecutionContext,
): Promise<{ ok: boolean; eventId?: string }> {
  return createFollowupEvent({
    title: `Review deadline: ${reviewId.slice(0, 8)}`,
    startAt: dueAt,
    endAt: new Date(dueAt.getTime() + 30 * 60_000),
    tenantId,
    assignedTo,
    relatedReviewId: reviewId,
    eventType: "review_deadline",
  }, context);
}

export async function createPaymentCheckReminder(
  paymentSetupId: string,
  dueAt: Date,
  tenantId: string,
  assignedTo: string,
  context: ExecutionContext,
): Promise<{ ok: boolean; eventId?: string }> {
  return createFollowupEvent({
    title: `Payment check: ${paymentSetupId.slice(0, 8)}`,
    startAt: dueAt,
    endAt: new Date(dueAt.getTime() + 30 * 60_000),
    tenantId,
    assignedTo,
    relatedPaymentSetupId: paymentSetupId,
    eventType: "payment_check",
  }, context);
}

export async function createClientMeeting(
  clientId: string,
  startAt: Date,
  endAt: Date,
  tenantId: string,
  assignedTo: string,
  context: ExecutionContext,
): Promise<{ ok: boolean; eventId?: string }> {
  return createFollowupEvent({
    title: "Schůzka s klientem",
    startAt,
    endAt,
    tenantId,
    assignedTo,
    contactId: clientId,
    eventType: "client_meeting",
  }, context);
}
