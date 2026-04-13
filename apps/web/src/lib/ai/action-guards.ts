/**
 * Action guards for validating assistant-suggested action execution (Plan 5B.4).
 * Pipeline of pre-execution checks.
 */

import type { ActionPayload, ExecutionMode } from "./action-catalog";
import { applyReasonsPendingOverride, evaluateApplyReadiness } from "./quality-gates";

export type ActionGuardContext = {
  tenantId: string;
  userId: string;
  roleName: string;
  reviewRow?: {
    tenantId: string;
    reviewStatus: string | null;
    matchedClientId: string | null;
    matchedClientCandidates: unknown;
    processingStatus: string;
    confidence: number | null;
    extractionTrace?: Record<string, unknown>;
    extractedPayload?: Record<string, unknown>;
    detectedDocumentType?: string | null;
  };
};

export type GuardResult = {
  allowed: boolean;
  blockedReasons: string[];
  requiredOverrides: string[];
};

type GuardCheck = (action: ActionPayload, ctx: ActionGuardContext) => GuardResult | null;

function checkTenantIsolation(action: ActionPayload, ctx: ActionGuardContext): GuardResult | null {
  if (ctx.reviewRow && ctx.reviewRow.tenantId !== ctx.tenantId) {
    return { allowed: false, blockedReasons: ["TENANT_MISMATCH"], requiredOverrides: [] };
  }
  return null;
}

function checkPermission(_action: ActionPayload, ctx: ActionGuardContext): GuardResult | null {
  const draftActions = ["create_task_draft", "create_followup_draft", "create_email_draft"];
  const applyActions = ["prepare_payment_apply", "prepare_contract_apply", "confirm_create_new_client"];

  if (draftActions.includes(_action.actionType) && ctx.roleName === "Viewer") {
    return { allowed: false, blockedReasons: ["INSUFFICIENT_PERMISSION"], requiredOverrides: [] };
  }
  if (applyActions.includes(_action.actionType) && !["Admin", "Manager", "Advisor"].includes(ctx.roleName)) {
    return { allowed: false, blockedReasons: ["INSUFFICIENT_PERMISSION"], requiredOverrides: [] };
  }
  return null;
}

function checkQualityGate(action: ActionPayload, ctx: ActionGuardContext): GuardResult | null {
  if (!["prepare_contract_apply", "prepare_payment_apply"].includes(action.actionType)) return null;
  if (!ctx.reviewRow) return null;

  try {
    const gate = evaluateApplyReadiness(
      ctx.reviewRow as unknown as Parameters<typeof evaluateApplyReadiness>[0],
    );
    const pending = applyReasonsPendingOverride(gate);
    if (pending.length > 0) {
      return {
        allowed: false,
        blockedReasons: pending,
        requiredOverrides: pending,
      };
    }
  } catch {
    /* best-effort: partial review row or gate module edge case */
  }
  return null;
}

function checkDuplicatePrevention(action: ActionPayload, _ctx: ActionGuardContext): GuardResult | null {
  if (action.payload._isDuplicate === true) {
    return { allowed: false, blockedReasons: ["DUPLICATE_ACTION"], requiredOverrides: [] };
  }
  return null;
}

function checkClientSelection(action: ActionPayload, ctx: ActionGuardContext): GuardResult | null {
  if (!["prepare_contract_apply"].includes(action.actionType)) return null;
  if (!ctx.reviewRow) return null;

  if (!ctx.reviewRow.matchedClientId) {
    const candidates = ctx.reviewRow.matchedClientCandidates;
    const trace = ctx.reviewRow.extractionTrace as Record<string, unknown> | undefined;
    const matchVerdict = trace?.matchVerdict as string | undefined;

    if (matchVerdict === "ambiguous_match") {
      return { allowed: false, blockedReasons: ["AMBIGUOUS_CLIENT_MATCH"], requiredOverrides: ["select_client_candidate"] };
    }
    if (matchVerdict === "near_match" || matchVerdict === "existing_match" || matchVerdict === "no_match") {
      // near_match: advisory, not blocking — allow with top candidate default
      // existing_match: should have matchedClientId already set; if missing, allow through
      // no_match: create-client flow, no block
      return null;
    }
    // Legacy fallback: no verdict present → use raw candidate count
    if (matchVerdict == null) {
      const hasMultiple = Array.isArray(candidates) && candidates.length > 1;
      if (hasMultiple) {
        return { allowed: false, blockedReasons: ["AMBIGUOUS_CLIENT_MATCH"], requiredOverrides: ["select_client_candidate"] };
      }
      if (!candidates || (Array.isArray(candidates) && candidates.length === 0)) {
        return { allowed: false, blockedReasons: ["NO_CLIENT_MATCH"], requiredOverrides: ["confirm_create_new_client"] };
      }
    }
  }
  return null;
}

function checkExecutionMode(action: ActionPayload, _ctx: ActionGuardContext): GuardResult | null {
  const mode: ExecutionMode = action.executionMode;
  if (mode === "auto_disabled") {
    return { allowed: false, blockedReasons: ["AUTO_DISABLED"], requiredOverrides: [] };
  }
  return null;
}

const GUARD_PIPELINE: GuardCheck[] = [
  checkTenantIsolation,
  checkPermission,
  checkQualityGate,
  checkDuplicatePrevention,
  checkClientSelection,
  checkExecutionMode,
];

export function validateActionExecution(
  action: ActionPayload,
  ctx: ActionGuardContext,
): GuardResult {
  const allBlocked: string[] = [];
  const allOverrides: string[] = [];

  for (const check of GUARD_PIPELINE) {
    const result = check(action, ctx);
    if (result && !result.allowed) {
      allBlocked.push(...result.blockedReasons);
      allOverrides.push(...result.requiredOverrides);
    }
  }

  if (allBlocked.length > 0) {
    return { allowed: false, blockedReasons: allBlocked, requiredOverrides: allOverrides };
  }
  return { allowed: true, blockedReasons: [], requiredOverrides: [] };
}
