/**
 * Phase 2A: structured lifecycle events for assistant runs (audit_log, no PII / no raw prompts).
 */

import { logAuditAction } from "@/lib/audit";
import { getAssistantRunStore } from "./assistant-run-context";

/** Stable action names for filtering / dashboards. */
export const AssistantTelemetryAction = {
  RUN_START: "assistant.run_start",
  HYDRATE_DONE: "assistant.hydrate_done",
  ROUTE_LEGACY: "assistant.route_legacy",
  ROUTE_CANONICAL: "assistant.route_canonical",
  LEGACY_INTENT_EXTRACTED: "assistant.legacy_intent_extracted",
  CANONICAL_INTENT_EXTRACTED: "assistant.canonical_intent_extracted",
  ENTITY_RESOLUTION: "assistant.entity_resolution",
  EXECUTION_PLAN_BUILT: "assistant.execution_plan_built",
  CANONICAL_FALLBACK_LEGACY_CHAT: "assistant.canonical_fallback_legacy_chat",
  AWAITING_CONFIRMATION: "assistant.awaiting_confirmation",
  CONFIRMATION_EXECUTED: "assistant.confirmation_executed",
  CONFIRMATION_CANCELLED: "assistant.confirmation_cancelled",
  MORTGAGE_BUNDLE_WRITE: "assistant.mortgage_bundle_write",
  CONTEXT_SAFETY_BLOCKED: "assistant.context_safety_blocked",
  CONTEXT_SAFETY_CROSS_ENTITY: "assistant.context_safety_cross_entity",
  IDEMPOTENT_HIT: "assistant.idempotent_hit",
  DUPLICATE_DETECTED: "assistant.duplicate_detected",
  WRITE_PLAN_START: "assistant.write_plan_start",
  WRITE_PLAN_DONE: "assistant.write_plan_done",
  DEPENDENCY_SKIPPED: "assistant.dependency_skipped",
  RUN_COMPLETE: "assistant.run_complete",
  RUN_ERROR: "assistant.run_error",
} as const;

export type AssistantTelemetryActionType = (typeof AssistantTelemetryAction)[keyof typeof AssistantTelemetryAction];

/**
 * Fire-and-forget audit row for one lifecycle stage. No-op if run store is missing (e.g. tests).
 */
export function logAssistantTelemetry(
  action: AssistantTelemetryActionType,
  meta?: Record<string, unknown>,
): void {
  const ctx = getAssistantRunStore();
  if (!ctx) return;

  logAuditAction({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action,
    entityType: "assistant_run",
    entityId: ctx.assistantRunId,
    meta: {
      traceId: ctx.traceId,
      assistantRunId: ctx.assistantRunId,
      sessionId: ctx.sessionId,
      channel: ctx.channel ?? undefined,
      orchestration: ctx.orchestration ?? undefined,
      ...(meta ?? {}),
    },
  });
}
