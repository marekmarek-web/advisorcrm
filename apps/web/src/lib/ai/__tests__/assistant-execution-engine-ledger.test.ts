/**
 * Phase 3B-4 / 3B-5: ledger row shape, idempotent replay mapping, verified outcomes.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("db", () => ({
  db: {},
  eq: vi.fn(),
  and: vi.fn(),
  executionActions: {},
}));

import { confirmAllSteps, buildExecutionPlan } from "../assistant-execution-plan";
import { emptyCanonicalIntent, type CanonicalIntent } from "../assistant-domain-model";
import type { EntityResolutionResult } from "../assistant-entity-resolution";
import {
  buildAssistantLedgerInsertRow,
  idempotentHitResultFromLedgerPayload,
  buildVerifiedResult,
  ASSISTANT_WRITE_CONTRACT_VERSION,
  type PlanLedgerContext,
} from "../assistant-execution-engine";

const CONTACT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function resolutionWithClient(): EntityResolutionResult {
  return {
    client: {
      entityType: "contact",
      entityId: CONTACT_ID,
      displayLabel: "Jan Test",
      confidence: 1,
      ambiguous: false,
      alternatives: [],
    },
    opportunity: null,
    document: null,
    contract: null,
    warnings: [],
  };
}

function intent(partial: Partial<CanonicalIntent>) {
  return { ...emptyCanonicalIntent(), ...partial };
}

describe("buildAssistantLedgerInsertRow (3B-4)", () => {
  it("includes planId, intentType, productDomain, fingerprint, contractVersion in metadata and resultPayload", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_reminder",
        productDomain: "hypo",
        requestedActions: ["create_reminder"],
        temporalExpressions: [{ raw: "pátek", resolved: "2026-04-10T12:00:00.000Z", confidence: 1 }],
        extractedFacts: [{ key: "taskTitle", value: "Follow-up", source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    const step = plan.steps[0]!;
    const planLedger: PlanLedgerContext = {
      planId: plan.planId,
      intentType: plan.intentType,
      productDomain: plan.productDomain,
    };
    const fingerprint = "abc123fingerprint00";
    const ctx = {
      tenantId: "t1",
      userId: "u1",
      sessionId: "sess-1",
      roleName: "Advisor",
    };
    const result = {
      ok: true,
      outcome: "executed" as const,
      entityId: "task-1",
      entityType: "task",
      warnings: [] as string[],
      error: null,
    };
    const fixed = new Date("2026-04-03T12:00:00.000Z");
    const row = buildAssistantLedgerInsertRow(step, ctx, result, "idem-key-1", { plan: planLedger, fingerprint }, fixed);

    expect(row.metadata.planId).toBe(plan.planId);
    expect(row.metadata.intentType).toBe("create_reminder");
    expect(row.metadata.productDomain).toBe("hypo");
    expect(row.metadata.fingerprint).toBe(fingerprint);
    expect(row.metadata.contractVersion).toBe(ASSISTANT_WRITE_CONTRACT_VERSION);
    expect(row.metadata.sessionId).toBe("sess-1");
    expect(row.metadata.stepId).toBe(step.stepId);

    expect(row.resultPayload.fingerprint).toBe(fingerprint);
    expect(row.resultPayload.contractVersion).toBe(ASSISTANT_WRITE_CONTRACT_VERSION);
    expect(row.resultPayload.outcome).toBe("executed");
    expect(row.resultPayload.entityId).toBe("task-1");
    expect(row.sourceType).toBe("assistant");
    expect(row.executionMode).toBe("assistant_confirmed");
    expect(row.executedAt).toEqual(fixed);
    expect(row.updatedAt).toEqual(fixed);
  });
});

describe("idempotentHitResultFromLedgerPayload (3B-5)", () => {
  it("uses entityType from stored resultPayload", () => {
    const r = idempotentHitResultFromLedgerPayload(
      {
        entityId: "entity-from-db",
        resultPayload: {
          ok: true,
          outcome: "executed",
          entityId: "entity-from-db",
          entityType: "meeting_note",
          warnings: [],
          error: null,
        },
      },
      "createReminder",
    );
    expect(r.outcome).toBe("idempotent_hit");
    expect(r.entityId).toBe("entity-from-db");
    expect(r.entityType).toBe("meeting_note");
    expect(r.ok).toBe(true);
  });

  it("falls back to step action when payload lacks entityType", () => {
    const r = idempotentHitResultFromLedgerPayload(
      { entityId: "fallback-id", resultPayload: { entityId: "fallback-id" } },
      "createTask",
    );
    expect(r.entityType).toBe("createTask");
  });
});

describe("buildVerifiedResult — outcome from result.outcome (3B-5)", () => {
  it("maps duplicate_hit to idempotent_hit step outcome without Czech string heuristics", () => {
    const plan = buildExecutionPlan(
      intent({
        intentType: "create_reminder",
        requestedActions: ["create_reminder"],
        temporalExpressions: [{ raw: "zítra", resolved: "2026-04-03", confidence: 1 }],
        extractedFacts: [{ key: "taskTitle", value: "Volat", source: "user_text" }],
      }),
      resolutionWithClient(),
    );
    const confirmed = confirmAllSteps(plan);
    const step = confirmed.steps[0]!;
    const synthetic = {
      ...confirmed,
      status: "completed" as const,
      steps: [
        {
          ...step,
          status: "succeeded" as const,
          result: {
            ok: true,
            outcome: "duplicate_hit" as const,
            entityId: "fp-dedup-id",
            entityType: "task",
            warnings: ["Duplicitní akce detekována — přeskočeno."],
            error: null,
          },
        },
      ],
    };
    const verified = buildVerifiedResult("OK.", synthetic);
    expect(verified.stepOutcomes[0]?.status).toBe("idempotent_hit");
  });
});
