/**
 * Image Intake Phase 1: orchestrator integration tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditAction: vi.fn() }));
vi.mock("@/lib/openai", () => ({ createResponseStructured: vi.fn(), createResponseSafe: vi.fn(), createResponseStructuredWithImage: vi.fn(), logOpenAICall: vi.fn() }));
vi.mock("../assistant-contact-search", () => ({ searchContactsForAssistant: vi.fn(async () => []) }));
vi.mock("db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ firstName: "Bohuslav", lastName: "Plachý" }]),
          orderBy: vi.fn(() => ({ limit: vi.fn(async () => []) })),
        })),
      })),
    })),
  },
  contacts: { firstName: "firstName", lastName: "lastName", tenantId: "tenantId", id: "id" },
  opportunities: { id: "id", tenantId: "tenantId", contactId: "contactId", title: "title", archivedAt: "archivedAt", updatedAt: "updatedAt" },
  contractUploadReviews: {
    id: "id",
    tenantId: "tenantId",
    fileName: "fileName",
    storagePath: "storagePath",
    mimeType: "mimeType",
    sizeBytes: "sizeBytes",
    processingStatus: "processingStatus",
    processingStage: "processingStage",
    errorMessage: "errorMessage",
    extractedPayload: "extractedPayload",
    clientMatchCandidates: "clientMatchCandidates",
    draftActions: "draftActions",
    confidence: "confidence",
    reasonsForReview: "reasonsForReview",
    reviewStatus: "reviewStatus",
    detectedDocumentType: "detectedDocumentType",
    detectedDocumentSubtype: "detectedDocumentSubtype",
    lifecycleStatus: "lifecycleStatus",
    documentIntent: "documentIntent",
    sensitivityProfile: "sensitivityProfile",
    uploadedBy: "uploadedBy",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  contractReviewCorrections: {
    reviewId: "reviewId",
    fieldKey: "fieldKey",
    correctedValue: "correctedValue",
    createdBy: "createdBy",
    createdAt: "createdAt",
  },
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn(),
  desc: vi.fn(),
}));
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

  it("keeps active client binding when message asks to fill personalId field", async () => {
    mockModel("mixed_or_uncertain_image", 0.3);
    const result = await processImageIntake(
      makeRequest({
        activeClientId: CLIENT_ID,
        accompanyingText: "doplň klientovi rodné číslo",
      }),
      null,
    );

    expect(result.response.clientBinding.state).toBe("bound_client_confident");
    expect(result.response.clientBinding.clientId).toBe(CLIENT_ID);
    expect(result.response.clientBinding.source).toBe("ui_context");
    expect(result.response.clientBinding.clientLabel).toBe("Bohuslav Plachý");
  });

  it("keeps preview-only mode for implicit field extraction without explicit CRM target", async () => {
    mockModel("photo_or_scan_document", 0.82);
    const result = await processImageIntake(
      makeRequest({
        activeClientId: CLIENT_ID,
        accompanyingText: "doplň rodné číslo",
      }),
      null,
    );

    expect(result.response.actionPlan.actionAuthority).toBe("preview_only");
    expect(result.response.actionPlan.recommendedActions).toEqual([]);
    expect(result.response.actionPlan.needsAdvisorInput).toBe(true);
  });

  it("emits explainable decision trace fields", async () => {
    mockModel("photo_or_scan_document", 0.82);
    const result = await processImageIntake(
      makeRequest({
        activeClientId: CLIENT_ID,
        accompanyingText: "ulož to ke klientovi do CRM",
      }),
      null,
    );

    expect(result.response.trace).toMatchObject({
      clientBindingState: expect.any(String),
      outputMode: expect.any(String),
    });
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

  it("keeps communication screenshot in preview-only, not write-ready, when no client is bound", async () => {
    mockModel("mixed_or_uncertain_image", 0.3);
    // Use neutral filename (no hint) to ensure model layer runs and returns uncertain
    const result = await processImageIntake(
      makeRequest({ assets: [makeAsset({ originalFilename: "neutral_attach.jpg" })], accompanyingText: null }),
      null,
    );

    expect(result.response.actionPlan.outputMode).toBe("client_message_update");
    expect(result.previewPayload.writeReady).toBe(false);
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

  it("ambiguous / no client keeps safe unlinked note fallback", async () => {
    mockModel("mixed_or_uncertain_image", 0.25);
    const result = await processImageIntake(
      makeRequest({ assets: [makeAsset({ originalFilename: "neutral_attach.jpg" })], accompanyingText: null }),
      null,
    );
    expect(result.executionPlan).not.toBeNull();
    expect(result.response.actionPlan.outputMode).toBe("ambiguous_needs_input");
    expect(result.response.actionPlan.recommendedActions.some((a) => a.writeAction === "createInternalNote")).toBe(true);
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
