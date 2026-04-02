/**
 * Unified execution engine: runs confirmed ExecutionPlan steps against
 * the execution_actions ledger with DB-backed idempotency and audit logging.
 */

import { randomUUID } from "crypto";
import { db, executionActions, eq, and } from "db";
import type {
  ExecutionPlan,
  ExecutionStep,
  ExecutionStepResult,
  WriteActionType,
  VerifiedAssistantResult,
} from "./assistant-domain-model";
import { logAudit } from "../audit";

export type ExecutionContext = {
  tenantId: string;
  userId: string;
  sessionId: string;
  roleName: string;
  ipAddress?: string;
};

type WriteAdapter = (
  params: Record<string, unknown>,
  ctx: ExecutionContext,
) => Promise<ExecutionStepResult>;

const writeAdapters = new Map<WriteActionType, WriteAdapter>();

export function registerWriteAdapter(action: WriteActionType, adapter: WriteAdapter): void {
  writeAdapters.set(action, adapter);
}

async function checkIdempotency(
  tenantId: string,
  actionType: string,
  sourceId: string,
): Promise<{ entityId: string; resultPayload: unknown } | null> {
  const rows = await db
    .select({
      id: executionActions.id,
      resultPayload: executionActions.resultPayload,
      status: executionActions.status,
    })
    .from(executionActions)
    .where(
      and(
        eq(executionActions.tenantId, tenantId),
        eq(executionActions.actionType, actionType),
        eq(executionActions.sourceId, sourceId),
        eq(executionActions.status, "completed"),
      ),
    )
    .limit(1);

  if (rows[0]) {
    const payload = rows[0].resultPayload as Record<string, unknown> | null;
    return { entityId: (payload?.entityId as string) ?? rows[0].id, resultPayload: payload };
  }
  return null;
}

async function recordExecution(
  step: ExecutionStep,
  ctx: ExecutionContext,
  result: ExecutionStepResult,
  idempotencyKey: string,
): Promise<void> {
  const now = new Date();
  await db.insert(executionActions).values({
    id: idempotencyKey,
    tenantId: ctx.tenantId,
    sourceType: "assistant",
    sourceId: `${ctx.sessionId}:${step.stepId}`,
    actionType: step.action,
    executionMode: "assistant_confirmed",
    status: result.ok ? "completed" : "failed",
    executedAt: now,
    executedBy: ctx.userId,
    riskLevel: step.requiresConfirmation ? "medium" : "low",
    metadata: {
      stepId: step.stepId,
      params: step.params,
      sessionId: ctx.sessionId,
    },
    resultPayload: {
      ok: result.ok,
      entityId: result.entityId,
      entityType: result.entityType,
      warnings: result.warnings,
      error: result.error,
    },
    failureCode: result.error ? "adapter_error" : null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  });
}

async function executeStep(
  step: ExecutionStep,
  ctx: ExecutionContext,
): Promise<ExecutionStepResult> {
  if (step.status !== "confirmed") {
    return { ok: false, entityId: null, entityType: null, warnings: [], error: `Step not confirmed: ${step.status}` };
  }

  const adapter = writeAdapters.get(step.action);
  if (!adapter) {
    return { ok: false, entityId: null, entityType: null, warnings: [], error: `No adapter for ${step.action}` };
  }

  const idempotencyKey = `${ctx.sessionId}:${step.stepId}`;
  const existing = await checkIdempotency(ctx.tenantId, step.action, `${ctx.sessionId}:${step.stepId}`);
  if (existing) {
    return {
      ok: true,
      entityId: existing.entityId,
      entityType: step.action,
      warnings: ["Akce již byla provedena (idempotentní)."],
      error: null,
    };
  }

  try {
    const result = await adapter(step.params, ctx);
    await recordExecution(step, ctx, result, idempotencyKey);

    if (result.ok) {
      await logAudit({
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        action: `assistant.${step.action}`,
        entityType: result.entityType ?? step.action,
        entityId: result.entityId ?? undefined,
        meta: {
          stepId: step.stepId,
          sessionId: ctx.sessionId,
          params: step.params,
        },
        requestContext: ctx.ipAddress ? { ipAddress: ctx.ipAddress } : undefined,
      });
    }

    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown execution error";
    const failResult: ExecutionStepResult = {
      ok: false,
      entityId: null,
      entityType: null,
      warnings: [],
      error,
    };
    await recordExecution(step, ctx, failResult, idempotencyKey).catch(() => {});
    return failResult;
  }
}

