/**
 * Image Intake Phase 1: contract / type sanity checks.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditAction: vi.fn() }));
vi.mock("@/lib/openai", () => ({ createResponseStructured: vi.fn(), createResponseSafe: vi.fn(), logOpenAICall: vi.fn() }));
import {
  IMAGE_INPUT_TYPES,
  IMAGE_INPUT_SUBTYPES,
  IMAGE_OUTPUT_MODES,
  IMAGE_QUALITY_LEVELS,
  LANE_DECISIONS,
  CLIENT_BINDING_STATES,
  FACT_TYPES,
  SUPPORTED_IMAGE_MIMES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGES_PER_INTAKE,
  IMAGE_INTAKE_ALLOWED_INTENTS,
  IMAGE_INTAKE_ALLOWED_WRITE_ACTIONS,
  emptyFactBundle,
  emptyActionPlan,
} from "../image-intake";

describe("Image Intake — type contracts", () => {
  it("input types include all required categories", () => {
    expect(IMAGE_INPUT_TYPES).toContain("screenshot_client_communication");
    expect(IMAGE_INPUT_TYPES).toContain("photo_or_scan_document");
    expect(IMAGE_INPUT_TYPES).toContain("screenshot_payment_details");
    expect(IMAGE_INPUT_TYPES).toContain("screenshot_bank_or_finance_info");
    expect(IMAGE_INPUT_TYPES).toContain("supporting_reference_image");
    expect(IMAGE_INPUT_TYPES).toContain("general_unusable_image");
    expect(IMAGE_INPUT_TYPES).toContain("mixed_or_uncertain_image");
    expect(IMAGE_INPUT_TYPES.length).toBe(7);
  });

  it("output modes include all required modes", () => {
    expect(IMAGE_OUTPUT_MODES).toContain("client_message_update");
    expect(IMAGE_OUTPUT_MODES).toContain("structured_image_fact_intake");
    expect(IMAGE_OUTPUT_MODES).toContain("supporting_reference_image");
    expect(IMAGE_OUTPUT_MODES).toContain("ambiguous_needs_input");
    expect(IMAGE_OUTPUT_MODES).toContain("no_action_archive_only");
    expect(IMAGE_OUTPUT_MODES.length).toBe(5);
  });

  it("lane decisions are well-defined", () => {
    expect(LANE_DECISIONS).toContain("image_intake");
    expect(LANE_DECISIONS).toContain("ai_review_handoff_suggestion");
    expect(LANE_DECISIONS).toContain("not_relevant");
  });

  it("client binding states are well-defined", () => {
    expect(CLIENT_BINDING_STATES).toContain("bound_client_confident");
    expect(CLIENT_BINDING_STATES).toContain("bound_case_confident");
    expect(CLIENT_BINDING_STATES).toContain("multiple_candidates");
    expect(CLIENT_BINDING_STATES).toContain("insufficient_binding");
  });

  it("subtypes cover key internal categories", () => {
    expect(IMAGE_INPUT_SUBTYPES).toContain("client_chat_single");
    expect(IMAGE_INPUT_SUBTYPES).toContain("payment_instruction");
    expect(IMAGE_INPUT_SUBTYPES).toContain("document_scan_single_page");
    expect(IMAGE_INPUT_SUBTYPES).toContain("low_quality_unreadable");
  });

  it("fact types cover required fact categories", () => {
    expect(FACT_TYPES).toContain("client_request");
    expect(FACT_TYPES).toContain("payment_amount");
    expect(FACT_TYPES).toContain("deadline_date");
    expect(FACT_TYPES).toContain("reference_only");
    expect(FACT_TYPES).toContain("unknown_unusable");
  });

  it("SUPPORTED_IMAGE_MIMES includes standard formats", () => {
    expect(SUPPORTED_IMAGE_MIMES.has("image/jpeg")).toBe(true);
    expect(SUPPORTED_IMAGE_MIMES.has("image/png")).toBe(true);
    expect(SUPPORTED_IMAGE_MIMES.has("image/webp")).toBe(true);
    expect(SUPPORTED_IMAGE_MIMES.has("image/heic")).toBe(true);
    expect(SUPPORTED_IMAGE_MIMES.has("application/pdf")).toBe(false);
  });

  it("MAX_IMAGE_SIZE_BYTES is 20 MB", () => {
    expect(MAX_IMAGE_SIZE_BYTES).toBe(20 * 1024 * 1024);
  });

  it("MAX_IMAGES_PER_INTAKE is 10", () => {
    expect(MAX_IMAGES_PER_INTAKE).toBe(10);
  });

  it("allowed intents are subset of canonical intents and exclude AI Review", () => {
    expect(IMAGE_INTAKE_ALLOWED_INTENTS.has("create_task")).toBe(true);
    expect(IMAGE_INTAKE_ALLOWED_INTENTS.has("create_internal_note")).toBe(true);
    expect(IMAGE_INTAKE_ALLOWED_INTENTS.has("attach_document")).toBe(true);
    // Must NOT include AI Review intents
    expect(IMAGE_INTAKE_ALLOWED_INTENTS.has("apply_ai_review_to_crm" as any)).toBe(false);
    expect(IMAGE_INTAKE_ALLOWED_INTENTS.has("approve_ai_contract_review" as any)).toBe(false);
    expect(IMAGE_INTAKE_ALLOWED_INTENTS.has("link_ai_review_to_document_vault" as any)).toBe(false);
  });

  it("allowed write actions exclude AI Review adapters", () => {
    expect(IMAGE_INTAKE_ALLOWED_WRITE_ACTIONS.has("createTask")).toBe(true);
    expect(IMAGE_INTAKE_ALLOWED_WRITE_ACTIONS.has("createInternalNote")).toBe(true);
    expect(IMAGE_INTAKE_ALLOWED_WRITE_ACTIONS.has("approveAiContractReview" as any)).toBe(false);
    expect(IMAGE_INTAKE_ALLOWED_WRITE_ACTIONS.has("applyAiContractReviewToCrm" as any)).toBe(false);
  });

  it("emptyFactBundle returns empty placeholder", () => {
    const bundle = emptyFactBundle();
    expect(bundle.facts).toEqual([]);
    expect(bundle.missingFields).toEqual([]);
    expect(bundle.ambiguityReasons).toEqual([]);
  });

  it("emptyActionPlan returns safe default for given output mode", () => {
    const plan = emptyActionPlan("ambiguous_needs_input");
    expect(plan.outputMode).toBe("ambiguous_needs_input");
    expect(plan.recommendedActions).toEqual([]);
    expect(plan.draftReplyText).toBeNull();
    expect(plan.needsAdvisorInput).toBe(false);
    expect(plan.safetyFlags).toEqual([]);
  });
});
