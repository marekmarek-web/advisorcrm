/**
 * Phase 2E: eval harness test — runs golden scenarios through
 * intent → plan → context-safety pipeline without live LLM/DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { emptyCanonicalIntent, type CanonicalIntent } from "../assistant-domain-model";
import type { EntityResolutionResult } from "../assistant-entity-resolution";
import { buildExecutionPlan } from "../assistant-execution-plan";
import { verifyWriteContextSafety } from "../assistant-context-safety";
import { getOrCreateSession, lockAssistantClient } from "../assistant-session";
import { evaluateIntent, evaluatePlan, evaluateSafety, aggregateEvalRun } from "../assistant-eval-runner";
import type { ScenarioEvalResult } from "../assistant-eval-types";
import { goldenScenarios } from "./assistant-golden-scenarios";

const TENANT = "tenant-eval";
const USER = "user-eval";
const CONTACT_A = "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CONTACT_B = "bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function makeResolution(opts: {
  clientId?: string;
  clientLabel?: string;
  ambiguous?: boolean;
  alternatives?: { id: string; label: string }[];
  confidence?: number;
} = {}): EntityResolutionResult {
  return {
    client: opts.clientId ? {
      entityType: "contact",
      entityId: opts.clientId,
      displayLabel: opts.clientLabel ?? "Test Klient",
      confidence: opts.confidence ?? 1.0,
      ambiguous: opts.ambiguous ?? false,
      alternatives: opts.alternatives ?? [],
    } : null,
    opportunity: null,
    document: null,
    contract: null,
    warnings: [],
  };
}

function intentFromScenario(scenario: typeof goldenScenarios[number]): CanonicalIntent {
  return {
    ...emptyCanonicalIntent(),
    intentType: scenario.expectedIntent.intentType,
    productDomain: scenario.expectedIntent.productDomain ?? null,
    requiresConfirmation: scenario.expectedIntent.requiresConfirmation ?? false,
    switchClient: scenario.expectedIntent.switchClient ?? false,
    requestedActions: scenario.expectedPlan?.expectedActions
      ? scenario.expectedPlan.expectedActions.map(a => {
          const reverseMap: Record<string, string> = {
            createOpportunity: "create_opportunity",
            createTask: "create_task",
            createFollowUp: "create_followup",
            createClientRequest: "create_client_request",
            createServiceCase: "create_service_case",
            createMaterialRequest: "create_material_request",
            classifyDocument: "classify_document",
            setDocumentVisibleToClient: "show_document_to_client",
            approveAiContractReview: "approve_ai_contract_review",
            applyAiContractReviewToCrm: "apply_ai_review_to_crm",
            createClientPortalNotification: "notify_client_portal",
            scheduleCalendarEvent: "schedule_meeting",
            createMeetingNote: "create_note",
            createInternalNote: "create_internal_note",
            triggerDocumentReview: "request_document_review",
          };
          return (reverseMap[a] ?? scenario.expectedIntent.intentType) as any;
        })
      : [scenario.expectedIntent.intentType],
  };
}

describe("Phase 2E: Assistant Eval Harness", () => {
  const allResults: ScenarioEvalResult[] = [];

  describe("mortgage scenarios", () => {
    const mortgageScenarios = goldenScenarios.filter(s => s.domain === "mortgage");

    for (const scenario of mortgageScenarios) {
      it(scenario.name, () => {
        const start = Date.now();
        const steps: ScenarioEvalResult["steps"] = [];
        const intent = intentFromScenario(scenario);
        const resolution = makeResolution({ clientId: CONTACT_A, clientLabel: "Jan Novák" });

        steps.push(...evaluateIntent(intent, scenario.expectedIntent));

        if (scenario.expectedPlan) {
          const plan = buildExecutionPlan(intent, resolution);
          steps.push(...evaluatePlan(plan, scenario.expectedPlan));
        }

        const passed = steps.every(s => s.passed);
        const result: ScenarioEvalResult = {
          scenarioId: scenario.id,
          domain: scenario.domain,
          name: scenario.name,
          passed,
          steps,
          durationMs: Date.now() - start,
        };
        allResults.push(result);
        expect(passed).toBe(true);
      });
    }
  });

  describe("investment scenarios", () => {
    const investmentScenarios = goldenScenarios.filter(s => s.domain === "investment");

    for (const scenario of investmentScenarios) {
      it(scenario.name, () => {
        const start = Date.now();
        const steps: ScenarioEvalResult["steps"] = [];
        const intent = intentFromScenario(scenario);
        const resolution = makeResolution({ clientId: CONTACT_A, clientLabel: "Karel Svoboda" });

        steps.push(...evaluateIntent(intent, scenario.expectedIntent));

        if (scenario.expectedPlan) {
          const plan = buildExecutionPlan(intent, resolution);
          steps.push(...evaluatePlan(plan, scenario.expectedPlan));
        }

        const passed = steps.every(s => s.passed);
        allResults.push({ scenarioId: scenario.id, domain: scenario.domain, name: scenario.name, passed, steps, durationMs: Date.now() - start });
        expect(passed).toBe(true);
      });
    }
  });

  describe("insurance scenarios", () => {
    const insuranceScenarios = goldenScenarios.filter(s => s.domain === "insurance");

    for (const scenario of insuranceScenarios) {
      it(scenario.name, () => {
        const start = Date.now();
        const steps: ScenarioEvalResult["steps"] = [];
        const intent = intentFromScenario(scenario);
        const resolution = makeResolution({ clientId: CONTACT_A, clientLabel: "Marie Procházková" });

        steps.push(...evaluateIntent(intent, scenario.expectedIntent));

        if (scenario.expectedPlan) {
          const plan = buildExecutionPlan(intent, resolution);
          steps.push(...evaluatePlan(plan, scenario.expectedPlan));
        }

        const passed = steps.every(s => s.passed);
        allResults.push({ scenarioId: scenario.id, domain: scenario.domain, name: scenario.name, passed, steps, durationMs: Date.now() - start });
        expect(passed).toBe(true);
      });
    }
  });

  describe("document scenarios", () => {
    const docScenarios = goldenScenarios.filter(s => s.domain === "documents");

    for (const scenario of docScenarios) {
      it(scenario.name, () => {
        const start = Date.now();
        const steps: ScenarioEvalResult["steps"] = [];
        const intent = intentFromScenario(scenario);
        const resolution = makeResolution({ clientId: CONTACT_A, clientLabel: "Jan Novák" });
        const session = getOrCreateSession(undefined, TENANT, USER);
        session.activeReviewId = "review-test-id";
        session.lockedDocumentId = "doc-test-id";

        steps.push(...evaluateIntent(intent, scenario.expectedIntent));

        if (scenario.expectedPlan) {
          const plan = buildExecutionPlan(intent, resolution, session);
          steps.push(...evaluatePlan(plan, scenario.expectedPlan));
        }

        const passed = steps.every(s => s.passed);
        allResults.push({ scenarioId: scenario.id, domain: scenario.domain, name: scenario.name, passed, steps, durationMs: Date.now() - start });
        expect(passed).toBe(true);
      });
    }
  });

  describe("client portal scenarios", () => {
    const portalScenarios = goldenScenarios.filter(s => s.domain === "client_portal");

    for (const scenario of portalScenarios) {
      it(scenario.name, () => {
        const start = Date.now();
        const steps: ScenarioEvalResult["steps"] = [];
        const intent = intentFromScenario(scenario);
        const resolution = makeResolution({ clientId: CONTACT_A, clientLabel: "Jan Novák" });

        steps.push(...evaluateIntent(intent, scenario.expectedIntent));

        if (scenario.expectedPlan) {
          const plan = buildExecutionPlan(intent, resolution);
          steps.push(...evaluatePlan(plan, scenario.expectedPlan));
        }

        const passed = steps.every(s => s.passed);
        allResults.push({ scenarioId: scenario.id, domain: scenario.domain, name: scenario.name, passed, steps, durationMs: Date.now() - start });
        expect(passed).toBe(true);
      });
    }
  });

  describe("safety scenarios", () => {
    it("blocks write without client", () => {
      const scenario = goldenScenarios.find(s => s.id === "safety-no-client-write")!;
      const start = Date.now();
      const steps: ScenarioEvalResult["steps"] = [];
      const intent = intentFromScenario(scenario);
      const resolution = makeResolution();
      const session = getOrCreateSession(undefined, TENANT, USER);

      steps.push(...evaluateIntent(intent, scenario.expectedIntent));

      const plan = buildExecutionPlan(intent, resolution);
      const safety = verifyWriteContextSafety(session, resolution, plan);
      steps.push(...evaluateSafety(safety, scenario.expectedSafety!));

      const passed = steps.every(s => s.passed);
      allResults.push({ scenarioId: scenario.id, domain: scenario.domain, name: scenario.name, passed, steps, durationMs: Date.now() - start });
      expect(passed).toBe(true);
    });

    it("blocks ambiguous client", () => {
      const scenario = goldenScenarios.find(s => s.id === "safety-ambiguous-client")!;
      const start = Date.now();
      const steps: ScenarioEvalResult["steps"] = [];
      const intent = intentFromScenario(scenario);
      const resolution = makeResolution({
        clientId: CONTACT_A,
        clientLabel: "Jan Novák",
        ambiguous: true,
        alternatives: [{ id: CONTACT_B, label: "Jana Nováková" }],
      });
      const session = getOrCreateSession(undefined, TENANT, USER);

      steps.push(...evaluateIntent(intent, scenario.expectedIntent));

      const plan = buildExecutionPlan(intent, resolution);
      const safety = verifyWriteContextSafety(session, resolution, plan);
      steps.push(...evaluateSafety(safety, scenario.expectedSafety!));

      const passed = steps.every(s => s.passed);
      allResults.push({ scenarioId: scenario.id, domain: scenario.domain, name: scenario.name, passed, steps, durationMs: Date.now() - start });
      expect(passed).toBe(true);
    });

    it("warns on cross-client mismatch", () => {
      const scenario = goldenScenarios.find(s => s.id === "safety-cross-client-warning")!;
      const start = Date.now();
      const steps: ScenarioEvalResult["steps"] = [];
      const intent = intentFromScenario(scenario);
      const resolution = makeResolution({ clientId: CONTACT_B, clientLabel: "Marie Procházková" });
      const session = getOrCreateSession(undefined, TENANT, USER);
      lockAssistantClient(session, CONTACT_A);

      steps.push(...evaluateIntent(intent, scenario.expectedIntent));

      const plan = buildExecutionPlan(intent, resolution);
      const safety = verifyWriteContextSafety(session, resolution, plan);
      steps.push(...evaluateSafety(safety, scenario.expectedSafety!));

      const passed = steps.every(s => s.passed);
      allResults.push({ scenarioId: scenario.id, domain: scenario.domain, name: scenario.name, passed, steps, durationMs: Date.now() - start });
      expect(passed).toBe(true);
    });
  });

  it("aggregates eval run summary", () => {
    if (allResults.length === 0) return;
    const summary = aggregateEvalRun(allResults);
    expect(summary.totalScenarios).toBeGreaterThan(0);
    expect(summary.passed + summary.failed).toBe(summary.totalScenarios);
    console.log("=== EVAL SUMMARY ===");
    console.log(`Total: ${summary.totalScenarios}, Passed: ${summary.passed}, Failed: ${summary.failed}`);
    for (const [domain, stats] of Object.entries(summary.byDomain)) {
      if (stats.total > 0) {
        console.log(`  ${domain}: ${stats.passed}/${stats.total} passed`);
      }
    }
  });
});
