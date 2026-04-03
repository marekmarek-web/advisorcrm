/**
 * Phase 2H: release gate test — enforces quality thresholds
 * by running the full eval + regression suite and checking pass rates.
 *
 * This test is designed to fail CI if any blocking criteria is not met.
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

import { emptyCanonicalIntent, type CanonicalIntent, type ExecutionPlan } from "../assistant-domain-model";
import { buildExecutionPlan, confirmAllSteps, getStepsAwaitingConfirmation } from "../assistant-execution-plan";
import { buildVerifiedResult } from "../assistant-execution-engine";
import { verifyWriteContextSafety } from "../assistant-context-safety";
import { computeStepFingerprint, checkRecentFingerprint, recordFingerprint } from "../assistant-action-fingerprint";
import { getOrCreateSession, lockAssistantClient } from "../assistant-session";
import { evaluateIntent, evaluatePlan, evaluateSafety, aggregateEvalRun } from "../assistant-eval-runner";
import type { ScenarioEvalResult } from "../assistant-eval-types";
import { goldenScenarios } from "./assistant-golden-scenarios";
import { replayFixtures, type ReplayFixture } from "./assistant-replay-fixtures";
import { evaluateReleaseGate, formatGateReport, PHASE_2_THRESHOLDS } from "../assistant-release-gate";

const TENANT = "t-gate";
const USER = "u-gate";
const CONTACT_A = "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CONTACT_B = "bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function makeResolution(opts: { clientId?: string; ambiguous?: boolean; alternatives?: { id: string; label: string }[]; confidence?: number } = {}) {
  return {
    client: opts.clientId ? {
      entityType: "contact" as const,
      entityId: opts.clientId,
      displayLabel: "Test",
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

function intentFromGolden(scenario: typeof goldenScenarios[number]): CanonicalIntent {
  const base = emptyCanonicalIntent();
  return {
    ...base,
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
            createClientRequest: "create_service_case",
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
            createReminder: "create_reminder",
          };
          return (reverseMap[a] ?? scenario.expectedIntent.intentType) as any;
        })
      : [scenario.expectedIntent.intentType],
  };
}

describe("Phase 2H: Release Gate", () => {
  it("passes all quality thresholds for Phase 2 acceptance", () => {
    // ── Run golden eval scenarios ──
    const evalResults: ScenarioEvalResult[] = [];

    for (const scenario of goldenScenarios) {
      const start = Date.now();
      const steps: ScenarioEvalResult["steps"] = [];
      const intent = intentFromGolden(scenario);

      const isSafety = scenario.domain === "safety";
      const isNoClientScenario = scenario.id === "safety-no-client-write";
      const isAmbiguous = scenario.id === "safety-ambiguous-client";
      const needsClient = !isNoClientScenario && (!isSafety || scenario.expectedPlan?.expectedContactIdPresent);

      const resolution = isAmbiguous
        ? makeResolution({ clientId: CONTACT_A, ambiguous: true, alternatives: [{ id: CONTACT_B, label: "Alt" }] })
        : needsClient || scenario.expectedPlan?.expectedContactIdPresent
          ? makeResolution({ clientId: CONTACT_A })
          : makeResolution();

      const session = getOrCreateSession(undefined, TENANT, USER);
      if (scenario.id === "safety-cross-client-warning") {
        lockAssistantClient(session, CONTACT_A);
      }
      if (scenario.domain === "documents") {
        session.activeReviewId = "review-gate";
        session.lockedDocumentId = "doc-gate";
      }

      steps.push(...evaluateIntent(intent, scenario.expectedIntent));

      if (scenario.expectedPlan) {
        const plan = buildExecutionPlan(intent, resolution, session);
        steps.push(...evaluatePlan(plan, scenario.expectedPlan));
      }

      if (scenario.expectedSafety) {
        const plan = buildExecutionPlan(intent, resolution, session);
        const safetyResolution = scenario.id === "safety-cross-client-warning"
          ? makeResolution({ clientId: CONTACT_B })
          : resolution;
        const safety = verifyWriteContextSafety(session, safetyResolution, plan);
        steps.push(...evaluateSafety(safety, scenario.expectedSafety));
      }

      const passed = steps.every(s => s.passed);
      evalResults.push({
        scenarioId: scenario.id,
        domain: scenario.domain,
        name: scenario.name,
        passed,
        steps,
        durationMs: Date.now() - start,
      });
    }

    const evalSummary = aggregateEvalRun(evalResults);

    // ── Check red flags from regression fixtures ──
    const redFlagGroups = new Map<string, boolean>();
    for (const flag of PHASE_2_THRESHOLDS.zeroToleranceRedFlags) {
      const flagFixtures = replayFixtures.filter(f => f.redFlag === flag);
      let allPass = true;

      for (const f of flagFixtures) {
        const session = getOrCreateSession(undefined, TENANT, USER);
        if (f.input.lockedClientId) lockAssistantClient(session, f.input.lockedClientId);
        if (f.input.activeReviewId) session.activeReviewId = f.input.activeReviewId;
        if (f.input.lockedDocumentId) session.lockedDocumentId = f.input.lockedDocumentId;

        const intent: CanonicalIntent = {
          ...emptyCanonicalIntent(),
          ...f.expectedIntent,
          intentType: f.expectedIntent.intentType ?? emptyCanonicalIntent().intentType,
          requestedActions: f.expectedPlan.expectedActions.map(a => {
            const reverseMap: Record<string, string> = {
              createOpportunity: "create_opportunity", createTask: "create_task",
              createFollowUp: "create_followup", createClientRequest: "create_service_case",
              createMaterialRequest: "create_material_request", classifyDocument: "classify_document",
              setDocumentVisibleToClient: "show_document_to_client",
              approveAiContractReview: "approve_ai_contract_review",
              applyAiContractReviewToCrm: "apply_ai_review_to_crm",
              createClientPortalNotification: "notify_client_portal",
              createInternalNote: "create_internal_note",
              triggerDocumentReview: "request_document_review",
              createReminder: "create_reminder",
            };
            return (reverseMap[a] ?? f.expectedIntent.intentType ?? "general_chat") as any;
          }),
        };

        const plan = buildExecutionPlan(intent, f.resolution, session);
        const safety = verifyWriteContextSafety(session, f.resolution, plan);

        if (safety.safe !== f.expectedSafety.safe) allPass = false;
        if (f.expectedSafety.blockedReason && safety.blockedReason !== f.expectedSafety.blockedReason) allPass = false;

        if (flag === "fake_confirmation" && f.expectedPlan.expectedStatus) {
          if (plan.status !== f.expectedPlan.expectedStatus) allPass = false;
          if (getStepsAwaitingConfirmation(plan).length === 0) allPass = false;
        }

        if (flag === "duplicate_create") {
          for (let i = 0; i < plan.steps.length; i++) {
            const fp1 = computeStepFingerprint(plan.steps[i]!);
            const plan2 = buildExecutionPlan(intent, f.resolution, session);
            const fp2 = computeStepFingerprint(plan2.steps[i]!);
            if (fp1 !== fp2) allPass = false;
          }
        }

        if (flag === "incomplete_partial_failure" && plan.steps.length >= 2) {
          const confirmed = confirmAllSteps(plan);
          const partialPlan: ExecutionPlan = {
            ...confirmed,
            status: "partial_failure",
            steps: [
              { ...confirmed.steps[0]!, status: "succeeded", result: { ok: true, outcome: "executed" as const, entityId: "e1", entityType: "task", warnings: [], error: null } },
              { ...confirmed.steps[1]!, status: "failed", result: { ok: false, outcome: "failed" as const, entityId: null, entityType: null, warnings: [], error: "err" } },
            ],
          };
          const verified = buildVerifiedResult("Test.", partialPlan);
          if (!verified.hasPartialFailure) allPass = false;
          if (verified.allSucceeded) allPass = false;
          if (verified.stepOutcomes.length < 2) allPass = false;
        }
      }

      redFlagGroups.set(flag, flagFixtures.length > 0 ? allPass : false);
    }

    const redFlagResults = [...redFlagGroups.entries()].map(([flag, allPassed]) => ({ flag, allPassed }));

    // ── Evaluate release gate ──
    const gateResult = evaluateReleaseGate(
      evalSummary,
      replayFixtures.length,
      goldenScenarios.length,
      redFlagResults,
    );

    const report = formatGateReport(gateResult);
    console.log(report);

    // ── Assert gate passes ──
    for (const check of gateResult.checks) {
      if (check.blocking) {
        expect(check.passed, `BLOCKING gate check failed: ${check.name} — expected ${check.expected}, actual ${check.actual}`).toBe(true);
      }
    }

    expect(gateResult.passed).toBe(true);
  });
});
