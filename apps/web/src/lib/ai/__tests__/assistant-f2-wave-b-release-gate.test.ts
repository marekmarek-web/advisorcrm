/**
 * F2 (corrective plan — Wave B): release gate extensions for P0 production risks.
 * Complements `assistant-release-gate.test.ts` with explicit, named scenarios:
 * - advisor UI must not show protocol tokens / UUIDs (smoke via sanitizer)
 * - cross-client resolution vs lock must not allow silent wrong-client writes
 * - partial failure must surface per-step outcomes
 * - execution must complete when execution_actions is missing (degraded ledger)
 * - duplicate write fingerprint stability
 *
 * CI: covered by `pnpm test` (vitest run src). Focused run: `pnpm test:f2-wave-b-release-gate`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../assistant-write-adapters", () => ({
  registerAssistantWriteAdapters: vi.fn(),
}));

const ledgerValuesSpy = vi.fn().mockResolvedValue(undefined);
let limitImpl: () => Promise<unknown> = () => Promise.resolve([]);

vi.mock("db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => limitImpl()),
    insert: vi.fn().mockReturnValue({ values: (...args: unknown[]) => ledgerValuesSpy(...args) }),
  },
  eq: vi.fn(),
  and: vi.fn(),
  executionActions: { tenantId: "t", actionType: "a", sourceId: "s", status: "st", resultPayload: "rp", id: "id" },
}));

import { db } from "db";
import { sanitizeAssistantMessageForAdvisor } from "../assistant-message-sanitizer";
import { verifyWriteContextSafety } from "../assistant-context-safety";
import { buildExecutionPlan } from "../assistant-execution-plan";
import {
  buildVerifiedResult,
  executePlan,
  registerWriteAdapter,
  resetExecutionActionsTableAvailabilityForTests,
} from "../assistant-execution-engine";
import { computeStepFingerprint } from "../assistant-action-fingerprint";
import { getOrCreateSession, lockAssistantClient } from "../assistant-session";
import { emptyCanonicalIntent } from "../assistant-domain-model";
import type { CanonicalIntent, ExecutionPlan } from "../assistant-domain-model";
import type { EntityResolutionResult } from "../assistant-entity-resolution";

const TENANT = "t-f2";
const USER = "u-f2";
const CONTACT_A = "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CONTACT_B = "bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function resolutionFor(clientId: string): EntityResolutionResult {
  return {
    client: {
      entityType: "contact",
      entityId: clientId,
      displayLabel: "Klient B",
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

describe("F2 Wave B — P0 release gate (corrective plan)", () => {
  it("P0: advisor message sanitizer removes protocol + UUID leakage (smoke)", () => {
    const raw = [
      "[RESULT:listTasks] {\"rows\":[]}",
      `[client:${CONTACT_A}]`,
      "[CONTEXT:locked]",
      `id ${CONTACT_B}`,
    ].join("\n");
    const out = sanitizeAssistantMessageForAdvisor(raw);
    expect(out).not.toContain("[RESULT:");
    expect(out).not.toContain("[client:");
    expect(out).not.toContain("[CONTEXT:");
    expect(out).not.toContain(CONTACT_A);
    expect(out).not.toContain(CONTACT_B);
  });

  it("P0: locked client A + resolved client B → write context requires confirmation (disambiguation drift)", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    lockAssistantClient(session, CONTACT_A);

    const intent: CanonicalIntent = {
      ...emptyCanonicalIntent(),
      intentType: "create_task",
      requestedActions: ["create_task"],
    };
    const plan = buildExecutionPlan(intent, resolutionFor(CONTACT_B), session);
    const safety = verifyWriteContextSafety(session, resolutionFor(CONTACT_B), plan);

    expect(safety.safe).toBe(true);
    expect(safety.requiresConfirmation).toBe(true);
    expect(safety.warnings.some((w) => /jiný klient/i.test(w))).toBe(true);
  });

  it("P0: partial failure → buildVerifiedResult exposes hasPartialFailure and step outcomes", () => {
    const plan: ExecutionPlan = {
      planId: "p-f2",
      intentType: "general_chat",
      productDomain: null,
      contactId: CONTACT_A,
      opportunityId: null,
      tenantId: TENANT,
      status: "partial_failure",
      createdAt: new Date(),
      steps: [
        {
          stepId: "s1",
          action: "createTask",
          params: {},
          label: "Úkol",
          requiresConfirmation: true,
          isReadOnly: false,
          dependsOn: [],
          status: "succeeded",
          result: { ok: true, outcome: "executed", entityId: "e1", entityType: "task", warnings: [], error: null },
        },
        {
          stepId: "s2",
          action: "createReminder",
          params: {},
          label: "Připomínka",
          requiresConfirmation: true,
          isReadOnly: false,
          dependsOn: [],
          status: "failed",
          result: { ok: false, outcome: "failed", entityId: null, entityType: null, warnings: [], error: "x" },
        },
      ],
    };
    const v = buildVerifiedResult("Shrnutí.", plan);
    expect(v.hasPartialFailure).toBe(true);
    expect(v.allSucceeded).toBe(false);
    expect(v.stepOutcomes).toHaveLength(2);
    expect(v.stepOutcomes.filter((o) => o.status === "failed")).toHaveLength(1);
  });

  it("P0: duplicate fingerprint — identical planned steps share fingerprint", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    lockAssistantClient(session, CONTACT_A);
    const intent: CanonicalIntent = {
      ...emptyCanonicalIntent(),
      intentType: "create_opportunity",
      productDomain: "hypo",
      requestedActions: ["create_opportunity"],
    };
    const r = resolutionFor(CONTACT_A);
    const p1 = buildExecutionPlan(intent, r, session);
    const p2 = buildExecutionPlan(intent, r, session);
    expect(p1.steps.length).toBeGreaterThan(0);
    expect(computeStepFingerprint(p1.steps[0]!)).toBe(computeStepFingerprint(p2.steps[0]!));
  });
});

describe("F2 Wave B — execution runtime unavailable (ledger degraded)", () => {
  const ctx = { tenantId: TENANT, userId: USER, sessionId: "sess-f2-ledger", roleName: "Advisor" };

  beforeEach(() => {
    resetExecutionActionsTableAvailabilityForTests();
    limitImpl = () => Promise.resolve([]);
    ledgerValuesSpy.mockClear();
    vi.mocked(db.select).mockClear();
    vi.mocked(db.insert).mockClear();
    registerWriteAdapter("createTask", async () => ({
      ok: true,
      outcome: "executed",
      entityId: "task-f2",
      entityType: "task",
      warnings: [],
      error: null,
    }));
  });

  function confirmedPlan(): ExecutionPlan {
    return {
      planId: "f2-ledger-plan",
      intentType: "general_chat",
      productDomain: null,
      contactId: CONTACT_A,
      opportunityId: null,
      steps: [
        {
          stepId: "st-f2-1",
          action: "createTask",
          params: { contactId: CONTACT_A, taskTitle: "F2" },
          label: "Úkol",
          requiresConfirmation: true,
          isReadOnly: false,
          dependsOn: [],
          status: "confirmed",
          result: null,
        },
      ],
      status: "executing",
      createdAt: new Date(),
    };
  }

  it("P0: when execution_actions is missing, adapter still runs and plan completes", async () => {
    limitImpl = () =>
      Promise.reject(new Error('relation "execution_actions" does not exist'));

    const out = await executePlan(confirmedPlan(), ctx);
    expect(out.status).toBe("completed");
    expect(out.steps[0]?.status).toBe("succeeded");
    expect(out.steps[0]?.result?.ok).toBe(true);
    expect(out.ledgerDegraded).toBe(true);
    const verified = buildVerifiedResult("Akce provedeny.", out);
    expect(verified.warnings.some((w) => w.includes("Evidence operací"))).toBe(true);
    expect(verified.warnings.join(" ")).not.toMatch(/relation|does not exist/i);
  });
});
