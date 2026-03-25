import { z } from "zod";

export const PUSH_EVENT_TYPES = [
  "NEW_LEAD",
  "NEW_DOCUMENT",
  "CLIENT_REQUEST",
  "NEW_TASK",
  "REQUEST_STATUS_CHANGE",
  "NEW_MESSAGE",
  "REVIEW_WAITING",
  "PAYMENT_BLOCKED",
  "REMINDER_DUE",
  "ESCALATION",
] as const;

export type PushEventType = (typeof PUSH_EVENT_TYPES)[number];

export const PushEventPayloadSchema = z.object({
  type: z.enum(PUSH_EVENT_TYPES),
  title: z.string().min(1).max(120),
  body: z.string().max(500).optional(),
  tenantId: z.string().uuid(),
  userId: z.string().min(1),
  data: z.record(z.string(), z.string()).optional(),
});

export type PushEventPayload = z.infer<typeof PushEventPayloadSchema>;
