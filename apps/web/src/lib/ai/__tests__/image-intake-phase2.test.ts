/**
 * Image Intake Phase 2: end-to-end scenarios for route integration, binding, planner, response mapper.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/openai", () => ({
  createResponseStructured: vi.fn(),
  createResponseSafe: vi.fn(),
  createResponseStructuredWithImage: vi.fn(),
  logOpenAICall: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logAuditAction: vi.fn().mockResolvedValue(undefined),
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../assistant-contact-search", () => ({ searchContactsForAssistant: vi.fn(async () => []) }));
vi.mock("db", () => ({ db: {}, contacts: {}, eq: vi.fn(), and: vi.fn(), or: vi.fn(), isNull: vi.fn(), sql: vi.fn(), desc: vi.fn() }));

import { createResponseStructured } from "@/lib/openai";
import {
  processImageIntake,
  isImageIntakeEnabled,
  parseImageAssetsFromBody,
  buildActionPlanV1,
  resolveClientBindingV2,
  mapImageIntakeToAssistantResponse,
  purgePreflightCache,
} from "../image-intake";
import type { NormalizedImageAsset, ImageIntakeRequest } from "../image-intake";
import { getOrCreateSession, lockAssistantClient } from "../assistant-session";

const TENANT = "t-p2-test";
const USER = "u-p2-test";
const CLIENT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SESSION_ID = "sess-p2-test";

function makeAsset(overrides: Partial<NormalizedImageAsset> = {}): NormalizedImageAsset {
  return {
    assetId: `asset-${Math.random().toString(36).slice(2, 8)}`,
    originalFilename: "WhatsApp Image.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 500_000,
    width: 1080,
    height: 1920,
    contentHash: `hash-${Math.random().toString(36).slice(2, 8)}`,
    storageUrl: "https://storage.example.com/img.jpg",
    thumbnailUrl: null,
    uploadedAt: new Date(),
    ...overrides,
  };
}

function makeRequest(overrides: Partial<ImageIntakeRequest> = {}): ImageIntakeRequest {
  return {
    sessionId: SESSION_ID,
    tenantId: TENANT,
    userId: USER,
    assets: [makeAsset()],
    activeClientId: null,
    activeOpportunityId: null,
    activeCaseId: null,
    accompanyingText: null,
    channel: "web_drawer",
    ...overrides,
  };
}

function mockModel(inputType: string, confidence = 0.85) {
  vi.mocked(createResponseStructured).mockResolvedValueOnce({
    text: "{}",
    parsed: { inputType, confidence, rationale: "test", needsDeepExtraction: true, safePreviewAlready: false },
    model: "gpt-5-mini",
  });
}

describe("Feature flag", () => {
  it("is disabled by default (no env var)", () => {
    // In test env, IMAGE_INTAKE_ENABLED is not set
    expect(isImageIntakeEnabled()).toBe(false);
  });

  it("is enabled when env var is set to true", () => {
    const orig = process.env.IMAGE_INTAKE_ENABLED;
    process.env.IMAGE_INTAKE_ENABLED = "true";
    expect(isImageIntakeEnabled()).toBe(true);
    process.env.IMAGE_INTAKE_ENABLED = orig ?? "";
  });

  it("is disabled for any value other than 'true'", () => {
    const orig = process.env.IMAGE_INTAKE_ENABLED;
    for (const val of ["1", "yes", "True", "TRUE", ""]) {
      process.env.IMAGE_INTAKE_ENABLED = val;
      expect(isImageIntakeEnabled()).toBe(false);
    }
    process.env.IMAGE_INTAKE_ENABLED = orig ?? "";
  });
});

describe("parseImageAssetsFromBody", () => {
  it("returns empty array for body without imageAssets", () => {
    expect(parseImageAssetsFromBody({ message: "hello" })).toEqual([]);
    expect(parseImageAssetsFromBody(null)).toEqual([]);
    expect(parseImageAssetsFromBody({})).toEqual([]);
  });

  it("parses valid imageAssets", () => {
    const body = {
      imageAssets: [
        { url: "https://storage.example.com/img.jpg", mimeType: "image/jpeg", filename: "photo.jpg", sizeBytes: 500000 },
      ],
    };
    const result = parseImageAssetsFromBody(body);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe("https://storage.example.com/img.jpg");
    expect(result[0].mimeType).toBe("image/jpeg");
  });

  it("filters out items without url", () => {
    const body = {
      imageAssets: [
        { mimeType: "image/jpeg" }, // no url
        { url: "https://ok.com/img.jpg", mimeType: "image/png" },
      ],
    };
    const result = parseImageAssetsFromBody(body);
    expect(result).toHaveLength(1);
  });

  it("caps at MAX_IMAGES_PER_INTAKE", () => {
    const body = {
      imageAssets: Array.from({ length: 15 }, (_, i) => ({
        url: `https://storage.example.com/img${i}.jpg`,
        mimeType: "image/jpeg",
      })),
    };
    const result = parseImageAssetsFromBody(body);
    expect(result.length).toBeLessThanOrEqual(10);
  });
});

describe("resolveClientBindingV2 (session priority)", () => {
  it("uses session locked client (highest priority)", async () => {
    const session = getOrCreateSession(SESSION_ID, TENANT, USER);
    lockAssistantClient(session, CLIENT_ID);
    const result = await resolveClientBindingV2(makeRequest(), session, null);
    expect(result.state).toBe("bound_client_confident");
    expect(result.clientId).toBe(CLIENT_ID);
    expect(result.source).toBe("session_context");
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("uses request activeClientId when session has no lock", async () => {
    const result = await resolveClientBindingV2(makeRequest({ activeClientId: CLIENT_ID }), null, null);
    expect(result.state).toBe("bound_client_confident");
    expect(result.clientId).toBe(CLIENT_ID);
    expect(result.source).toBe("ui_context");
  });

  it("returns insufficient_binding when no client available", async () => {
    const result = await resolveClientBindingV2(makeRequest(), null, null);
    expect(result.state).toBe("insufficient_binding");
    expect(result.clientId).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("buildActionPlanV1", () => {
  function makeClassification(inputType: string, confidence = 0.85) {
    return {
      inputType: inputType as any,
      subtype: null as any,
      confidence,
      containsText: true,
      likelyMessageThread: inputType === "screenshot_client_communication",
      likelyDocument: false,
      likelyPayment: false,
      likelyFinancialInfo: false,
      uncertaintyFlags: [],
    };
  }

  function makeBinding(state: string, clientId: string | null = CLIENT_ID) {
    return {
      state: state as any,
      clientId,
      clientLabel: null as null,
      confidence: clientId ? 0.9 : 0.0,
      candidates: [],
      source: "session_context" as const,
      warnings: [],
    };
  }

  it("no_action_archive_only for unusable image", () => {
    const plan = buildActionPlanV1(
      makeClassification("general_unusable_image"),
      makeBinding("bound_client_confident"),
    );
    expect(plan.outputMode).toBe("no_action_archive_only");
    expect(plan.recommendedActions).toHaveLength(0);
    expect(plan.needsAdvisorInput).toBe(true);
  });

  it("ambiguous when binding is insufficient", () => {
    const plan = buildActionPlanV1(
      makeClassification("screenshot_client_communication"),
      makeBinding("insufficient_binding", null),
    );
    expect(plan.outputMode).toBe("ambiguous_needs_input");
    expect(plan.needsAdvisorInput).toBe(true);
  });

  it("client_message_update with actions when communication + confident binding", () => {
    const plan = buildActionPlanV1(
      makeClassification("screenshot_client_communication", 0.88),
      makeBinding("bound_client_confident"),
    );
    expect(plan.outputMode).toBe("client_message_update");
    expect(plan.recommendedActions.length).toBeGreaterThan(0);
    expect(plan.recommendedActions.every((a) => a.requiresConfirmation)).toBe(true);
  });

  it("supporting_reference_image stays as supporting", () => {
    const plan = buildActionPlanV1(
      makeClassification("supporting_reference_image", 0.9),
      makeBinding("bound_client_confident"),
    );
    expect(plan.outputMode).toBe("supporting_reference_image");
  });

  it("all actions require confirmation (no auto-write)", () => {
    const plan = buildActionPlanV1(
      makeClassification("screenshot_payment_details", 0.85),
      makeBinding("bound_client_confident"),
    );
    expect(plan.recommendedActions.every((a) => a.requiresConfirmation)).toBe(true);
  });

  it("no AI Review actions in any plan", () => {
    for (const inputType of [
      "screenshot_client_communication",
      "photo_or_scan_document",
      "screenshot_payment_details",
    ]) {
      const plan = buildActionPlanV1(
        makeClassification(inputType, 0.85),
        makeBinding("bound_client_confident"),
      );
      const hasReviewAction = plan.recommendedActions.some(
        (a) =>
          a.intentType === "apply_ai_review_to_crm" ||
          a.intentType === "approve_ai_contract_review" ||
          a.writeAction === "applyAiContractReviewToCrm" ||
          a.writeAction === "approveAiContractReview",
      );
      expect(hasReviewAction).toBe(false);
    }
  });
});

describe("processImageIntake — Phase 2 pipeline", () => {
  beforeEach(() => {
    purgePreflightCache(SESSION_ID);
    vi.resetAllMocks();
  });

  it("returns ambiguous when no client and generic image", async () => {
    mockModel("mixed_or_uncertain_image", 0.3);
    const result = await processImageIntake(makeRequest(), null);
    expect(result.response.clientBinding.state).toBe("insufficient_binding");
    expect(result.response.actionPlan.outputMode).toBe("ambiguous_needs_input");
    expect(result.previewPayload.writeReady).toBe(false);
  });

  it("uses real classifier (not stub) for eligible assets", async () => {
    mockModel("screenshot_client_communication", 0.87);
    const session = getOrCreateSession(SESSION_ID, TENANT, USER);
    lockAssistantClient(session, CLIENT_ID);

    // Use neutral filename to ensure model layer is triggered
    const result = await processImageIntake(
      makeRequest({ assets: [makeAsset({ originalFilename: "attachment_neutral.jpg" })] }),
      session,
    );

    expect(createResponseStructured).toHaveBeenCalledOnce();
    expect(result.response.classification?.inputType).toBe("screenshot_client_communication");
  });

  it("skips model call for obvious unusable (early exit, no model)", async () => {
    const result = await processImageIntake(
      makeRequest({
        assets: [makeAsset({ width: 30, height: 30 })],
      }),
      null,
    );
    expect(createResponseStructured).not.toHaveBeenCalled();
    expect(result.response.actionPlan.outputMode).toBe("no_action_archive_only");
    expect(result.classifierUsedModel).toBe(false);
  });

  it("returns no_action for unsupported MIME (preflight exit)", async () => {
    const result = await processImageIntake(
      makeRequest({ assets: [makeAsset({ mimeType: "application/pdf" })] }),
      null,
    );
    expect(result.response.preflight.eligible).toBe(false);
    expect(result.response.classification).toBeNull();
    expect(createResponseStructured).not.toHaveBeenCalled();
  });

  it("stores execution plan with steps for actionable output", async () => {
    mockModel("screenshot_client_communication", 0.88);
    const session = getOrCreateSession(SESSION_ID + "_plan", TENANT, USER);
    lockAssistantClient(session, CLIENT_ID);

    const result = await processImageIntake(
      makeRequest({ sessionId: SESSION_ID + "_plan" }),
      session,
    );

    if (result.executionPlan) {
      expect(result.executionPlan.steps.every((s) => s.requiresConfirmation)).toBe(true);
      expect(result.executionPlan.contactId).toBe(CLIENT_ID);
      // Must reuse canonical write action types
      const allowedActions = ["createTask", "createFollowUp", "createInternalNote", "createMeetingNote", "attachDocumentToClient", "attachDocumentToOpportunity", "createClientRequest", "draftClientPortalMessage", "scheduleCalendarEvent"];
      result.executionPlan.steps.forEach((s) => {
        expect(allowedActions).toContain(s.action);
      });
    }
  });

  it("guardrails prevent AI Review actions from appearing", async () => {
    mockModel("photo_or_scan_document", 0.9);
    const session = getOrCreateSession(SESSION_ID + "_review_guard", TENANT, USER);
    lockAssistantClient(session, CLIENT_ID);

    const result = await processImageIntake(
      makeRequest({ sessionId: SESSION_ID + "_review_guard" }),
      session,
    );

    const hasReviewAction = result.response.actionPlan.recommendedActions.some(
      (a) =>
        a.writeAction === "applyAiContractReviewToCrm" ||
        a.writeAction === "approveAiContractReview",
    );
    expect(hasReviewAction).toBe(false);
  });

  it("no_action_archive_only is valid terminal outcome", async () => {
    const result = await processImageIntake(
      makeRequest({ assets: [makeAsset({ mimeType: "image/png", width: 20, height: 20 })] }),
      null,
    );
    expect(result.response.actionPlan.outputMode).toBe("no_action_archive_only");
    expect(result.executionPlan).toBeNull();
  });

  it("duplicate asset (same hash) is processed safely", async () => {
    mockModel("screenshot_client_communication", 0.88);
    const hash = "duplicate-hash-abc";

    await processImageIntake(makeRequest({ assets: [makeAsset({ contentHash: hash })] }), null);
    vi.clearAllMocks();

    const result = await processImageIntake(
      makeRequest({ assets: [makeAsset({ contentHash: hash })] }),
      null,
    );

    // Duplicate flagged in preflight
    expect(result.response.preflight.isDuplicate).toBe(true);
  });
});

describe("mapImageIntakeToAssistantResponse", () => {
  it("returns valid AssistantResponse shape", async () => {
    mockModel("screenshot_client_communication", 0.88);
    const session = getOrCreateSession(SESSION_ID + "_mapper", TENANT, USER);
    lockAssistantClient(session, CLIENT_ID);

    const result = await processImageIntake(
      makeRequest({ sessionId: SESSION_ID + "_mapper" }),
      session,
    );

    const response = mapImageIntakeToAssistantResponse(result, SESSION_ID);

    expect(typeof response.message).toBe("string");
    expect(response.message.length).toBeGreaterThan(0);
    expect(Array.isArray(response.warnings)).toBe(true);
    expect(typeof response.confidence).toBe("number");
    expect(response.sessionId).toBe(SESSION_ID);
    expect(Array.isArray(response.referencedEntities)).toBe(true);
    expect(Array.isArray(response.suggestedActions)).toBe(true);
  });

  it("no executionState for no_action_archive_only", async () => {
    const result = await processImageIntake(
      makeRequest({ assets: [makeAsset({ width: 20, height: 20 })] }),
      null,
    );
    const response = mapImageIntakeToAssistantResponse(result, SESSION_ID);
    expect(response.executionState).toBeNull();
  });
});
