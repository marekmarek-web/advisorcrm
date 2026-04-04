/**
 * Maps persisted assistant_messages rows to client-safe chat payloads (advisor drawer / mobile).
 */
import type { ExecutionPlan } from "./assistant-domain-model";
import { normalizeExecutionPlanFromDb } from "./assistant-plan-snapshot";
import type { StepPreviewItem } from "./assistant-execution-ui";
/** Namespace import avoids duplicate named bindings if merges duplicate lines in `{ … }`. */
import * as assistantExecutionPlan from "./assistant-execution-plan";
import { sanitizeAssistantMessageForAdvisor, sanitizeWarningForAdvisor } from "./assistant-message-sanitizer";

export type AssistantConversationRow = {
  id: string;
  channel: string | null;
  lockedContactId: string | null;
  updatedAt: Date;
};

export type AssistantMessageHistoryRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
  meta: Record<string, unknown> | null;
  executionPlanSnapshot: unknown;
};

export type AdvisorAssistantHistoryUserMessage = {
  kind: "user";
  stableKey: string;
  content: string;
  createdAtIso: string;
};

export type AdvisorAssistantHistoryAssistantMessage = {
  kind: "assistant";
  stableKey: string;
  content: string;
  createdAtIso: string;
  warnings: string[];
  executionState: {
    status: "draft" | "awaiting_confirmation" | "executing" | "completed" | "partial_failure";
    planId?: string;
    totalSteps?: number;
    pendingSteps?: number;
    stepPreviews?: StepPreviewItem[];
    clientLabel?: string;
  } | null;
  contextState: {
    channel: string | null;
    lockedClientId: string | null;
    lockedClientLabel?: string | null;
  } | null;
};

export type AdvisorAssistantHistoryMessageDto =
  | AdvisorAssistantHistoryUserMessage
  | AdvisorAssistantHistoryAssistantMessage;

function stepPreviewsFromPlan(plan: ExecutionPlan): StepPreviewItem[] {
  return plan.steps.map((s) => {
    const pf = assistantExecutionPlan.computeWriteStepPreflight(s.action, s.params);
    const baseVw = assistantExecutionPlan.buildValidationWarnings(s.action, s.params);
    const extra =
      pf.preflightStatus === "needs_input" && pf.advisorMessage && pf.missingFields.length === 0
        ? [pf.advisorMessage]
        : [];
    return {
      stepId: s.stepId,
      label: s.label,
      action: s.label,
      contextHint: assistantExecutionPlan.productDomainChipLabel(
        s.params.productDomain as string | undefined,
      ),
      description: assistantExecutionPlan.buildStepDescription(s.action, s.params),
      domainGroup:
        assistantExecutionPlan.productDomainChipLabel(s.params.productDomain as string | undefined) ?? null,
      validationWarnings: [...baseVw, ...extra],
      preflightStatus: pf.preflightStatus,
      blockedReason: pf.preflightStatus === "blocked" ? pf.advisorMessage : undefined,
    };
  });
}

function executionStateFromPlan(plan: ExecutionPlan | null): AdvisorAssistantHistoryAssistantMessage["executionState"] {
  if (!plan) return null;
  const pendingSteps = plan.steps.filter((s) => s.status === "requires_confirmation").length;
  const showPreviews = plan.status === "awaiting_confirmation" || plan.status === "draft";
  return {
    status: plan.status,
    planId: plan.planId,
    totalSteps: plan.steps.length,
    pendingSteps,
    stepPreviews: showPreviews ? stepPreviewsFromPlan(plan) : undefined,
    clientLabel: undefined,
  };
}

function warningsFromMeta(meta: Record<string, unknown> | null): string[] {
  if (!meta || !Array.isArray(meta.warnings)) return [];
  return meta.warnings
    .filter((w): w is string => typeof w === "string")
    .map(sanitizeWarningForAdvisor)
    .filter((w) => w.length > 0);
}

/**
 * Rows must be in chronological order (oldest first).
 */
export function mapAssistantHistoryRowsToClientPayload(
  rows: AssistantMessageHistoryRow[],
  conversation: AssistantConversationRow,
): AdvisorAssistantHistoryMessageDto[] {
  const lastAssistantIndex = (() => {
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i]!.role === "assistant") return i;
    }
    return -1;
  })();

  const out: AdvisorAssistantHistoryMessageDto[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.role === "user") {
      out.push({
        kind: "user",
        stableKey: r.id,
        content: r.content,
        createdAtIso: r.createdAt.toISOString(),
      });
      continue;
    }
    if (r.role === "system") {
      continue;
    }
    const plan = normalizeExecutionPlanFromDb(r.executionPlanSnapshot);
    const isLastAssistant = i === lastAssistantIndex;
    const lockedId = isLastAssistant ? conversation.lockedContactId : null;
    out.push({
      kind: "assistant",
      stableKey: r.id,
      content: sanitizeAssistantMessageForAdvisor(r.content),
      createdAtIso: r.createdAt.toISOString(),
      warnings: warningsFromMeta(r.meta),
      executionState: executionStateFromPlan(plan),
      contextState:
        lockedId != null
          ? {
              channel: conversation.channel,
              lockedClientId: lockedId,
              lockedClientLabel: null,
            }
          : null,
    });
  }
  return out;
}