function resolveDependencies(steps: ExecutionStep[]): ExecutionStep[][] {
  const resolved = new Set<string>();
  const remaining = [...steps];
  const waves: ExecutionStep[][] = [];

  while (remaining.length > 0) {
    const wave = remaining.filter((s) =>
      s.dependsOn.every((dep) => resolved.has(dep)),
    );
    if (wave.length === 0) {
      waves.push(remaining);
      break;
    }
    waves.push(wave);
    for (const s of wave) {
      resolved.add(s.stepId);
      const idx = remaining.indexOf(s);
      if (idx >= 0) remaining.splice(idx, 1);
    }
  }

  return waves;
}

let writeAdaptersLoad: Promise<void> | null = null;

async function ensureAssistantWriteAdaptersLoaded(): Promise<void> {
  if (writeAdaptersLoad) return writeAdaptersLoad;
  writeAdaptersLoad = (async () => {
    const { registerAssistantWriteAdapters } = await import("./assistant-write-adapters");
    registerAssistantWriteAdapters();
  })();
  return writeAdaptersLoad;
}

export async function executePlan(
  plan: ExecutionPlan,
  ctx: ExecutionContext,
): Promise<ExecutionPlan> {
  await ensureAssistantWriteAdaptersLoaded();
  const confirmedSteps = plan.steps.filter((s) => s.status === "confirmed");
  if (confirmedSteps.length === 0) return plan;

  const waves = resolveDependencies(confirmedSteps);
  const updatedSteps = [...plan.steps];
  let anyFailed = false;

  for (const wave of waves) {
    const results = await Promise.all(
      wave.map(async (step) => {
        const idx = updatedSteps.findIndex((s) => s.stepId === step.stepId);
        if (idx < 0) return;

        updatedSteps[idx] = { ...updatedSteps[idx]!, status: "executing" };
        const result = await executeStep(step, ctx);
        updatedSteps[idx] = {
          ...updatedSteps[idx]!,
          status: result.ok ? "succeeded" : "failed",
          result,
        };
        if (!result.ok) anyFailed = true;
      }),
    );
  }

  return {
    ...plan,
    steps: updatedSteps,
    status: anyFailed ? "partial_failure" : "completed",
  };
}

export function buildVerifiedResult(
  message: string,
  plan: ExecutionPlan | null,
): VerifiedAssistantResult {
  const entities: VerifiedAssistantResult["referencedEntities"] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  if (plan) {
    for (const step of plan.steps) {
      if (step.result?.ok && step.result.entityId) {
        entities.push({
          type: step.result.entityType ?? step.action,
          id: step.result.entityId,
          label: step.label,
        });
      }
      if (step.result?.warnings) {
        warnings.push(...step.result.warnings);
      }
      if (step.status === "failed" && step.result?.error) {
        warnings.push(`Krok „${step.label}" selhal: ${step.result.error}`);
      }
    }

    const succeeded = plan.steps.filter((s) => s.status === "succeeded").length;
    const total = plan.steps.length;
    if (succeeded > 0 && succeeded < total) {
      suggestions.push("Zkontrolujte selhané kroky a zkuste je znovu.");
    }
    if (succeeded === total && total > 0) {
      suggestions.push("Všechny akce byly úspěšně provedeny.");
    }
  }

  return {
    message,
    plan,
    referencedEntities: entities,
    suggestedNextSteps: suggestions,
    warnings,
    confidence: plan?.status === "completed" ? 0.95 : 0.7,
  };
}
