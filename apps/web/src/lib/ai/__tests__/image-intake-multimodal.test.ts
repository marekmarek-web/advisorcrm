/**
 * Tests for image-intake multimodal combined pass (Phase 3).
 * Verifies:
 * - shouldRunMultimodalPass decision logic
 * - Combined pass calls createResponseStructuredWithImage
 * - Normalization of raw model output
 * - Fallback on model error
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditAction: vi.fn() }));
vi.mock("@/lib/openai", () => ({
  createResponseStructuredWithImage: vi.fn(),
}));
const mockMultimodalEnabled = vi.hoisted(() => vi.fn(() => true));
const mockGetMultimodalConfig = vi.hoisted(() => vi.fn(() => ({ model: undefined, routingCategory: "copilot" as const })));

vi.mock("../image-intake/feature-flag", () => ({
  isImageIntakeEnabled: vi.fn(() => true),
  isImageIntakeMultimodalEnabled: mockMultimodalEnabled,
  getImageIntakeMultimodalConfig: mockGetMultimodalConfig,
  getImageIntakeFlagState: vi.fn(() => "enabled"),
  getImageIntakeMultimodalFlagState: vi.fn(() => "enabled"),
  getImageIntakeClassifierConfig: vi.fn(() => ({
    model: undefined,
    routingCategory: "copilot",
    maxOutputTokens: 120,
  })),
}));

import { shouldRunMultimodalPass, runCombinedMultimodalPass } from "../image-intake/multimodal";
import type { ImageInputType, IntentContract } from "../image-intake/types";
import { createResponseStructuredWithImage } from "@/lib/openai";

const mockCreateResponse = vi.mocked(createResponseStructuredWithImage);

beforeEach(() => {
  vi.resetAllMocks();
  mockMultimodalEnabled.mockReturnValue(true);
  mockGetMultimodalConfig.mockReturnValue({ model: undefined, routingCategory: "copilot" });
});

describe("shouldRunMultimodalPass", () => {
  const storageUrl = "https://example.com/img.jpg";

  it("returns true for screenshot_client_communication with storageUrl and enabled", () => {
    expect(shouldRunMultimodalPass("screenshot_client_communication", 0.9, false, storageUrl, true)).toBe(true);
  });

  it("returns true for screenshot_payment_details", () => {
    expect(shouldRunMultimodalPass("screenshot_payment_details", 0.8, false, storageUrl, true)).toBe(true);
  });

  it("returns true for screenshot_bank_or_finance_info", () => {
    expect(shouldRunMultimodalPass("screenshot_bank_or_finance_info", 0.7, false, storageUrl, true)).toBe(true);
  });

  it("returns true for photo_or_scan_document", () => {
    expect(shouldRunMultimodalPass("photo_or_scan_document", 0.75, false, storageUrl, true)).toBe(true);
  });

  it("returns false for general_unusable_image", () => {
    expect(shouldRunMultimodalPass("general_unusable_image", 0.9, false, storageUrl, true)).toBe(false);
  });

  it("returns false for supporting_reference_image", () => {
    expect(shouldRunMultimodalPass("supporting_reference_image", 0.9, false, storageUrl, true)).toBe(false);
  });

  it("returns false when earlyExit=true", () => {
    expect(shouldRunMultimodalPass("screenshot_client_communication", 0.9, true, storageUrl, true)).toBe(false);
  });

  it("returns false when storageUrl is null", () => {
    expect(shouldRunMultimodalPass("screenshot_client_communication", 0.9, false, null, true)).toBe(false);
  });

  it("returns false when multimodalEnabled=false", () => {
    expect(shouldRunMultimodalPass("screenshot_client_communication", 0.9, false, storageUrl, false)).toBe(false);
  });

  it("returns true for mixed_or_uncertain_image with low confidence", () => {
    expect(shouldRunMultimodalPass("mixed_or_uncertain_image", 0.3, false, storageUrl, true)).toBe(true);
  });

  it("returns false for mixed_or_uncertain_image with high confidence", () => {
    expect(shouldRunMultimodalPass("mixed_or_uncertain_image", 0.7, false, storageUrl, true)).toBe(false);
  });
});

describe("runCombinedMultimodalPass", () => {
  it("calls createResponseStructuredWithImage with image URL and returns structured result", async () => {
    mockCreateResponse.mockResolvedValueOnce({
      text: "{}",
      parsed: {
        inputType: "screenshot_client_communication",
        confidence: 0.88,
        rationale: "Chat screenshot identified",
        actionabilityLevel: "high",
        possibleClientNameSignal: "Jan Novák",
        facts: [
          { factKey: "what_client_said", value: "Chci refinancovat hypotéku", confidence: 0.9, source: "observed" },
          { factKey: "required_follow_up", value: "Zavolat zpět do pátku", confidence: 0.85, source: "observed" },
        ],
        missingFields: [],
        ambiguityReasons: [],
        draftReplyIntent: "Potvrzení přijetí žádosti o refinancování",
      },
      model: "gpt-4o-mini",
    });

    const result = await runCombinedMultimodalPass(
      "https://example.com/chat_screenshot.jpg",
      "screenshot_client_communication",
      "Posílám screenshot od klienta",
    );

    expect(result.usedModel).toBe(true);
    expect(result.result.inputType).toBe("screenshot_client_communication");
    expect(result.result.confidence).toBeCloseTo(0.88);
    expect(result.result.possibleClientNameSignal).toBe("Jan Novák");
    expect(result.result.facts).toHaveLength(2);
    expect(result.result.draftReplyIntent).toBe("Potvrzení přijetí žádosti o refinancování");
  });

  it("passes understanding-first guidance when authority is preview_only", async () => {
    mockCreateResponse.mockResolvedValueOnce({
      text: "{}",
      parsed: {
        inputType: "photo_or_scan_document",
        confidence: 0.7,
        rationale: "doc",
        actionabilityLevel: "low",
        possibleClientNameSignal: null,
        facts: [],
        missingFields: [],
        ambiguityReasons: [],
        draftReplyIntent: null,
      },
      model: "gpt-4o-mini",
    });

    const contract: IntentContract = {
      userGoal: "summarize",
      targetEntity: "active_client",
      allowedActionLevel: "preview_only",
      requiresExplicitConfirmation: false,
      explanation: "preview only",
      evidence: [],
    };

    await runCombinedMultimodalPass(
      "https://example.com/doc.jpg",
      "photo_or_scan_document",
      "doplň rodné číslo",
      contract,
    );

    expect(mockCreateResponse.mock.calls[0]?.[1]).toContain("pokud není výslovný CRM pokyn");
  });

  it("returns fallback result on model error", async () => {
    mockCreateResponse.mockRejectedValueOnce(new Error("API timeout"));

    const result = await runCombinedMultimodalPass(
      "https://example.com/img.jpg",
      null,
      null,
    );

    expect(result.usedModel).toBe(true);
    expect(result.result.inputType).toBe("mixed_or_uncertain_image");
    expect(result.result.confidence).toBe(0.0);
    expect(result.result.ambiguityReasons).toContain("multimodal_pass_failed");
  });

  it("normalizes invalid inputType to mixed_or_uncertain_image", async () => {
    mockCreateResponse.mockResolvedValueOnce({
      text: "{}",
      parsed: {
        inputType: "INVALID_TYPE_FROM_MODEL",
        confidence: 0.5,
        rationale: "test",
        actionabilityLevel: "low",
        possibleClientNameSignal: null,
        facts: [],
        missingFields: [],
        ambiguityReasons: [],
        draftReplyIntent: null,
      },
      model: "gpt-4o-mini",
    });

    const result = await runCombinedMultimodalPass("https://example.com/img.jpg", null, null);
    expect(result.result.inputType).toBe("mixed_or_uncertain_image");
  });

  it("clamps confidence to [0,1]", async () => {
    mockCreateResponse.mockResolvedValueOnce({
      text: "{}",
      parsed: {
        inputType: "screenshot_payment_details",
        confidence: 1.5,
        rationale: "test",
        actionabilityLevel: "medium",
        possibleClientNameSignal: null,
        facts: [],
        missingFields: [],
        ambiguityReasons: [],
        draftReplyIntent: null,
      },
      model: "gpt-4o-mini",
    });

    const result = await runCombinedMultimodalPass("https://example.com/img.jpg", "screenshot_payment_details", null);
    expect(result.result.confidence).toBe(1.0);
  });

  it("multimodal is NOT called for general_unusable_image via shouldRunMultimodalPass guard", () => {
    // This tests the gating logic, not the function directly
    const shouldRun = shouldRunMultimodalPass("general_unusable_image", 0.9, false, "https://example.com/img.jpg", true);
    expect(shouldRun).toBe(false);
    // Confirm no model call was made
    expect(mockCreateResponse).not.toHaveBeenCalled();
  });
});
