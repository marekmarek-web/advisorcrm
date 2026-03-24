/**
 * Assistant audit events (Plan 5D.2).
 * Wraps logAudit with assistant-specific event types and sensitive field masking.
 */

import { logAudit } from "@/lib/audit";

export type AssistantAuditEventType =
  | "assistant_opened"
  | "assistant_query"
  | "tool_invoked"
  | "action_suggested"
  | "draft_created"
  | "draft_approved"
  | "draft_rejected"
  | "action_applied"
  | "permission_denied"
  | "quality_gate_override";

export type AssistantAuditEvent = {
  eventType: AssistantAuditEventType;
  tenantId: string;
  userId: string;
  sessionId?: string;
  toolName?: string;
  actionType?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

const IBAN_PATTERN = /\b[A-Z]{2}\d{2}[\dA-Z]{11,30}\b/g;
const PID_PATTERN = /\b\d{6}[\/]?\d{3,4}\b/g;
const ACCOUNT_PATTERN = /\b\d{6,10}[\/]\d{4}\b/g;

function maskSensitive(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(IBAN_PATTERN, (m) => "..." + m.slice(-4))
      .replace(PID_PATTERN, "XX/XXXX")
      .replace(ACCOUNT_PATTERN, "XXXX/XXXX");
  }
  if (Array.isArray(value)) {
    return value.map(maskSensitive);
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = maskSensitive(v);
    }
    return result;
  }
  return value;
}

export function logAssistantEvent(event: AssistantAuditEvent): void {
  const maskedMeta = event.metadata ? (maskSensitive(event.metadata) as Record<string, unknown>) : undefined;

  logAudit({
    action: `assistant:${event.eventType}`,
    userId: event.userId,
    tenantId: event.tenantId,
    resourceId: event.entityId,
    resourceType: event.entityType ?? "assistant",
    metadata: {
      sessionId: event.sessionId,
      toolName: event.toolName,
      actionType: event.actionType,
      ...maskedMeta,
      masked: true,
    },
  });
}

export { maskSensitive };
