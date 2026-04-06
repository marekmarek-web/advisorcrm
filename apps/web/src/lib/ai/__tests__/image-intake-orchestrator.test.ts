/**
 * Image Intake Phase 1: orchestrator integration tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditAction: vi.fn() }));
vi.mock("@/lib/openai", () => ({ createResponseStructured: vi.fn(), createResponseSafe: vi.fn(), createResponseStructuredWithImage: vi.fn(), logOpenAICall: vi.fn() }));
vi.mock("../assistant-contact-search", () => ({ searchContactsForAssistant: vi.fn(async () => []) }));
vi.mock("db", () => ({ db: {}, contacts: {}, eq: vi.fn(), and: vi.fn(), or: vi.fn(), isNull: vi.fn(), sql: vi.fn(), desc: vi.fn() }));
import {
  processImageIntake,
  mapToExecutionPlan,
  mapToPreviewItems,
  buildImageIntakePreview,
  emptyActionPlan,
  emptyFactBundle,
  purgePreflightCache,
} from "../image-intake";
import type {
  ImageIntakeRequest,
  NormalizedImageAsset,
  ClientBindingResult,
  CaseBindingResult,
  InputClassificationResult,
} from "../image-intake";
import { getOrCreateSession, lockAssistantClient } from "../assistant-session";

const TENANT = "t-img-test";
const USER = "u-img-test";
const CLIENT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SESSION_ID = "sess-img-test";

function makeAsset(overrides: Partial<NormalizedImageAsset> = {}): NormalizedImageAsset {
  return {
    assetId: `asset-${Math.random().toString(36).slice(2, 8)}`,
    originalFilename: "whatsapp-screenshot.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 400_000,
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

import { createResponseStructured } from "@/lib/openai";

function mockModel(inputType: string, confidence = 0.4) {
  vi.mocked(createResponseStructured).mockResolvedValueOnce({
    text: "{}",
    parsed: { inputType, confidence, rationale: "test", needsDeepExtraction: false, safePreviewAlready: false },
    model: "gpt-5-mini",
  });
}

describe("processImageIntake", () => {
  beforeEach(() => {
    purgePreflightCache(SESSION_ID);
    vi.clearAllMocks();
  });

  it("returns a complete response for a valid image without client context", async () => {
    mockModel("mixed_or_uncertain_image", 0.3);
    const result = await processImageIntake(makeRequest(), null);

    expect(result.response.intakeId).toBeTruthy();
    expect(result.response.laneDecision.lane).toBe("image_intake");
    expect(result.response.preflight.eligible).toBe(true);
    expect(result.response.clientBinding.state).toBe("insufficient_binding");
    expect(result.previewPayload.writeReady).toBe(false);
    expect(result.response.trace.intakeId).toBe(result.response.intakeId);
  });

  it("uses session locked client for binding", async () => {
    const session = getOrCreateSession(SESSION_ID, TENANT, USER);
    lockAssistantClient(session, CLIENT_ID);
    mockModel("screenshot_client_communication", 0.85);

    const result = await processImageIntake(makeRequest(), session);

    expect(result.response.clientBinding.state).toBe("bound_client_confident");
    expect(result.response.clientBinding.clientId).toBe(CLIENT_ID);
    expect(result.response.clientBinding.source).toBe("session_context");
  });

  it("uses request activeClientId when session has no lock", async () => {
    mockModel("mixed_or_uncertain_image", 0.3);
    const result = await processImageIntake(
      makeRequest({ activeClientId: CLIENT_ID }),
      null,
    );

    expect(result.response.clientBinding.state).toBe("bound_client_confident");
    expect(result.response.clientBinding.clientId).toBe(CLIENT_ID);
    expect(result.response.clientBinding.source).toBe("ui_context");
  });

  it("returns no_action for unsupported MIME", async () => {
    const result = await processImageIntake(
      makeRequest({ assets: [makeAsset({ mimeType: "application/pdf" })] }),
      null,
    );

    expect(result.response.preflight.eligible).toBe(false);
    expect(result.response.classification).toBeNull();
    expect(result.response.actionPlan.outputMode).toBe("no_action_archive_only");
  });

  it("returns ambiguous output mode when classifier is uncertain or no client", async () => {
    mockModel("mixed_or_uncertain_image", 0.3);
    // Use neutral filename (no hint) to ensure model layer runs and returns uncertain
    const result = await processImageIntake(
      makeRequest({ assets: [makeAsset({ originalFilename: "neutral_attach.jpg" })] }),
      null,
    );

    expect(result.response.classification?.inputType).toBe("mixed_or_uncertain_image");
    expect(result.response.actionPlan.outputMode).toBe("ambiguous_needs_input");
  });

  it("trace contains all required fields", async () => {
    mockModel("supporting_reference_image", 0.5);
    const result = await processImageIntake(
      makeRequest({ assets: [makeAsset({ originalFilename: "neutral_attach.jpg" })] }),
      null,
    );
    const trace = result.response.trace;

    expect(trace.intakeId).toBeTruthy();
    expect(trace.sessionId).toBe(SESSION_ID);
    expect(trace.assetIds.length).toBe(1);
    expect(trace.laneDecision).toBe("image_intake");
    expect(trace.durationMs).toBeGreaterThanOrEqual(0);
    expect(trace.timestamp).toBeInstanceOf(Date);
  });

  it("no actions for ambiguous / no client", async () => {
    mockModel("mixed_or_uncertain_image", 0.25);
    const result = await processImageIntake(
      makeRequest({ assets: [makeAsset({ originalFilename: "neutral_attach.jpg" })] }),
      null,
    );
    expect(result.executionPlan).toBeNull();
  });
});

describe("mapToExecutionPlan", () => {
  it("maps action candidates to canonical execution plan", () => {
    const plan = emptyActionPlan("client_message_update");
    plan.recommendedActions = [
      {
        intentType: "create_task",
        writeAction: "createTask",
        label: "Vytvořit úkol z fotky",
        reason: "test",
        confidence: 0.9,
        requiresConfirmation: true,
        params: { title: "Follow up" },
      },
    ];

    const executionPlan = mapToExecutionPlan("img_test123", plan, CLIENT_ID, null);

    expect(executionPlan.planId).toBe("img_test123");
    expect(executionPlan.steps.length).toBe(1);
    expect(executionPlan.steps[0].action).toBe("createTask");
    expect(executionPlan.steps[0].requiresConfirmation).toBe(true);
    expect(executionPlan.steps[0].params.contactId).toBe(CLIENT_ID);
    expect(executionPlan.steps[0].params._imageIntakeSource).toBe("img_test123");
    expect(executionPlan.status).toBe("awaiting_confirmation");
    expect(executionPlan.contactId).toBe(CLIENT_ID);
  });

  it("returns completed plan when no actions", () => {
    const plan = emptyActionPlan("no_action_archive_only");
    const executionPlan = mapToExecutionPlan("img_empty", plan, null, null);
    expect(executionPlan.steps.length).toBe(0);
    expect(executionPlan.status).toBe("completed");
  });
});

describe("mapToPreviewItems", () => {
  it("produces StepPreviewItem[] compatible with existing UI", () => {
    const plan = mapToExecutionPlan(
      "img_preview",
      {
        ...emptyActionPlan("client_message_update"),
        recommendedActions: [
          {
            intentType: "create_internal_note",
            writeAction: "createInternalNote",
            label: "Interní poznámka",
            reason: "test",
            confidence: 0.9,
            requiresConfirmation: true,
            params: {},
          },
        ],
      },
      CLIENT_ID,
      null,
    );

    const items = mapToPreviewItems(plan);

    expect(items.length).toBe(1);
    expect(items[0].stepId).toBeTruthy();
    expect(items[0].label).toBe("Interní poznámka");
    expect(items[0].preflightStatus).toBe("ready");
  });
});

describe("buildImageIntakePreview", () => {
  it("marks writeReady=false without confident binding", () => {
    const classification: InputClassificationResult = {
      inputType: "screenshot_client_communication",
      subtype: null,
      confidence: 0.9,
      containsText: true,
      likelyMessageThread: true,
      likelyDocument: false,
      likelyPayment: false,
      likelyFinancialInfo: false,
      uncertaintyFlags: [],
    };
    const clientBinding: ClientBindingResult = {
      state: "insufficient_binding",
      clientId: null,
      clientLabel: null,
      confidence: 0,
      candidates: [],
      source: "none",
      warnings: ["Klient nebyl identifikován."],
    };
    const caseBinding: CaseBindingResult = {
      state: "insufficient_binding",
      caseId: null,
      caseLabel: null,
      confidence: 0,
      candidates: [],
      source: "none",
    };
    const plan = emptyActionPlan("ambiguous_needs_input");

    const preview = buildImageIntakePreview(
      "img_prev",
      classification,
      clientBinding,
      caseBinding,
      emptyFactBundle(),
      plan,
    );

    expect(preview.writeReady).toBe(false);
    expect(preview.outputMode).toBe("ambiguous_needs_input");
    expect(preview.warnings).toContain("Klient nebyl identifikován.");
  });
});
