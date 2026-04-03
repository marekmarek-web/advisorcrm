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
import { buildExecutionPlan, confirmAllSteps, applyConfirmationSelection, getStepsAwaitingConfirmation, buildStepDescription, computeWriteActionMissingFields } from "../assistant-execution-plan";
import { canonicalDealTitle, canonicalTaskTitle, canonicalClientRequestSubject, canonicalDealDetailLine, looksInternalOrRaw } from "../assistant-canonical-names";
import { opportunityTitleFromSlots } from "../assistant-case-type-map";
import { toCanonicalIntent, coerceCanonicalIntentRaw } from "../assistant-intent";
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

      const rawSqlError = 'relation "execution_actions" does not exist';
      const partialPlan: ExecutionPlan = {
        ...confirmed,
        status: "partial_failure",
        steps: [
          { ...s0, status: "succeeded", result: { ok: true, outcome: "executed" as const, entityId: "e1", entityType: "task", warnings: [], error: null } },
          {
            ...s1,
            status: "failed",
            result: {
              ok: false,
              outcome: "failed" as const,
              entityId: null,
              entityType: null,
              warnings: [],
              error: rawSqlError,
            },
          },
        ],
      };

      const verified = buildVerifiedResult("Hotovo.", partialPlan);

      expect(verified.hasPartialFailure).toBe(true);
      expect(verified.allSucceeded).toBe(false);
      expect(verified.stepOutcomes.length).toBe(2);
      expect(verified.stepOutcomes[0]!.status).toBe("succeeded");
      expect(verified.stepOutcomes[1]!.status).toBe("failed");

      expect(verified.stepOutcomes[1]!.error).toBeTruthy();
      expect(verified.stepOutcomes[1]!.error).not.toContain("execution_actions");
      expect(verified.stepOutcomes[1]!.error).not.toContain("relation");
      expect(verified.message).not.toContain("execution_actions");
      expect(verified.message).not.toContain("relation \"");

      // Step failure info is in stepOutcomes + summary message, not duplicated in warnings
      expect(verified.stepOutcomes[1]!.error).toBeTruthy();
      expect(verified.message.includes("selhalo") || verified.message.includes("⚠")).toBe(true);
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
// 8A PREFLIGHT: mixed-readiness plan + confirmation preflight
// ─────────────────────────────────────────────────────────────
describe("Preflight validation (8A)", () => {
  it("multi-step plan with one ready and one incomplete step → awaiting_confirmation", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    lockAssistantClient(session, "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const intent: CanonicalIntent = {
      ...emptyCanonicalIntent(),
      intentType: "multi_action",
      requestedActions: ["create_opportunity", "schedule_meeting"],
      extractedFacts: [],
      temporalExpressions: [],
      productDomain: "hypo",
    };
    const resolution = {
      client: { entityType: "contact" as const, entityId: "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa", displayLabel: "Novák", confidence: 1, ambiguous: false, alternatives: [] },
      opportunity: null, document: null, contract: null, warnings: [],
    };
    const plan = buildExecutionPlan(intent, resolution, session);
    const oppStep = plan.steps.find(s => s.action === "createOpportunity");
    const calStep = plan.steps.find(s => s.action === "scheduleCalendarEvent");
    expect(oppStep).toBeDefined();
    expect(calStep).toBeDefined();
    expect(plan.status).toBe("awaiting_confirmation");
  });

  it("confirmAllSteps: ready step confirmed, incomplete step gets requires_input", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    lockAssistantClient(session, "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const intent: CanonicalIntent = {
      ...emptyCanonicalIntent(),
      intentType: "multi_action",
      requestedActions: ["create_opportunity", "schedule_meeting"],
      extractedFacts: [],
      temporalExpressions: [],
      productDomain: "hypo",
    };
    const resolution = {
      client: { entityType: "contact" as const, entityId: "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa", displayLabel: "Novák", confidence: 1, ambiguous: false, alternatives: [] },
      opportunity: null, document: null, contract: null, warnings: [],
    };
    const plan = buildExecutionPlan(intent, resolution, session);
    const confirmed = confirmAllSteps(plan);
    const oppStep = confirmed.steps.find(s => s.action === "createOpportunity");
    const calStep = confirmed.steps.find(s => s.action === "scheduleCalendarEvent");
    expect(oppStep?.status).toBe("confirmed");
    expect(calStep?.status).toBe("skipped");
    expect(calStep?.result?.outcome).toBe("requires_input");
    expect(calStep?.result?.error).toMatch(/datum/i);
    expect(calStep?.result?.retryable).toBe(true);
  });

  it("applyConfirmationSelection: selecting incomplete step yields requires_input", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    lockAssistantClient(session, "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const intent: CanonicalIntent = {
      ...emptyCanonicalIntent(),
      intentType: "multi_action",
      requestedActions: ["create_opportunity", "schedule_meeting"],
      extractedFacts: [],
      temporalExpressions: [],
      productDomain: "hypo",
    };
    const resolution = {
      client: { entityType: "contact" as const, entityId: "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa", displayLabel: "Novák", confidence: 1, ambiguous: false, alternatives: [] },
      opportunity: null, document: null, contract: null, warnings: [],
    };
    const plan = buildExecutionPlan(intent, resolution, session);
    const allIds = plan.steps.map(s => s.stepId);
    const confirmed = applyConfirmationSelection(plan, allIds);
    const oppStep = confirmed.steps.find(s => s.action === "createOpportunity");
    const calStep = confirmed.steps.find(s => s.action === "scheduleCalendarEvent");
    expect(oppStep?.status).toBe("confirmed");
    expect(calStep?.status).toBe("skipped");
    expect(calStep?.result?.outcome).toBe("requires_input");
  });

  it("single-step plan with all fields missing stays draft", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    lockAssistantClient(session, "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const intent: CanonicalIntent = {
      ...emptyCanonicalIntent(),
      intentType: "schedule_meeting",
      requestedActions: ["schedule_meeting"],
      extractedFacts: [],
      temporalExpressions: [],
    };
    const resolution = {
      client: { entityType: "contact" as const, entityId: "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa", displayLabel: "Novák", confidence: 1, ambiguous: false, alternatives: [] },
      opportunity: null, document: null, contract: null, warnings: [],
    };
    const plan = buildExecutionPlan(intent, resolution, session);
    expect(plan.status).toBe("draft");
  });
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
// 9B-13F: Canonical naming regression (no raw abbreviations)
// ─────────────────────────────────────────────────────────────
describe("Canonical naming (9B–13F)", () => {
  describe("Deal titles (10C)", () => {
    it("hypo + amount → Hypotéka X Kč", () => {
      const t = canonicalDealTitle({ productDomain: "hypo", amount: 4000000 });
      expect(t).toMatch(/Hypotéka/);
      // No raw abbreviation like "hypo:" or standalone "hypo" slug
      expect(t).not.toMatch(/^hypo\b/i);
      expect(t).not.toMatch(/hypo:/i);
    });

    it("investice + monthly amount → Investice X Kč měsíčně", () => {
      const t = canonicalDealTitle({ productDomain: "investice", amount: 10000, periodicity: "měsíčně" });
      expect(t).toMatch(/Investice.*měsíčně/);
      expect(t).not.toMatch(/invest[^i]/i);
    });

    it("zivotni_pojisteni without amount → Životní pojištění", () => {
      const t = canonicalDealTitle({ productDomain: "zivotni_pojisteni" });
      expect(t).toBe("Životní pojištění");
    });

    it("opportunityTitleFromSlots: raw taskTitle gets replaced with canonical name", () => {
      const t = opportunityTitleFromSlots({ productDomain: "hypo", taskTitle: "hypo followup", amount: 3000000 });
      expect(t).not.toMatch(/hypo follow/i);
      expect(t).toMatch(/Hypotéka/);
    });

    it("opportunityTitleFromSlots: no internal caseType: purpose format", () => {
      const t = opportunityTitleFromSlots({ productDomain: "hypo", purpose: "koupě nemovitosti" });
      expect(t).not.toMatch(/hypo:/i);
      expect(t).toMatch(/Hypotéka/);
    });

    it("opportunityTitleFromSlots: clean user-supplied title kept as-is", () => {
      const t = opportunityTitleFromSlots({ productDomain: "hypo", taskTitle: "Refinancování hypotéky 2 500 000 Kč" });
      expect(t).toBe("Refinancování hypotéky 2 500 000 Kč");
    });
  });

  describe("Task titles (11D)", () => {
    it("createTask hypo → Zkontrolovat podklady k hypotéce", () => {
      const t = canonicalTaskTitle({ action: "createTask", productDomain: "hypo" });
      expect(t).toMatch(/Zkontrolovat/);
      expect(t).not.toMatch(/^hypo/i);
    });

    it("createFollowUp investice → Naplánovat schůzku k investici", () => {
      const t = canonicalTaskTitle({ action: "createFollowUp", productDomain: "investice" });
      expect(t).toMatch(/Naplánovat schůzku/);
    });

    it("raw taskTitle 'hypo followup' replaced", () => {
      const t = canonicalTaskTitle({ action: "createTask", productDomain: "hypo", existingTitle: "hypo followup" });
      expect(t).not.toMatch(/^hypo follow/i);
    });

    it("clean taskTitle kept", () => {
      const t = canonicalTaskTitle({ action: "createTask", productDomain: "hypo", existingTitle: "Připravit analýzu pojistné ochrany" });
      expect(t).toBe("Připravit analýzu pojistné ochrany");
    });

    it("looksInternalOrRaw catches abbreviations", () => {
      expect(looksInternalOrRaw("hypo: follow")).toBe(true);
      expect(looksInternalOrRaw("invest")).toBe(true);
      expect(looksInternalOrRaw("Zkontrolovat podklady k hypotéce")).toBe(false);
    });
  });

  describe("Client request subjects (12E)", () => {
    it("hypo → Doložit podklady k hypotéce", () => {
      const s = canonicalClientRequestSubject({ productDomain: "hypo" });
      expect(s).toMatch(/Doložit podklady k hypotéce/);
    });

    it("raw taskTitle replaced", () => {
      const s = canonicalClientRequestSubject({ productDomain: "hypo", taskTitle: "hypo docs" });
      expect(s).not.toMatch(/hypo docs/i);
    });

    it("clean subject kept", () => {
      const s = canonicalClientRequestSubject({ productDomain: "hypo", existingSubject: "Doložit výpisy z účtu za 3 měsíce" });
      expect(s).toBe("Doložit výpisy z účtu za 3 měsíce");
    });
  });

  describe("Step description (13F)", () => {
    it("createOpportunity with bank+rate → detail line", () => {
      const desc = buildStepDescription("createOpportunity", {
        productDomain: "hypo",
        bank: "Raiffeisenbank",
        interestRate: "4,5 %",
        maturity: "30 let",
      });
      expect(desc).toMatch(/Raiffeisenbank/);
      expect(desc).toMatch(/4,5 %/);
    });

    it("createTask uses taskTitle as description", () => {
      const desc = buildStepDescription("createTask", {
        productDomain: "hypo",
        taskTitle: "Zkontrolovat podklady k hypotéce",
      });
      expect(desc).toBe("Zkontrolovat podklady k hypotéce");
    });

    it("createOpportunity without detail → fallback generic description", () => {
      const desc = buildStepDescription("createOpportunity", { productDomain: "hypo" });
      // No detail line available — falls back to generic with chip
      expect(desc).toBeDefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────
// 14G: Fact-to-entity mapping regression
// ─────────────────────────────────────────────────────────────
describe("14G: Fact extraction → entity mapping", () => {
  it("rateGuess is normalized to interestRate in extractedFacts", () => {
    const raw = coerceCanonicalIntentRaw({
      intentType: "create_opportunity",
      productDomain: "hypo",
      amount: 4000000,
      rateGuess: 4.5,
      bank: "Raiffeisenbank",
    });
    const intent = toCanonicalIntent(raw);
    const rateGuess = intent.extractedFacts.find(f => f.key === "rateGuess");
    const interestRate = intent.extractedFacts.find(f => f.key === "interestRate");
    expect(rateGuess).toBeDefined();
    expect(interestRate).toBeDefined();
    expect(interestRate!.value).toMatch(/4,5/);
  });

  it("maturity and periodicity are extracted when present", () => {
    const raw = coerceCanonicalIntentRaw({
      intentType: "create_opportunity",
      productDomain: "hypo",
      maturity: "30 let",
      periodicity: "měsíčně",
    });
    const intent = toCanonicalIntent(raw);
    expect(intent.extractedFacts.find(f => f.key === "maturity")?.value).toBe("30 let");
    expect(intent.extractedFacts.find(f => f.key === "periodicity")?.value).toBe("měsíčně");
  });

  it("canonicalDealDetailLine uses rateGuess as fallback", () => {
    const detail = canonicalDealDetailLine({
      rateGuess: 4.5,
      bank: "Raiffeisenbank",
      maturity: "30 let",
    });
    expect(detail).toMatch(/Sazba.*4\.5/);
    expect(detail).toMatch(/Raiffeisenbank/);
    expect(detail).toMatch(/splatnost 30 let/);
  });

  it("canonicalDealDetailLine with interestRate (formatted)", () => {
    const detail = canonicalDealDetailLine({
      interestRate: "4,5 %",
      bank: "ČS",
      maturity: "20",
    });
    expect(detail).toMatch(/Sazba 4,5 %/);
    expect(detail).toMatch(/ČS/);
    expect(detail).toMatch(/splatnost 20 let/);
  });

  it("full mortgage intent → plan step has detail description", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    lockAssistantClient(session, "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const intent: CanonicalIntent = {
      ...emptyCanonicalIntent(),
      intentType: "create_opportunity",
      requestedActions: ["create_opportunity"],
      productDomain: "hypo",
      extractedFacts: [
        { key: "amount", value: 4000000, source: "user_text" },
        { key: "bank", value: "Raiffeisenbank", source: "user_text" },
        { key: "interestRate", value: "4,5 %", source: "user_text" },
        { key: "maturity", value: "30 let", source: "user_text" },
      ],
      temporalExpressions: [],
    };
    const resolution = {
      client: { entityType: "contact" as const, entityId: "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa", displayLabel: "Novák", confidence: 1, ambiguous: false, alternatives: [] },
      opportunity: null, document: null, contract: null, warnings: [],
    };
    const plan = buildExecutionPlan(intent, resolution, session);
    const oppStep = plan.steps.find(s => s.action === "createOpportunity");
    expect(oppStep).toBeDefined();
    const desc = buildStepDescription("createOpportunity", oppStep!.params);
    expect(desc).toMatch(/Raiffeisenbank/);
  });
});

// ─────────────────────────────────────────────────────────────
// 15H: Partial success UX + warning dedup regression
// ─────────────────────────────────────────────────────────────
describe("15H: Partial success UX", () => {
  it("warnings do not duplicate step failure text", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    lockAssistantClient(session, "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const intent: CanonicalIntent = {
      ...emptyCanonicalIntent(),
      intentType: "create_task",
      requestedActions: ["create_task"],
      extractedFacts: [],
      temporalExpressions: [],
    };
    const resolution = {
      client: { entityType: "contact" as const, entityId: "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa", displayLabel: "Novák", confidence: 1, ambiguous: false, alternatives: [] },
      opportunity: null, document: null, contract: null, warnings: [],
    };
    const plan = buildExecutionPlan(intent, resolution, session);
    const confirmed = confirmAllSteps(plan);
    const partialPlan: ExecutionPlan = {
      ...confirmed,
      status: "partial_failure",
      steps: confirmed.steps.map((s, i) =>
        i === 0
          ? { ...s, status: "failed" as const, result: { ok: false, outcome: "failed" as const, entityId: null, entityType: null, warnings: [], error: "Test error" } }
          : s,
      ),
    };
    const verified = buildVerifiedResult("Done.", partialPlan);
    // Error should be in stepOutcomes and message, NOT duplicated in warnings
    expect(verified.stepOutcomes[0]?.error).toBe("Test error");
    expect(verified.message).toMatch(/selhalo/);
    const warningsWithSelhal = verified.warnings.filter(w => w.includes("selhal"));
    expect(warningsWithSelhal.length).toBe(0);
  });

  it("adapter-level warnings are still propagated", () => {
    const session = getOrCreateSession(undefined, TENANT, USER);
    lockAssistantClient(session, "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const intent: CanonicalIntent = {
      ...emptyCanonicalIntent(),
      intentType: "create_opportunity",
      requestedActions: ["create_opportunity"],
      productDomain: "hypo",
      extractedFacts: [{ key: "ltv", value: 95, source: "user_text" }],
      temporalExpressions: [],
    };
    const resolution = {
      client: { entityType: "contact" as const, entityId: "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa", displayLabel: "Novák", confidence: 1, ambiguous: false, alternatives: [] },
      opportunity: null, document: null, contract: null, warnings: [],
    };
    const plan = buildExecutionPlan(intent, resolution, session);
    const confirmed = confirmAllSteps(plan);
    const partialPlan: ExecutionPlan = {
      ...confirmed,
      status: "completed",
      steps: confirmed.steps.map(s => ({
        ...s,
        status: "succeeded" as const,
        result: { ok: true, outcome: "executed" as const, entityId: "e1", entityType: "opportunity", warnings: ["LTV 95 % přesahuje 90 %."], error: null },
      })),
    };
    const verified = buildVerifiedResult("Done.", partialPlan);
    expect(verified.warnings).toContain("LTV 95 % přesahuje 90 %.");
  });
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
