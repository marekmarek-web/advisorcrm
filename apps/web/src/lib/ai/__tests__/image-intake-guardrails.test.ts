/**
 * Image Intake Phase 1: guardrail tests.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditAction: vi.fn() }));
vi.mock("@/lib/openai", () => ({ createResponseStructured: vi.fn(), createResponseSafe: vi.fn(), createResponseStructuredWithImage: vi.fn(), logOpenAICall: vi.fn() }));
vi.mock("../assistant-contact-search", () => ({ searchContactsForAssistant: vi.fn(async () => []) }));
vi.mock("db", () => ({ db: {}, contacts: {}, eq: vi.fn(), and: vi.fn(), or: vi.fn(), isNull: vi.fn(), sql: vi.fn(), desc: vi.fn() }));
import {
  enforceImageIntakeGuardrails,
  isValidTerminalOutputMode,
  safeOutputModeForUncertainInput,
} from "../image-intake";
import type {
  LaneDecisionResult,
  InputClassificationResult,
  ClientBindingResult,
  ImageIntakeActionPlan,
  ImageIntakeActionCandidate,
} from "../image-intake";

function makeLane(lane: "image_intake" | "ai_review_handoff_suggestion" = "image_intake"): LaneDecisionResult {
  return { lane, confidence: 1.0, reason: "test", handoffReason: lane === "ai_review_handoff_suggestion" ? "looks like doc" : null };
}

function makeClassification(inputType: string, confidence = 0.9): InputClassificationResult {
  return {
    inputType: inputType as any,
    subtype: null,
    confidence,
    containsText: true,
    likelyMessageThread: inputType === "screenshot_client_communication",
    likelyDocument: inputType === "photo_or_scan_document",
    likelyPayment: inputType === "screenshot_payment_details",
    likelyFinancialInfo: false,
    uncertaintyFlags: [],
  };
}

function makeBinding(state: string, clientId: string | null = "c-1"): ClientBindingResult {
  return {
    state: state as any,
    clientId,
    clientLabel: clientId ? "Test Client" : null,
    confidence: clientId ? 0.9 : 0.0,
    candidates: state === "multiple_candidates" ? [{ id: "c-1", label: "A", score: 0.5 }, { id: "c-2", label: "B", score: 0.4 }] : [],
    source: clientId ? "session_context" : "none",
    warnings: [],
  };
}

function makeAction(intentType: string, writeAction: string | null = "createTask"): ImageIntakeActionCandidate {
  return {
    intentType: intentType as any,
    writeAction: writeAction as any,
    label: `Test ${intentType}`,
    reason: "test",
    confidence: 0.9,
    requiresConfirmation: true,
    params: {},
  };
}

function makePlan(
  outputMode: string = "client_message_update",
  actions: ImageIntakeActionCandidate[] = [],
  needsInput = false,
): ImageIntakeActionPlan {
  return {
    outputMode: outputMode as any,
    recommendedActions: actions,
    draftReplyText: null,
    whyThisAction: "test",
    whyNotOtherActions: null,
    needsAdvisorInput: needsInput,
    safetyFlags: [],
  };
}

describe("enforceImageIntakeGuardrails", () => {
  describe("G1: Lane separation", () => {
    it("blocks communication screenshots from going to AI Review", () => {
      const verdict = enforceImageIntakeGuardrails(
        makeLane("ai_review_handoff_suggestion"),
        makeClassification("screenshot_client_communication"),
        makeBinding("bound_client_confident"),
        makePlan("client_message_update"),
      );
      expect(verdict.passed).toBe(false);
      expect(verdict.violations.some((v) => v.includes("LANE_VIOLATION"))).toBe(true);
    });

    it("allows document to suggest AI Review handoff", () => {
      const verdict = enforceImageIntakeGuardrails(
        makeLane("ai_review_handoff_suggestion"),
        makeClassification("photo_or_scan_document"),
        makeBinding("bound_client_confident"),
        makePlan("supporting_reference_image"),
      );
      expect(verdict.violations.filter((v) => v.includes("LANE_VIOLATION"))).toEqual([]);
    });
  });

  describe("G2: Client binding safety", () => {
    it("blocks write-ready plan without confident binding", () => {
      const verdict = enforceImageIntakeGuardrails(
        makeLane(),
        makeClassification("screenshot_client_communication"),
        makeBinding("insufficient_binding", null),
        makePlan("client_message_update", [makeAction("create_task")]),
      );
      expect(verdict.violations.some((v) => v.includes("BINDING_VIOLATION"))).toBe(true);
      expect(verdict.modeDowngraded).toBe(true);
      expect(verdict.downgradedTo).toBe("ambiguous_needs_input");
    });

    it("blocks write when multiple candidates", () => {
      const verdict = enforceImageIntakeGuardrails(
        makeLane(),
        makeClassification("screenshot_payment_details"),
        makeBinding("multiple_candidates"),
        makePlan("structured_image_fact_intake", [makeAction("create_task")]),
      );
      expect(verdict.violations.some((v) => v.includes("BINDING_VIOLATION"))).toBe(true);
      expect(verdict.modeDowngraded).toBe(true);
    });

    it("passes with confident binding and write actions", () => {
      const verdict = enforceImageIntakeGuardrails(
        makeLane(),
        makeClassification("screenshot_client_communication"),
        makeBinding("bound_client_confident"),
        makePlan("client_message_update", [makeAction("create_task")]),
      );
      expect(verdict.violations.filter((v) => v.includes("BINDING_VIOLATION"))).toEqual([]);
      expect(verdict.modeDowngraded).toBe(false);
    });
  });

  describe("G3: Supporting not over-structured", () => {
    it("flags supporting image forced into structured intake with write actions", () => {
      const verdict = enforceImageIntakeGuardrails(
        makeLane(),
        makeClassification("supporting_reference_image"),
        makeBinding("bound_client_confident"),
        makePlan("structured_image_fact_intake", [makeAction("create_task")]),
      );
      expect(verdict.violations.some((v) => v.includes("STRUCTURE_VIOLATION"))).toBe(true);
    });

    it("does not flag supporting image in supporting mode", () => {
      const verdict = enforceImageIntakeGuardrails(
        makeLane(),
        makeClassification("supporting_reference_image"),
        makeBinding("bound_client_confident"),
        makePlan("supporting_reference_image"),
      );
      expect(verdict.violations.filter((v) => v.includes("STRUCTURE_VIOLATION"))).toEqual([]);
    });
  });

  describe("G4: Action surface restriction", () => {
    it("strips AI Review intents", () => {
      const verdict = enforceImageIntakeGuardrails(
        makeLane(),
        makeClassification("photo_or_scan_document"),
        makeBinding("bound_client_confident"),
        makePlan("structured_image_fact_intake", [
          makeAction("apply_ai_review_to_crm", "applyAiContractReviewToCrm"),
        ]),
      );
      expect(verdict.violations.some((v) => v.includes("ACTION_VIOLATION"))).toBe(true);
      expect(verdict.strippedActions.length).toBeGreaterThan(0);
    });

    it("passes allowed intents", () => {
      const verdict = enforceImageIntakeGuardrails(
        makeLane(),
        makeClassification("screenshot_client_communication"),
        makeBinding("bound_client_confident"),
        makePlan("client_message_update", [makeAction("create_task", "createTask")]),
      );
      expect(verdict.violations.filter((v) => v.includes("ACTION_VIOLATION"))).toEqual([]);
    });
  });

  describe("G5: Preview required", () => {
    it("forces confirmation when write actions skip it", () => {
      const action = makeAction("create_task");
      action.requiresConfirmation = false;
      const plan = makePlan("client_message_update", [action]);

      const verdict = enforceImageIntakeGuardrails(
        makeLane(),
        makeClassification("screenshot_client_communication"),
        makeBinding("bound_client_confident"),
        plan,
      );
      expect(verdict.violations.some((v) => v.includes("PREVIEW_VIOLATION"))).toBe(true);
      expect(plan.recommendedActions[0].requiresConfirmation).toBe(true);
    });
  });
});

describe("isValidTerminalOutputMode", () => {
  it("accepts all defined output modes", () => {
    expect(isValidTerminalOutputMode("client_message_update")).toBe(true);
    expect(isValidTerminalOutputMode("no_action_archive_only")).toBe(true);
    expect(isValidTerminalOutputMode("ambiguous_needs_input")).toBe(true);
  });
});

describe("safeOutputModeForUncertainInput", () => {
  it("returns ambiguous for null classification", () => {
    expect(safeOutputModeForUncertainInput(null, makeBinding("bound_client_confident"))).toBe("ambiguous_needs_input");
  });

  it("returns archive for unusable image", () => {
    expect(
      safeOutputModeForUncertainInput(
        makeClassification("general_unusable_image"),
        makeBinding("bound_client_confident"),
      ),
    ).toBe("no_action_archive_only");
  });

  it("returns ambiguous for insufficient binding", () => {
    expect(
      safeOutputModeForUncertainInput(
        makeClassification("screenshot_client_communication"),
        makeBinding("insufficient_binding", null),
      ),
    ).toBe("ambiguous_needs_input");
  });
});
