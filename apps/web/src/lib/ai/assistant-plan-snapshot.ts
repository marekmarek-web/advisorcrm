import type { ExecutionPlan } from "./assistant-domain-model";

export function normalizeExecutionPlanFromDb(raw: unknown): ExecutionPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as ExecutionPlan;
  if (typeof p.planId !== "string" || !Array.isArray(p.steps)) return null;
  const createdAt =
    p.createdAt instanceof Date ? p.createdAt : new Date(String((p as { createdAt?: unknown }).createdAt));
  if (Number.isNaN(createdAt.getTime())) return null;
  return { ...p, createdAt };
}

/** True when the persisted plan should be copied back into in-memory session (resume confirm / interrupted run). */
export function isResumableExecutionPlanStatus(plan: ExecutionPlan): boolean {
  return plan.status === "awaiting_confirmation" || plan.status === "draft" || plan.status === "executing";
}
