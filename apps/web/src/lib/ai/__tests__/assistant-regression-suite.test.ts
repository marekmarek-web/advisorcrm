/**
 * Phase 2F: no-regression suite — replay-driven tests that catch
 * wrong-client, fake-confirmation, duplicate-create, broken-lock,
 * and incomplete partial-failure reporting regressions.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("db", () => ({
  db: { select: vi.fn().mockReturnThis(), from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue([]), insert: vi.fn().mockReturnThis(), values: vi.fn().mockResolvedValue([]) },
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
  contacts: { id: "id", firstName: "fn", lastName: "ln", tenantId: "t" },
  opportunities: { id: "id", title: "t", tenantId: "t", contactId: "c", archivedAt: "a", updatedAt: "u" },
  executionActions: { tenantId: "t", actionType: "a", sourceId: "s", status: "st", resultPayload: "rp", id: "id" },
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditAction: vi.fn() }));

import { emptyCanonicalIntent, type CanonicalIntent, type ExecutionPlan, type WriteActionType } from "../assistant-domain-model";
import { buildExecutionPlan, confirmAllSteps, getStepsAwaitingConfirmation } from "../assistant-execution-plan";
import { buildVerifiedResult } from "../assistant-execution-engine";
import { verifyWriteContextSafety } from "../assistant-context-safety";
import { computeStepFingerprint, checkRecentFingerprint, recordFingerprint } from "../assistant-action-fingerprint";
import { getOrCreateSession, lockAssistantClient } from "../assistant-session";
import { replayFixtures, type ReplayFixture } from "./assistant-replay-fixtures";
import { requestedActionsFromExpectedWriteActions } from "./assistant-write-action-to-intent";

const TENANT = "t-regression";
const USER = "u-regression";

function intentFromFixture(f: ReplayFixture): CanonicalIntent {
  const base = emptyCanonicalIntent();
  return {
    ...base,
    ...f.expectedIntent,
    intentType: f.expectedIntent.intentType ?? base.intentType,
    requestedActions: requestedActionsFromExpectedWriteActions(
      f.expectedPlan.expectedActions as WriteActionType[],
      f.expectedIntent.intentType ?? "general_chat",
    ),
  };
}

function buildSessionForFixture(f: ReplayFixture) {
  const session = getOrCreateSession(undefined, TENANT, USER);
  if (f.input.lockedClientId) lockAssistantClient(session, f.input.lockedClientId);
  if (f.input.activeReviewId) session.activeReviewId = f.input.activeReviewId;
  if (f.input.lockedDocumentId) session.lockedDocumentId = f.input.lockedDocumentId;
  return session;
}

// ─────────────────────────────────────────────────────────────
// RED FLAG: wrong_client_write
// ─────────────────────────────────────────────────────────────
describe("Red flag: wrong_client_write", () => {
  const fixtures = replayFixtures.filter(f => f.redFlag === "wrong_client_write");

  for (const f of fixtures) {
    it(f.name, () => {
      const session = buildSessionForFixture(f);
      const intent = intentFromFixture(f);
      const plan = buildExecutionPlan(intent, f.resolution, session);
      const safety = verifyWriteContextSafety(session, f.resolution, plan);

      expect(safety.safe).toBe(f.expectedSafety.safe);
      if (f.expectedSafety.blockedReason) {
        expect(safety.blockedReason).toBe(f.expectedSafety.blockedReason);
      }
      if (f.expectedSafety.requiresConfirmation) {
        expect(safety.requiresConfirmation).toBe(true);
      }
      if (!f.resolution.client) {
        expect(safety.warnings.some(w => w.includes("Chybí klient"))).toBe(true);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────
// RED FLAG: fake_confirmation
// ─────────────────────────────────────────────────────────────
describe("Red flag: fake_confirmation", () => {
  const fixtures = replayFixtures.filter(f => f.redFlag === "fake_confirmation");

  for (const f of fixtures) {
    it(f.name, () => {
      const session = buildSessionForFixture(f);
      const intent = intentFromFixture(f);
      const plan = buildExecutionPlan(intent, f.resolution, session);

      if (f.expectedPlan.expectedStatus) {
        expect(plan.status).toBe(f.expectedPlan.expectedStatus);
      }

      const awaiting = getStepsAwaitingConfirmation(plan);
      expect(awaiting.length).toBeGreaterThan(0);

      for (const step of plan.steps) {
        expect(step.status).not.toBe("confirmed");
        expect(step.status).not.toBe("succeeded");
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────
// RED FLAG: duplicate_create
// ─────────────────────────────────────────────────────────────
describe("Red flag: duplicate_create", () => {
  const fixtures = replayFixtures.filter(f => f.redFlag === "duplicate_create");

  for (const f of fixtures) {
    it(`${f.name} — same params = same fingerprint`, () => {
      const session = buildSessionForFixture(f);
      const intent = intentFromFixture(f);
      const plan = buildExecutionPlan(intent, f.resolution, session);

      const plan2 = buildExecutionPlan(intent, f.resolution, session);

      for (let i = 0; i < plan.steps.length; i++) {
        const fp1 = computeStepFingerprint(plan.steps[i]!);
        const fp2 = computeStepFingerprint(plan2.steps[i]!);
        expect(fp1).toBe(fp2);
      }
    });

    it(`${f.name} — recorded fingerprint triggers duplicate detection`, () => {
      const sessionId = `dedup-test-${f.id}`;
      const session = getOrCreateSession(sessionId, TENANT, USER);
      if (f.input.lockedClientId) lockAssistantClient(session, f.input.lockedClientId);

      const intent = intentFromFixture(f);
      const plan = buildExecutionPlan(intent, f.resolution, session);

      for (const step of plan.steps) {
        const fp = computeStepFingerprint(step);
        const before = checkRecentFingerprint(sessionId, fp);
        expect(before.isDuplicate).toBe(false);

        recordFingerprint(sessionId, fp, `action-${step.stepId}`);

        const after = checkRecentFingerprint(sessionId, fp);
        expect(after.isDuplicate).toBe(true);
        expect(after.existingActionId).toBe(`action-${step.stepId}`);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────
// RED FLAG: broken_context_lock
// ─────────────────────────────────────────────────────────────
describe("Red flag: broken_context_lock", () => {
  const fixtures = replayFixtures.filter(f => f.redFlag === "broken_context_lock");

  for (const f of fixtures) {
    it(f.name, () => {
      const session = buildSessionForFixture(f);
      const intent = intentFromFixture(f);
      const plan = buildExecutionPlan(intent, f.resolution, session);
      const safety = verifyWriteContextSafety(session, f.resolution, plan);

      expect(safety.safe).toBe(f.expectedSafety.safe);
      if (f.expectedSafety.blockedReason) {
        expect(safety.blockedReason).toBe(f.expectedSafety.blockedReason);
      }

      if (f.resolution.client?.ambiguous) {
        expect(safety.warnings.some(w => w.includes("nejednoznačný"))).toBe(true);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────
// RED FLAG: incomplete_partial_failure
// ─────────────────────────────────────────────────────────────
describe("Red flag: incomplete_partial_failure", () => {
  const fixtures = replayFixtures.filter(f => f.redFlag === "incomplete_partial_failure");

  for (const f of fixtures) {
    it(f.name, () => {
      const session = buildSessionForFixture(f);
      const intent = intentFromFixture(f);
      const plan = buildExecutionPlan(intent, f.resolution, session);

      expect(plan.steps.length).toBeGreaterThanOrEqual(f.expectedPlan.minSteps);

      const confirmed = confirmAllSteps(plan);
      const s0 = confirmed.steps[0]!;
      const s1 = confirmed.steps[1]!;

      const partialPlan: ExecutionPlan = {
        ...confirmed,
        status: "partial_failure",
        steps: [
          { ...s0, status: "succeeded", result: { ok: true, outcome: "executed" as const, entityId: "e1", entityType: "task", warnings: [], error: null } },
          { ...s1, status: "failed", result: { ok: false, outcome: "failed" as const, entityId: null, entityType: null, warnings: [], error: "Adapter error" } },
        ],
      };

      const verified = buildVerifiedResult("Hotovo.", partialPlan);

      expect(verified.hasPartialFailure).toBe(true);
      expect(verified.allSucceeded).toBe(false);
      expect(verified.stepOutcomes.length).toBe(2);
      expect(verified.stepOutcomes[0]!.status).toBe("succeeded");
      expect(verified.stepOutcomes[1]!.status).toBe("failed");

      expect(verified.warnings.some(w => w.includes("selhal"))).toBe(true);
      expect(verified.message.includes("⚠")).toBe(true);
      expect(verified.confidence).toBeLessThan(0.9);
    });
  }
});

// ─────────────────────────────────────────────────────────────
// HAPPY PATH: all replay fixtures with happy_path category
// ─────────────────────────────────────────────────────────────
describe("Happy path replay fixtures", () => {
  const fixtures = replayFixtures.filter(f => f.category === "happy_path");

  for (const f of fixtures) {
    it(f.name, () => {
      const session = buildSessionForFixture(f);
      const intent = intentFromFixture(f);
      const plan = buildExecutionPlan(intent, f.resolution, session);
      const safety = verifyWriteContextSafety(session, f.resolution, plan);

      expect(safety.safe).toBe(true);

      expect(plan.steps.length).toBeGreaterThanOrEqual(f.expectedPlan.minSteps);
      expect(plan.steps.length).toBeLessThanOrEqual(f.expectedPlan.maxSteps);

      for (const expectedAction of f.expectedPlan.expectedActions) {
        expect(plan.steps.some(s => s.action === expectedAction)).toBe(true);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────
// RED FLAG: wrong_document_attach (Phase 3I)
// ─────────────────────────────────────────────────────────────
describe("Red flag: wrong_document_attach", () => {
  const fixtures = replayFixtures.filter(f => f.redFlag === "wrong_document_attach");

  for (const f of fixtures) {
    it(f.name, () => {
      const session = buildSessionForFixture(f);
      const intent = intentFromFixture(f);
      const plan = buildExecutionPlan(intent, f.resolution, session);
      const safety = verifyWriteContextSafety(session, f.resolution, plan);

      expect(safety.safe).toBe(f.expectedSafety.safe);
      if (f.expectedSafety.blockedReason) {
        expect(safety.blockedReason).toBe(f.expectedSafety.blockedReason);
      }
      if (f.expectedSafety.requiresConfirmation) {
        expect(safety.requiresConfirmation).toBe(true);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────
// RED FLAG: missing_required_fields (Phase 3I)
// ─────────────────────────────────────────────────────────────
describe("Red flag: missing_required_fields", () => {
  const fixtures = replayFixtures.filter(f => f.redFlag === "missing_required_fields");

  for (const f of fixtures) {
    it(f.name, () => {
      const session = buildSessionForFixture(f);
      const intent = intentFromFixture(f);
      const plan = buildExecutionPlan(intent, f.resolution, session);

      if (f.expectedPlan.expectedStatus === "draft") {
        expect(plan.status).toBe("draft");
      }
      expect(plan.steps.length).toBeGreaterThanOrEqual(f.expectedPlan.minSteps);
    });
  }
});

// ─────────────────────────────────────────────────────────────
// RED FLAG: multi_action_order_violation (Phase 3I)
// ─────────────────────────────────────────────────────────────
describe("Red flag: multi_action_order_violation", () => {
  const fixtures = replayFixtures.filter(f => f.redFlag === "multi_action_order_violation");

  for (const f of fixtures) {
    it(`${f.name} — steps respect dependency ordering`, () => {
      const session = buildSessionForFixture(f);
      const intent = intentFromFixture(f);
      const plan = buildExecutionPlan(intent, f.resolution, session);

      expect(plan.steps.length).toBeGreaterThanOrEqual(f.expectedPlan.minSteps);
      for (const expectedAction of f.expectedPlan.expectedActions) {
        expect(plan.steps.some(s => s.action === expectedAction)).toBe(true);
      }

      const createIdx = plan.steps.findIndex(s =>
        s.action === "createOpportunity" || s.action === "createTask"
      );
      const dependentIdx = plan.steps.findIndex(s =>
        s.action === "attachDocumentToOpportunity" || s.action === "attachDocumentToClient" || s.action === "createReminder"
      );
      if (createIdx >= 0 && dependentIdx >= 0) {
        expect(createIdx).toBeLessThan(dependentIdx);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────
// EDGE CASES
// ─────────────────────────────────────────────────────────────
describe("Edge case replay fixtures", () => {
  const fixtures = replayFixtures.filter(f => f.category === "edge_case");

  for (const f of fixtures) {
    it(f.name, () => {
      const session = buildSessionForFixture(f);
      const intent = intentFromFixture(f);
      const plan = buildExecutionPlan(intent, f.resolution, session);
      const safety = verifyWriteContextSafety(session, f.resolution, plan);

      expect(safety.safe).toBe(f.expectedSafety.safe);
      if (f.expectedSafety.requiresConfirmation !== undefined) {
        expect(safety.requiresConfirmation).toBe(f.expectedSafety.requiresConfirmation);
      }

      expect(plan.steps.length).toBeGreaterThanOrEqual(f.expectedPlan.minSteps);
      for (const expectedAction of f.expectedPlan.expectedActions) {
        expect(plan.steps.some(s => s.action === expectedAction)).toBe(true);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────
// REGRESSION SUMMARY
// ─────────────────────────────────────────────────────────────
describe("Regression coverage summary", () => {
  it("all replay fixtures have been tested", () => {
    const testedCategories = new Set(replayFixtures.map(f => f.category));
    expect(testedCategories.has("happy_path")).toBe(true);
    expect(testedCategories.has("red_flag")).toBe(true);
    expect(testedCategories.has("edge_case")).toBe(true);

    const redFlags = new Set(replayFixtures.filter(f => f.redFlag).map(f => f.redFlag));
    expect(redFlags.has("wrong_client_write")).toBe(true);
    expect(redFlags.has("fake_confirmation")).toBe(true);
    expect(redFlags.has("duplicate_create")).toBe(true);
    expect(redFlags.has("broken_context_lock")).toBe(true);
    expect(redFlags.has("incomplete_partial_failure")).toBe(true);
    expect(redFlags.has("wrong_document_attach")).toBe(true);
    expect(redFlags.has("missing_required_fields")).toBe(true);
    expect(redFlags.has("multi_action_order_violation")).toBe(true);

    console.log(`=== REGRESSION COVERAGE ===`);
    console.log(`Total fixtures: ${replayFixtures.length}`);
    console.log(`Categories: ${[...testedCategories].join(", ")}`);
    console.log(`Red flags covered: ${[...redFlags].join(", ")}`);
  });
});
