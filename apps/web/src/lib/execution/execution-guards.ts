/**
 * Execution guards (Plan 6A.2).
 * Common pipeline of pre-execution checks for every action.
 */

import type { ExecutionAction, ExecutionContext } from "./execution-service";

export type GuardResult = {
  allowed: boolean;
  blockedReasons: string[];
  requiredOverrides: string[];
};

type GuardCheck = (action: ExecutionAction, ctx: ExecutionContext) => GuardResult | null;

function checkTenantIsolation(action: ExecutionAction, ctx: ExecutionContext): GuardResult | null {
  if (action.tenantId !== ctx.tenantId) {
    return { allowed: false, blockedReasons: ["TENANT_MISMATCH"], requiredOverrides: [] };
  }
  return null;
}

function checkPermission(action: ExecutionAction, ctx: ExecutionContext): GuardResult | null {
  const applyActions: string[] = ["portal_apply_prepare", "portal_apply_execute"];
  const communicationActions: string[] = ["communication_send", "communication_schedule"];

  if (applyActions.includes(action.actionType) && !["Admin", "Manager", "Advisor"].includes(ctx.roleName)) {
    return { allowed: false, blockedReasons: ["INSUFFICIENT_PERMISSION"], requiredOverrides: [] };
  }
  if (communicationActions.includes(action.actionType) && ctx.roleName === "Viewer") {
    return { allowed: false, blockedReasons: ["INSUFFICIENT_PERMISSION"], requiredOverrides: [] };
  }
  if (action.actionType === "escalation_emit" && !["Admin", "Manager", "Director"].includes(ctx.roleName)) {
    return { allowed: false, blockedReasons: ["INSUFFICIENT_PERMISSION"], requiredOverrides: [] };
  }
  return null;
}

function checkQualityGates(action: ExecutionAction, _ctx: ExecutionContext): GuardResult | null {
  if (!["portal_apply_prepare", "portal_apply_execute"].includes(action.actionType)) return null;
  const snapshot = action.qualityGateSnapshot;
  if (!snapshot) return null;

  if (snapshot.readiness === "blocked_for_apply") {
    const reasons = Array.isArray(snapshot.blockedReasons) ? snapshot.blockedReasons as string[] : ["QUALITY_GATE_BLOCKED"];
    return { allowed: false, blockedReasons: reasons, requiredOverrides: reasons };
  }
  return null;
}

const recentActions = new Map<string, number>();
const DEDUP_WINDOW_MS = 60_000;

function idempotencyKey(action: ExecutionAction): string {
  return `${action.sourceType}:${action.sourceId}:${action.actionType}`;
}

function checkDuplicatePrevention(action: ExecutionAction, _ctx: ExecutionContext): GuardResult | null {
  const key = idempotencyKey(action);
  const last = recentActions.get(key);
  if (last && Date.now() - last < DEDUP_WINDOW_MS) {
    return { allowed: false, blockedReasons: ["DUPLICATE_ACTION"], requiredOverrides: [] };
  }
  recentActions.set(key, Date.now());
  return null;
}

function checkConsentPreference(action: ExecutionAction, _ctx: ExecutionContext): GuardResult | null {
  if (!["communication_send", "communication_schedule"].includes(action.actionType)) return null;
  const meta = action.metadata;
  if (!meta) return null;

  if (meta.contactUnsubscribed === true) {
    return { allowed: false, blockedReasons: ["CONTACT_UNSUBSCRIBED"], requiredOverrides: [] };
  }
  if (meta.noEmail === true) {
    return { allowed: false, blockedReasons: ["NO_EMAIL_ADDRESS"], requiredOverrides: [] };
  }
  if (meta.doNotEmail === true) {
    return { allowed: false, blockedReasons: ["DO_NOT_EMAIL"], requiredOverrides: [] };
  }
  return null;
}

function checkExecutionMode(action: ExecutionAction, _ctx: ExecutionContext): GuardResult | null {
  if (action.executionMode === "auto_disabled") {
    return { allowed: false, blockedReasons: ["AUTO_DISABLED"], requiredOverrides: [] };
  }
  return null;
}

const GUARD_PIPELINE: GuardCheck[] = [
  checkTenantIsolation,
  checkPermission,
  checkQualityGates,
  checkDuplicatePrevention,
  checkConsentPreference,
  checkExecutionMode,
];

export function validateExecution(
  action: ExecutionAction,
  ctx: ExecutionContext,
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

  return allBlocked.length > 0
    ? { allowed: false, blockedReasons: allBlocked, requiredOverrides: allOverrides }
    : { allowed: true, blockedReasons: [], requiredOverrides: [] };
}

export function clearDedupStore(): void {
  recentActions.clear();
}
