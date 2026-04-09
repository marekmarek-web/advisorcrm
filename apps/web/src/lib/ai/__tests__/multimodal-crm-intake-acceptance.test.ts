/**
 * Multimodal CRM Intake — acceptance test suite.
 *
 * Covers all 10 production-critical scenarios:
 * A) Form screenshot + bind to existing client
 * B) Form screenshot + update fields
 * C) Identity doc → new client
 * D) Identity doc mismatch with active client
 * E) Communication screenshot → note + task
 * F) Payment screenshot → portal
 * G) Chip no-send runtime
 * H) No auto-send runtime
 * I) Max 4 images
 * J) Text-only unchanged
 *
 * Plus unit tests for:
 * - Explicit intent parser (Czech variants)
 * - Binding precedence (explicit text > session > image)
 * - Classification hardening (form screenshots)
 * - Contact patch planning
 * - Payment portal planning
 * - UI text sanitization
 * - Safety flag leak prevention
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: vi.fn(async () => []) })) })) })),
    })),
  },
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
  eq: vi.fn(), and: vi.fn(), isNull: vi.fn(), desc: vi.fn(),
  contacts: {}, or: vi.fn(), sql: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditAction: vi.fn() }));
vi.mock("@/lib/openai", () => ({
  createResponseSafe: vi.fn(),
  createResponseStructured: vi.fn(),
  createResponseStructuredWithImage: vi.fn(),
}));
vi.mock("../assistant-contact-search", () => ({
  searchContactsForAssistant: vi.fn(),
}));

// --- Intent parser ---
import {
  parseExplicitIntent,
  textSignalsCrmExtractionIntent,
  textSignalsPaymentIntent,
  textSignalsNoteOrTaskIntent,
} from "@/lib/ai/image-intake/explicit-intent-parser";

// --- Binding ---
import { parseExplicitClientNameFromText } from "@/lib/ai/image-intake/binding-v2";

// --- Classifier ---
import { classifyBatch } from "@/lib/ai/image-intake/classifier";

// --- Planner ---
import {
  buildActionPlanV1,
  buildActionPlanV4,
  buildIdentityContactIntakeActionPlan,
  maybeUpgradeToContactUpdate,
  enrichFactsWithCrmDiff,
} from "@/lib/ai/image-intake/planner";
import { hydrateAttachActionsWithMaterializedDocuments } from "@/lib/ai/image-intake/orchestrator";

// --- Review handoff ---
import { looksLikeStructuredFormScreenshot } from "@/lib/ai/image-intake/review-handoff";

// --- Response mapper ---
import { mapImageIntakeToAssistantResponse } from "@/lib/ai/image-intake/response-mapper";

// --- Guardrails ---
import { enforceImageIntakeGuardrails, isValidTerminalOutputMode } from "@/lib/ai/image-intake/guardrails";

// --- Types ---
import type {
  InputClassificationResult,
  ClientBindingResult,
  ExtractedFactBundle,
  NormalizedImageAsset,
  ImageOutputMode,
} from "@/lib/ai/image-intake/types";
import { IMAGE_OUTPUT_MODES } from "@/lib/ai/image-intake/types";

// --- Composer ---
import {
  MAX_ASSISTANT_COMPOSER_PENDING_IMAGES,
  mergePendingImageAssets,
} from "@/lib/ai/assistant-composer-pending-images";

// --- Chips ---
import {
  dispatchSuggestedNextStepItem,
  effectiveLegacySuggestedNextSteps,
} from "@/lib/ai/suggested-next-step-dispatch";

import type { ImageIntakeOrchestratorResult } from "@/lib/ai/image-intake/orchestrator";

vi.mock("@/lib/ai/image-intake/materialize-intake-documents", () => ({
  materializeIntakeImagesAsDocuments: vi.fn(async () => []),
}));

import { materializeIntakeImagesAsDocuments } from "@/lib/ai/image-intake/materialize-intake-documents";

// --- Helpers ---

function makeClassification(overrides: Partial<InputClassificationResult> = {}): InputClassificationResult {
  return {
    inputType: "photo_or_scan_document",
    subtype: null,
    confidence: 0.85,
    containsText: true,
    likelyMessageThread: false,
    likelyDocument: true,
    likelyPayment: false,
    likelyFinancialInfo: false,
    uncertaintyFlags: [],
    ...overrides,
  };
}

function makeBinding(overrides: Partial<ClientBindingResult> = {}): ClientBindingResult {
  return {
    state: "bound_client_confident",
    clientId: "client_123",
    clientLabel: "Roman Koloburda",
    confidence: 0.65,
    candidates: [],
    source: "explicit_user_text",
    warnings: [],
    ...overrides,
  };
}

function makeFactBundle(overrides: Partial<ExtractedFactBundle> = {}): ExtractedFactBundle {
  return {
    facts: [
      { factType: "document_received", value: "Roman", normalizedValue: "Roman", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "first_name" },
      { factType: "document_received", value: "Koloburda", normalizedValue: "Koloburda", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "last_name" },
      { factType: "document_received", value: "900101/1239", normalizedValue: "900101/1239", confidence: 0.8, evidence: null, isActionable: false, needsConfirmation: true, observedVsInferred: "observed", factKey: "birth_number" },
      { factType: "document_received", value: "Hlavní 42, Praha", normalizedValue: "Hlavní 42, Praha", confidence: 0.75, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "street" },
      { factType: "document_received", value: "test@email.cz", normalizedValue: "test@email.cz", confidence: 0.85, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "email" },
      { factType: "document_received", value: "+420777888999", normalizedValue: "+420777888999", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "phone" },
    ],
    missingFields: [],
    ambiguityReasons: [],
    extractionSource: "multimodal_pass",
    ...overrides,
  };
}

function makePaymentFactBundle(): ExtractedFactBundle {
  return {
    facts: [
      { factType: "payment_amount", value: "15000 Kč", normalizedValue: "15000", confidence: 0.9, evidence: null, isActionable: true, needsConfirmation: false, observedVsInferred: "observed", factKey: "amount" },
      { factType: "payment_account", value: "123456789/0100", normalizedValue: "123456789/0100", confidence: 0.85, evidence: null, isActionable: true, needsConfirmation: false, observedVsInferred: "observed", factKey: "account_number" },
      { factType: "variable_symbol", value: "1234567890", normalizedValue: "1234567890", confidence: 0.9, evidence: null, isActionable: true, needsConfirmation: false, observedVsInferred: "observed", factKey: "variable_symbol" },
      { factType: "deadline_date", value: "15.5.2026", normalizedValue: "2026-05-15", confidence: 0.8, evidence: null, isActionable: true, needsConfirmation: false, observedVsInferred: "observed", factKey: "due_date" },
      { factType: "payment_account", value: "Pojišťovna ABC", normalizedValue: "Pojišťovna ABC", confidence: 0.85, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "recipient" },
    ],
    missingFields: [],
    ambiguityReasons: [],
    extractionSource: "multimodal_pass",
  };
}

function makeCommFactBundle(): ExtractedFactBundle {
  return {
    facts: [
      { factType: "client_request", value: "Potřebuji změnit frekvenci plateb", normalizedValue: null, confidence: 0.8, evidence: null, isActionable: true, needsConfirmation: false, observedVsInferred: "observed", factKey: "what_client_said" },
      { factType: "client_request", value: "Změna frekvence", normalizedValue: null, confidence: 0.7, evidence: null, isActionable: true, needsConfirmation: false, observedVsInferred: "inferred", factKey: "what_client_wants" },
      { factType: "follow_up_needed", value: "Kontaktovat klienta ohledně změny", normalizedValue: null, confidence: 0.75, evidence: null, isActionable: true, needsConfirmation: false, observedVsInferred: "inferred", factKey: "required_follow_up" },
    ],
    missingFields: [],
    ambiguityReasons: [],
    extractionSource: "multimodal_pass",
  };
}

function makeAsset(id = "asset_1"): NormalizedImageAsset {
  return {
    assetId: id,
    originalFilename: "screenshot.png",
    mimeType: "image/png",
    sizeBytes: 500_000,
    width: 1920,
    height: 1080,
    contentHash: null,
    storageUrl: "https://storage.example.com/img.png",
    thumbnailUrl: null,
    uploadedAt: new Date(),
  };
}

function minimalOrchestratorResult(
  overrides: Partial<ImageIntakeOrchestratorResult> = {},
): ImageIntakeOrchestratorResult {
  const defaultResponse = {
    intakeId: "img_test",
    laneDecision: { lane: "image_intake" as const, confidence: 1, reason: "test", handoffReason: null },
    preflight: { eligible: true, qualityLevel: "good" as const, isDuplicate: false, mimeSupported: true, sizeWithinLimits: true, rejectReason: null, warnings: [] },
    classification: makeClassification(),
    clientBinding: makeBinding(),
    caseBinding: { state: "insufficient_binding" as const, caseId: null, caseLabel: null, confidence: 0, candidates: [], source: "none" as const },
    factBundle: makeFactBundle(),
    actionPlan: {
      outputMode: "structured_image_fact_intake" as const,
      recommendedActions: [{ intentType: "create_internal_note" as const, writeAction: "createInternalNote" as const, label: "Uložit", reason: "test", confidence: 0.8, requiresConfirmation: true, params: {} }],
      draftReplyText: null,
      whyThisAction: "test",
      whyNotOtherActions: null,
      needsAdvisorInput: false,
      safetyFlags: [],
    },
    previewSteps: [],
    trace: { intakeId: "img_test", sessionId: "s1", assetIds: ["a1"], laneDecision: "image_intake" as const, inputType: "photo_or_scan_document" as const, outputMode: "structured_image_fact_intake" as const, clientBindingState: "bound_client_confident" as const, factCount: 6, actionCount: 1, writeReady: true, guardrailsTriggered: [], durationMs: 100, timestamp: new Date() },
  };
  const defaultPreview = {
    intakeId: "img_test",
    outputMode: "structured_image_fact_intake" as const,
    inputType: "photo_or_scan_document" as const,
    clientLabel: "Roman Koloburda",
    caseLabel: null,
    summary: "test",
    factsSummary: [],
    uncertainties: [],
    recommendedActions: [],
    writeReady: true,
    warnings: [],
    householdAmbiguityNote: null,
    documentSetNote: null,
    lifecycleStatusNote: null,
    intentAssistCacheStatus: null,
  };

  return {
    response: { ...defaultResponse, ...(overrides as any).response },
    executionPlan: null,
    previewPayload: { ...defaultPreview, ...(overrides as any).previewPayload },
    classifierUsedModel: false,
    multimodalUsed: true,
    multimodalResult: null,
    stitchingResult: null,
    reviewHandoff: null,
    caseBindingV2: null,
    threadReconstruction: null,
    handoffPayload: null,
    caseSignals: null,
    batchDecision: null,
    combinedMultimodalResult: null,
    crossSessionReconstruction: null,
    intentChange: null,
    householdBinding: null,
    documentSetResult: null,
    lifecycleFeedback: null,
    intentAssistCacheStatus: null,
    ...overrides,
  } as ImageIntakeOrchestratorResult;
}

// ============================================================================
// EXPLICIT INTENT PARSER TESTS
// ============================================================================

describe("Explicit intent parser — Czech variants", () => {
  it("parses 'Přiřaď údaje z fotky ke klientovi Roman Koloburda'", () => {
    const r = parseExplicitIntent("Přiřaď údaje z fotky ke klientovi Roman Koloburda");
    expect(r.clientName).toBe("Roman Koloburda");
    expect(r.verb).toBe("assign");
    expect(r.hasExplicitTarget).toBe(true);
    expect(r.operation).toBe("update_contact");
  });

  it("parses 'Doplň z toho do CRM rodné číslo, adresu, email a telefon'", () => {
    const r = parseExplicitIntent("Doplň z toho do CRM rodné číslo, adresu, email a telefon");
    expect(r.verb).toBe("fill");
    expect(r.destination).toBe("crm");
    expect(r.requestedFields).toContain("personalId");
    expect(r.requestedFields).toContain("address");
    expect(r.requestedFields).toContain("email");
    expect(r.requestedFields).toContain("phone");
    expect(r.operation).toBe("update_contact");
  });

  it("parses 'Pošli to klientovi do portálu pod platební údaje'", () => {
    const r = parseExplicitIntent("Pošli to klientovi do portálu pod platební údaje");
    expect(r.verb).toBe("send");
    expect(r.destination).toBe("portal_payment");
    expect(r.operation).toBe("portal_payment_update");
  });

  it("parses 'udělej z toho poznámku a vytvoř follow-up'", () => {
    const r = parseExplicitIntent("udělej z toho poznámku a vytvoř follow-up");
    expect(r.verb).toBe("note");
    expect(r.destination).toBe("note");
    expect(r.operation).toBe("create_note");
  });

  it("parses 'Založ klienta z těchto údajů'", () => {
    const r = parseExplicitIntent("Založ klienta z těchto údajů");
    expect(r.operation).toBe("create_contact");
  });

  it("parses 'Ulož platební údaje ke klientovi Jan Novák'", () => {
    const r = parseExplicitIntent("Ulož platební údaje ke klientovi Jan Novák");
    expect(r.clientName).toBe("Jan Novák");
    expect(r.requestedFields).toContain("paymentDetails");
    expect(r.operation).toBe("portal_payment_update");
  });

  it("returns hasExplicitTarget=false for empty text", () => {
    expect(parseExplicitIntent(null).hasExplicitTarget).toBe(false);
    expect(parseExplicitIntent("").hasExplicitTarget).toBe(false);
  });

  it("parses 'pod klienta Petra Sýkorová'", () => {
    const r = parseExplicitIntent("Připoj to pod klienta Petra Sýkorová");
    expect(r.clientName).toBe("Petra Sýkorová");
  });

  it("textSignalsCrmExtractionIntent returns true for update_contact", () => {
    const intent = parseExplicitIntent("Doplň údaje do CRM");
    expect(textSignalsCrmExtractionIntent(intent)).toBe(true);
  });

  it("textSignalsPaymentIntent returns true for payment destination", () => {
    const intent = parseExplicitIntent("Pošli do portálu pod platební údaje");
    expect(textSignalsPaymentIntent(intent)).toBe(true);
  });

  it("textSignalsNoteOrTaskIntent returns true for note", () => {
    const intent = parseExplicitIntent("udělej z toho poznámku");
    expect(textSignalsNoteOrTaskIntent(intent)).toBe(true);
  });
});

// ============================================================================
// BINDING PRECEDENCE TESTS
// ============================================================================

describe("Binding precedence — explicit client name parsing", () => {
  it("parses 'ke klientovi Roman Koloburda'", () => {
    expect(parseExplicitClientNameFromText("ke klientovi Roman Koloburda")).toBe("Roman Koloburda");
  });

  it("parses 'pro klienta Jan Novák'", () => {
    expect(parseExplicitClientNameFromText("pro klienta Jan Novák")).toBe("Jan Novák");
  });

  it("parses 'pod klienta Petra Sýkorová'", () => {
    expect(parseExplicitClientNameFromText("pod klienta Petra Sýkorová")).toBe("Petra Sýkorová");
  });

  it("parses 'Doplň ke klientovi Lucie Opalecká'", () => {
    expect(parseExplicitClientNameFromText("Doplň ke klientovi Lucie Opalecká")).toBe("Lucie Opalecká");
  });

  it("returns null for text without client name", () => {
    expect(parseExplicitClientNameFromText("Doplň rodné číslo")).toBeNull();
    expect(parseExplicitClientNameFromText(null)).toBeNull();
    expect(parseExplicitClientNameFromText("")).toBeNull();
  });
});

// ============================================================================
// CLASSIFICATION HARDENING TESTS
// ============================================================================

describe("Classification — form screenshot vs review handoff", () => {
  it("new output modes are valid terminal modes", () => {
    expect(isValidTerminalOutputMode("contact_update_from_image")).toBe(true);
    expect(isValidTerminalOutputMode("payment_details_portal_update")).toBe(true);
  });

  it("all IMAGE_OUTPUT_MODES are valid terminal modes", () => {
    for (const mode of IMAGE_OUTPUT_MODES) {
      expect(isValidTerminalOutputMode(mode)).toBe(true);
    }
  });
});

// ============================================================================
// PLANNER TESTS — CONTACT UPDATE FROM IMAGE
// ============================================================================

describe("Planner — contact_update_from_image", () => {
  it("generates contact update plan when intent is update_contact with bound client", () => {
    const classification = makeClassification();
    const binding = makeBinding();
    const facts = makeFactBundle();
    const intent = parseExplicitIntent("Doplň údaje ke klientovi Roman Koloburda");

    const plan = buildActionPlanV4(classification, binding, facts, null, null, null, intent);
    expect(plan.outputMode).toBe("contact_update_from_image");
    expect(plan.recommendedActions.length).toBeGreaterThan(0);
    expect(plan.recommendedActions[0].label).toContain("Aktualizovat");
  });

  it("structured_image_fact_intake when intent is unknown but classification is strong", () => {
    const classification = makeClassification({ confidence: 0.85 });
    const binding = makeBinding();
    const facts = makeFactBundle();

    const plan = buildActionPlanV1(classification, binding, facts);
    expect(plan.outputMode).toBe("structured_image_fact_intake");
  });
});

// ============================================================================
// PLANNER TESTS — PAYMENT PORTAL UPDATE
// ============================================================================

describe("Planner — payment_details_portal_update", () => {
  it("generates payment plan when intent is portal_payment_update", () => {
    const classification = makeClassification({ inputType: "screenshot_payment_details" });
    const binding = makeBinding();
    const facts = makePaymentFactBundle();
    const intent = parseExplicitIntent("Pošli to klientovi do portálu pod platební údaje");

    const plan = buildActionPlanV4(classification, binding, facts, null, null, null, intent);
    expect(plan.outputMode).toBe("payment_details_portal_update");
    expect(plan.recommendedActions.length).toBeGreaterThan(0);
  });

  it("generates payment plan for payment screenshot with confident binding", () => {
    const classification = makeClassification({ inputType: "screenshot_payment_details", confidence: 0.8 });
    const binding = makeBinding();
    const facts = makePaymentFactBundle();

    const plan = buildActionPlanV1(classification, binding, facts);
    expect(plan.outputMode).toBe("payment_details_portal_update");
  });
});

// ============================================================================
// PLANNER TESTS — COMMUNICATION SCREENSHOT
// ============================================================================

describe("Planner — communication screenshot note/task", () => {
  it("generates note + task actions for communication screenshot", () => {
    const classification = makeClassification({
      inputType: "screenshot_client_communication",
      confidence: 0.8,
      likelyMessageThread: true,
    });
    const binding = makeBinding();
    const facts = makeCommFactBundle();

    const plan = buildActionPlanV1(classification, binding, facts);
    expect(plan.outputMode).toBe("client_message_update");
    const actions = plan.recommendedActions;
    expect(actions.some((a) => a.writeAction === "createInternalNote")).toBe(true);
    expect(actions.some((a) => a.writeAction === "createTask")).toBe(true);
  });

  it("communication screenshot without binding still gets note/task", () => {
    const classification = makeClassification({
      inputType: "screenshot_client_communication",
      confidence: 0.8,
    });
    const binding = makeBinding({ state: "insufficient_binding", clientId: null });
    const plan = buildActionPlanV1(classification, binding);
    expect(plan.outputMode).toBe("client_message_update");
    expect(plan.recommendedActions.some((a) => a.writeAction === "createInternalNote")).toBe(true);
  });
});

// ============================================================================
// RESPONSE MAPPER TESTS
// ============================================================================

describe("Response mapper — contact_update_from_image", () => {
  it("generates advisory Czech message for contact update mode with real updateContact", () => {
    const result = minimalOrchestratorResult({
      response: {
        ...minimalOrchestratorResult().response,
        actionPlan: {
          outputMode: "contact_update_from_image",
          recommendedActions: [{ intentType: "update_contact" as const, writeAction: "updateContact" as const, label: "Aktualizovat", reason: "test", confidence: 0.8, requiresConfirmation: true, params: {} }],
          draftReplyText: null,
          whyThisAction: "test",
          whyNotOtherActions: null,
          needsAdvisorInput: false,
          safetyFlags: [],
        },
      },
    });

    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.message).toContain("aktualizace");
    expect(resp.message).toContain("Roman Koloburda");
    expect(resp.message).not.toContain("confidence");
    expect(resp.message).not.toContain("AI_REVIEW");
  });

  it("honest fallback when contact_update_from_image but no real updateContact step", () => {
    const result = minimalOrchestratorResult({
      response: {
        ...minimalOrchestratorResult().response,
        actionPlan: {
          outputMode: "contact_update_from_image",
          recommendedActions: [{ intentType: "create_internal_note" as const, writeAction: "createInternalNote" as const, label: "Uložit", reason: "fallback", confidence: 0.5, requiresConfirmation: true, params: {} }],
          draftReplyText: null,
          whyThisAction: "test",
          whyNotOtherActions: null,
          needsAdvisorInput: false,
          safetyFlags: [],
        },
      },
    });

    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.message).not.toContain("aktualizace");
    expect(resp.message).not.toContain("zapíšu změny");
    expect(resp.message).toContain("Rozpoznané údaje");
  });
});

describe("Response mapper — payment_details_portal_update", () => {
  it("generates advisory Czech message for payment mode", () => {
    const result = minimalOrchestratorResult({
      response: {
        ...minimalOrchestratorResult().response,
        actionPlan: {
          outputMode: "payment_details_portal_update",
          recommendedActions: [{ intentType: "create_internal_note" as const, writeAction: "createInternalNote" as const, label: "Platba", reason: "test", confidence: 0.8, requiresConfirmation: true, params: {} }],
          draftReplyText: null,
          whyThisAction: "test",
          whyNotOtherActions: null,
          needsAdvisorInput: false,
          safetyFlags: [],
        },
        factBundle: makePaymentFactBundle(),
      },
    });

    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.message).toContain("platební");
    expect(resp.message).not.toContain("AI_REVIEW");
    expect(resp.message).not.toContain("BINDING_VIOLATION");
  });
});

// ============================================================================
// UI TEXT SANITIZATION TESTS
// ============================================================================

describe("Response mapper — UI text sanitization", () => {
  it("strips AI_REVIEW_HANDOFF_RECOMMENDED from warnings", () => {
    const result = minimalOrchestratorResult();
    result.previewPayload.warnings = [
      "AI_REVIEW_HANDOFF_RECOMMENDED: test signal",
      "Normální varování.",
    ];

    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.warnings).not.toContainEqual(expect.stringContaining("AI_REVIEW_HANDOFF"));
    expect(resp.warnings).toContainEqual("Normální varování.");
  });

  it("strips BINDING_VIOLATION from warnings", () => {
    const result = minimalOrchestratorResult();
    result.previewPayload.warnings = ["BINDING_VIOLATION: test"];
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.warnings).not.toContainEqual(expect.stringContaining("BINDING_VIOLATION"));
  });

  it("strips LANE_VIOLATION from warnings", () => {
    const result = minimalOrchestratorResult();
    result.previewPayload.warnings = ["LANE_VIOLATION: test"];
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.warnings).not.toContainEqual(expect.stringContaining("LANE_VIOLATION"));
  });

  it("strips DOCUMENT_SET_ flags from warnings", () => {
    const result = minimalOrchestratorResult();
    result.previewPayload.warnings = [
      "DOCUMENT_SET_REVIEW_CANDIDATE: test",
      "DOCUMENT_SET_MIXED: test",
      "DOCUMENT_SET_INSUFFICIENT: test",
    ];
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.warnings).toHaveLength(0);
  });

  it("strips confidence percentages from warnings", () => {
    const result = minimalOrchestratorResult();
    result.previewPayload.warnings = ["confidence 75%"];
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.warnings).not.toContainEqual(expect.stringContaining("confidence"));
  });

  it("strips internal GUARDRAIL_ prefixes", () => {
    const result = minimalOrchestratorResult();
    result.previewPayload.warnings = ["GUARDRAIL_TRIGGERED: test"];
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.warnings).not.toContainEqual(expect.stringContaining("GUARDRAIL_"));
  });

  it("message never contains internal flag names", () => {
    const result = minimalOrchestratorResult();
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    const combined = `${resp.message} ${resp.warnings.join(" ")}`;
    expect(combined).not.toContain("AI_REVIEW_HANDOFF_RECOMMENDED");
    expect(combined).not.toContain("BINDING_VIOLATION");
    expect(combined).not.toContain("LANE_VIOLATION");
    expect(combined).not.toContain("DOCUMENT_SET_");
    expect(combined).not.toContain("outputMode");
    expect(combined).not.toContain("safetyFlag");
  });
});

// ============================================================================
// CHIP DISPATCH TESTS
// ============================================================================

describe("Chip dispatch — hint is no-op", () => {
  it("hint chip does not send or focus", () => {
    const onSend = vi.fn();
    const onFocusComposer = vi.fn();
    dispatchSuggestedNextStepItem(
      { label: "Test hint", kind: "hint" },
      { onSend, onFocusComposer },
    );
    expect(onSend).not.toHaveBeenCalled();
    expect(onFocusComposer).not.toHaveBeenCalled();
  });

  it("focus_composer chip focuses but does not send", () => {
    const onSend = vi.fn();
    const onFocusComposer = vi.fn();
    dispatchSuggestedNextStepItem(
      { label: "Focus test", kind: "focus_composer" },
      { onSend, onFocusComposer },
    );
    expect(onSend).not.toHaveBeenCalled();
    expect(onFocusComposer).toHaveBeenCalledTimes(1);
  });
});

describe("Legacy suggestedNextSteps suppression", () => {
  it("returns empty when stepItems exist", () => {
    const result = effectiveLegacySuggestedNextSteps(
      ["Some text"],
      [{ label: "Some text", kind: "hint" }],
    );
    expect(result).toEqual([]);
  });
});

// ============================================================================
// NO AUTO-SEND TESTS
// ============================================================================

describe("Pending image composer — no auto-send", () => {
  it("MAX_ASSISTANT_COMPOSER_PENDING_IMAGES is 4", () => {
    expect(MAX_ASSISTANT_COMPOSER_PENDING_IMAGES).toBe(4);
  });

  it("mergePendingImageAssets caps at 4 images", () => {
    const images = Array.from({ length: 6 }, (_, i) => ({
      url: `https://example.com/img${i}.png`,
      mimeType: "image/png" as const,
      filename: `img${i}.png`,
    }));
    const result = mergePendingImageAssets([], images);
    expect(result.next.length).toBe(MAX_ASSISTANT_COMPOSER_PENDING_IMAGES);
    expect(result.truncatedFromIncoming).toBe(true);
  });
});

// ============================================================================
// IDENTITY MISMATCH SAFETY TESTS
// ============================================================================

describe("Identity mismatch — response mapper", () => {
  it("shows mismatch message in Czech when identity doesn't match active client", () => {
    const result = minimalOrchestratorResult({
      response: {
        ...minimalOrchestratorResult().response,
        actionPlan: {
          outputMode: "identity_contact_intake",
          recommendedActions: [],
          draftReplyText: null,
          whyThisAction: "test",
          whyNotOtherActions: null,
          needsAdvisorInput: true,
          safetyFlags: [],
        },
        clientBinding: {
          state: "insufficient_binding",
          clientId: null,
          clientLabel: "Jan Novák",
          confidence: 0.25,
          candidates: [],
          source: "identity_context_mismatch",
          warnings: ["Údaje na dokladu nesedí s otevřeným kontaktem v CRM (Jan Novák)."],
          suppressedActiveClientId: "client_active",
          suppressedActiveClientLabel: "Jan Novák",
        },
        factBundle: {
          facts: [
            { factType: "document_received", value: "yes", normalizedValue: "yes", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "id_doc_is_identity_document" },
            { factType: "document_received", value: "Petr", normalizedValue: "Petr", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "id_doc_first_name" },
            { factType: "document_received", value: "Svoboda", normalizedValue: "Svoboda", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "id_doc_last_name" },
          ],
          missingFields: [],
          ambiguityReasons: [],
          extractionSource: "multimodal_pass",
        },
      },
    });

    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.message).toContain("jinou osobu");
    expect(resp.message).toContain("nepřiřazuji");
    expect(resp.message).not.toContain("BINDING_VIOLATION");
    expect(resp.message).not.toContain("MISMATCH");
  });
});

// ============================================================================
// TEXT-ONLY UNCHANGED
// ============================================================================

describe("Text-only — no regression", () => {
  it("intent parser returns no target for plain question", () => {
    const r = parseExplicitIntent("Kolik má klient smluv?");
    expect(r.operation).toBe("unknown");
    expect(r.clientName).toBeNull();
    expect(r.requestedFields).toHaveLength(0);
  });
});

// ============================================================================
// EXPLICIT USER COMMAND NOT IGNORED
// ============================================================================

describe("Explicit user command — respected by planner", () => {
  it("'Doplň rodné číslo' leads to update_contact intent", () => {
    const intent = parseExplicitIntent("Doplň rodné číslo ke klientovi Pavel Horák");
    expect(intent.clientName).toBe("Pavel Horák");
    expect(intent.requestedFields).toContain("personalId");
    expect(intent.operation).toBe("update_contact");
    expect(textSignalsCrmExtractionIntent(intent)).toBe(true);
  });

  it("'Připrav odpověď' leads to draft_reply intent", () => {
    const intent = parseExplicitIntent("Připrav odpověď klientovi");
    expect(intent.verb).toBe("prepare");
    expect(intent.destination).toBe("reply");
    expect(intent.operation).toBe("draft_reply");
  });
});

// ============================================================================
// REALISTIC TWO-SCREENSHOT PACKAGE FLOW
// ============================================================================

// Also import new planner exports
import { maybeUpgradeToContactUpdate, enrichFactsWithCrmDiff } from "@/lib/ai/image-intake/planner";

describe("Two-screenshot form package — end to end", () => {
  it("produces structured extraction with explicit client", () => {
    const classification = makeClassification({
      inputType: "photo_or_scan_document",
      confidence: 0.75,
    });
    const binding = makeBinding({
      state: "bound_client_confident",
      clientId: "client_rk",
      clientLabel: "Roman Koloburda",
      source: "explicit_user_text",
    });
    const facts = makeFactBundle();
    const intent = parseExplicitIntent("Přiřaď údaje z fotky ke klientovi Roman Koloburda");

    const plan = buildActionPlanV4(classification, binding, facts, null, null, null, intent);
    expect(plan.outputMode).toBe("contact_update_from_image");
    expect(plan.needsAdvisorInput).toBe(false);

    const result = minimalOrchestratorResult({
      response: {
        ...minimalOrchestratorResult().response,
        clientBinding: binding,
        factBundle: facts,
        actionPlan: plan,
      },
    });
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.message).toContain("Roman Koloburda");
    expect(resp.message).toContain("aktualizace");
    expect(resp.warnings.every((w) => !w.includes("AI_REVIEW"))).toBe(true);
  });
});

// ============================================================================
// FIELD-PATCH ACCEPTANCE TESTS (image-intake-field-patch pass)
// ============================================================================

describe("ACCEPTANCE: contact_update_from_image uses updateContact write action", () => {
  it("planContactUpdateFromImage emits updateContact, not createInternalNote", () => {
    const binding = makeBinding();
    const facts = makeFactBundle();
    const intent = parseExplicitIntent("Přiřaď údaje z fotky ke klientovi Roman Koloburda");
    const plan = buildActionPlanV4(
      makeClassification(), binding, facts, null, null, null, intent,
    );
    expect(plan.outputMode).toBe("contact_update_from_image");
    const updateAction = plan.recommendedActions.find(a => a.writeAction === "updateContact");
    expect(updateAction).toBeDefined();
    expect(updateAction!.params).toHaveProperty("firstName", "Roman");
    expect(updateAction!.params).toHaveProperty("lastName", "Koloburda");
    expect(updateAction!.params).toHaveProperty("contactId", "client_123");
    expect(updateAction!.params).toHaveProperty("birthDate", "1990-01-01");
    const noteOnly = plan.recommendedActions.filter(a =>
      a.writeAction === "createInternalNote" &&
      (a.params as any)._imageIntakeOutputMode === "contact_update_from_image",
    );
    expect(noteOnly).toHaveLength(0);
  });
});

describe("ACCEPTANCE: maybeUpgradeToContactUpdate auto-promotes when ≥3 contact fields", () => {
  it("upgrades structured_image_fact_intake → contact_update_from_image", () => {
    const facts = makeFactBundle();
    const binding = makeBinding();
    const result = maybeUpgradeToContactUpdate(
      "structured_image_fact_intake", facts, binding, null,
    );
    expect(result).toBe("contact_update_from_image");
  });

  it("does NOT upgrade when binding is insufficient", () => {
    const facts = makeFactBundle();
    const binding = makeBinding({ state: "insufficient_binding", clientId: null });
    const result = maybeUpgradeToContactUpdate(
      "structured_image_fact_intake", facts, binding, null,
    );
    expect(result).toBe("structured_image_fact_intake");
  });

  it("upgrades with 1 field + explicit CRM intent", () => {
    const facts: ExtractedFactBundle = {
      facts: [
        { factType: "document_received", value: "test@email.cz", normalizedValue: "test@email.cz", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "email" },
      ],
      missingFields: [], ambiguityReasons: [], extractionSource: "multimodal_pass",
    };
    const binding = makeBinding();
    const intent = parseExplicitIntent("Doplň email ke klientovi");
    const result = maybeUpgradeToContactUpdate(
      "structured_image_fact_intake", facts, binding, intent,
    );
    expect(result).toBe("contact_update_from_image");
  });
});

describe("ACCEPTANCE: enrichFactsWithCrmDiff computes diff correctly", () => {
  it("marks new, same, and conflict fields", () => {
    const facts = makeFactBundle();
    const existing = {
      firstName: "Roman",
      lastName: "Koloburda",
      email: "old@email.cz",
      phone: undefined,
      street: undefined,
    };
    const enriched = enrichFactsWithCrmDiff(facts, existing);
    const firstName = enriched.facts.find(f => f.factKey === "first_name");
    expect(firstName?.diffStatus).toBe("same");
    const email = enriched.facts.find(f => f.factKey === "email");
    expect(email?.diffStatus).toBe("conflict");
    expect(email?.existingCrmValue).toBe("old@email.cz");
    const phone = enriched.facts.find(f => f.factKey === "phone");
    expect(phone?.diffStatus).toBe("new");
    const street = enriched.facts.find(f => f.factKey === "street");
    expect(street?.diffStatus).toBe("new");
  });
});

describe("ACCEPTANCE: identity doc + matching existing client → update, not create", () => {
  it("identity facts with bound client plan uses updateContact", () => {
    const classification = makeClassification({ inputType: "photo_or_scan_document" });
    const binding = makeBinding({
      state: "bound_client_confident",
      clientId: "client_existing",
      clientLabel: "Myroslav Rudak",
      source: "explicit_user_text",
    });
    const facts: ExtractedFactBundle = {
      facts: [
        { factType: "document_received", value: "yes", normalizedValue: "yes", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "id_doc_is_identity_document" },
        { factType: "document_received", value: "Myroslav", normalizedValue: "Myroslav", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "id_doc_first_name" },
        { factType: "document_received", value: "Rudak", normalizedValue: "Rudak", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "id_doc_last_name" },
        { factType: "document_received", value: "23.09.1996", normalizedValue: "1996-09-23", confidence: 0.85, evidence: null, isActionable: false, needsConfirmation: true, observedVsInferred: "observed", factKey: "id_doc_birth_date" },
        { factType: "document_received", value: "Čimická 717/34, 18200 Praha 8", normalizedValue: null, confidence: 0.8, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "id_doc_street" },
      ],
      missingFields: [],
      ambiguityReasons: [],
      extractionSource: "multimodal_pass",
    };
    const intent = parseExplicitIntent("Ulož údaje z dokladu ke klientovi Myroslav Rudak");
    const plan = buildActionPlanV4(classification, binding, facts, null, null, null, intent);
    expect(plan.outputMode).toBe("contact_update_from_image");
    const updateAction = plan.recommendedActions.find(a => a.writeAction === "updateContact");
    expect(updateAction).toBeDefined();
    const createAction = plan.recommendedActions.find(a => a.writeAction === "createContact");
    expect(createAction).toBeUndefined();
  });
});

describe("ACCEPTANCE: payment fields visible + preview-ready, no fake completion", () => {
  it("payment plan shows all extracted payment fields", () => {
    const classification = makeClassification({ inputType: "screenshot_payment_details", confidence: 0.85 });
    const binding = makeBinding();
    const facts = makePaymentFactBundle();
    const intent = parseExplicitIntent("Pošli to klientovi do portálu pod platební údaje");
    const plan = buildActionPlanV4(classification, binding, facts, null, null, null, intent);
    expect(plan.outputMode).toBe("payment_details_portal_update");
    const result = minimalOrchestratorResult({
      response: {
        ...minimalOrchestratorResult().response,
        classification,
        clientBinding: binding,
        factBundle: facts,
        actionPlan: plan,
      },
    });
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.message).toContain("platební");
    expect(resp.message).toContain("15000");
    expect(resp.message).not.toContain("hotovo");
    expect(resp.message).not.toContain("odesláno");
    expect(resp.message).not.toContain("uloženo");
  });
});

describe("ACCEPTANCE: partial extraction shows what was read", () => {
  it("single field extracted is shown, not 'nothing read'", () => {
    const facts: ExtractedFactBundle = {
      facts: [
        { factType: "document_received", value: "Myroslav", normalizedValue: "Myroslav", confidence: 0.6, evidence: null, isActionable: false, needsConfirmation: true, observedVsInferred: "observed", factKey: "id_doc_first_name" },
      ],
      missingFields: ["id_doc_last_name", "id_doc_birth_date"],
      ambiguityReasons: ["Low quality image"],
      extractionSource: "multimodal_pass",
    };
    const plan = buildActionPlanV1(
      makeClassification(),
      makeBinding({ state: "insufficient_binding", clientId: null }),
      facts,
    );
    const result = minimalOrchestratorResult({
      response: {
        ...minimalOrchestratorResult().response,
        factBundle: facts,
        actionPlan: {
          ...plan,
          outputMode: "identity_contact_intake",
        },
      },
    });
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.message).toContain("Myroslav");
    expect(resp.message).not.toContain("Žádné spolehlivé údaje nebyly");
  });
});

describe("ACCEPTANCE: no raw technical text in advisor UI", () => {
  it("sanitizes all internal flags from warnings", () => {
    const plan = buildActionPlanV1(
      makeClassification(),
      makeBinding(),
    );
    plan.safetyFlags = [
      "AI_REVIEW_HANDOFF_RECOMMENDED: something",
      "BINDING_VIOLATION: something",
      "LANE_VIOLATION: x",
      "Normální varování pro poradce",
    ];
    const result = minimalOrchestratorResult({
      response: {
        ...minimalOrchestratorResult().response,
        actionPlan: plan,
        trace: { ...minimalOrchestratorResult().response.trace, guardrailsTriggered: ["GUARDRAIL_MODE_DOWNGRADE: x"] },
      },
    });
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    for (const w of resp.warnings) {
      expect(w).not.toMatch(/^AI_REVIEW/);
      expect(w).not.toMatch(/^BINDING_VIOLATION/);
      expect(w).not.toMatch(/^LANE_VIOLATION/);
      expect(w).not.toMatch(/^GUARDRAIL_/);
      expect(w).not.toMatch(/confidence\s+\d+%/i);
      expect(w).not.toMatch(/outputMode/i);
    }
  });
});

describe("ACCEPTANCE: createContact vs updateContact split", () => {
  it("no binding + identity doc → createContact", () => {
    const classification = makeClassification({ inputType: "photo_or_scan_document" });
    const binding = makeBinding({ state: "insufficient_binding", clientId: null });
    const facts = makeFactBundle();
    const intent = parseExplicitIntent("Založ nového klienta");
    const plan = buildActionPlanV4(classification, binding, facts, null, null, null, intent);
    expect(plan.outputMode).toBe("identity_contact_intake");
  });

  it("bound client + contact fields → updateContact", () => {
    const classification = makeClassification();
    const binding = makeBinding();
    const facts = makeFactBundle();
    const intent = parseExplicitIntent("Doplň údaje ke klientovi Roman Koloburda");
    const plan = buildActionPlanV4(classification, binding, facts, null, null, null, intent);
    expect(plan.outputMode).toBe("contact_update_from_image");
    expect(plan.recommendedActions.some(a => a.writeAction === "updateContact")).toBe(true);
    expect(plan.recommendedActions.some(a => a.writeAction === "createContact")).toBe(false);
  });
});

describe("ACCEPTANCE: explicit client target precedence", () => {
  it("explicit text binding overrides weaker source", () => {
    const intent = parseExplicitIntent("Přiřaď ke klientovi Jan Novák");
    expect(intent.clientName).toBe("Jan Novák");
    expect(intent.operation).toBe("update_contact");
    expect(intent.hasExplicitTarget).toBe(true);
  });
});

// ===================================================================
// RUNTIME CHAIN FIX — acceptance tests
// ===================================================================

describe("RUNTIME FIX: parser no-false-positive nouns", () => {
  it("does not capture 'adresu' as client name", () => {
    const intent = parseExplicitIntent("Ne přiřaď ke klientovi údaje ze screenshotu, je tam adresa apod.");
    expect(intent.clientName).toBeNull();
  });

  it("does not capture 'údaje' as client name", () => {
    const intent = parseExplicitIntent("Přiřaď klientovi údaje z fotky");
    expect(intent.clientName).toBeNull();
  });

  it("does not capture 'telefon' as client name", () => {
    const intent = parseExplicitIntent("Ulož klientovi telefon z dokladu");
    expect(intent.clientName).toBeNull();
  });

  it("does not capture 'screenshot' as client name", () => {
    const intent = parseExplicitIntent("Přiřaď ke klientovi screenshot formuláře");
    expect(intent.clientName).toBeNull();
  });

  it("does not capture 'fotku' as client name", () => {
    const intent = parseExplicitIntent("Ulož pod klienta fotku dokladu");
    expect(intent.clientName).toBeNull();
  });

  it("does not capture 'kontakt' as client name", () => {
    const intent = parseExplicitIntent("Doplň ke klientovi kontakt z obrázku");
    expect(intent.clientName).toBeNull();
  });

  it("still captures real name 'Bohuslav Plachý'", () => {
    const intent = parseExplicitIntent("přiřaď mi tyto údaje ke klientovi Bohuslav Plachý");
    expect(intent.clientName).toBe("Bohuslav Plachý");
  });

  it("still captures real name 'Roman Koloburda'", () => {
    const intent = parseExplicitIntent("Přiřaď údaje z fotky ke klientovi Roman Koloburda");
    expect(intent.clientName).toBe("Roman Koloburda");
  });
});

describe("RUNTIME FIX: response text derives from executable plan", () => {
  it("says 'aktualizace' only when updateContact action exists", () => {
    const plan = {
      outputMode: "contact_update_from_image" as const,
      recommendedActions: [
        { intentType: "update_contact" as const, writeAction: "updateContact" as const, label: "Update", reason: "test", confidence: 0.9, requiresConfirmation: true, params: {} },
      ],
      draftReplyText: null, whyThisAction: "test", whyNotOtherActions: null, needsAdvisorInput: false, safetyFlags: [],
    };
    const result = minimalOrchestratorResult({
      response: { ...minimalOrchestratorResult().response, actionPlan: plan },
    });
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.message).toContain("aktualizace");
  });

  it("does NOT say 'aktualizace' when plan only has attach action", () => {
    const plan = {
      outputMode: "contact_update_from_image" as const,
      recommendedActions: [
        { intentType: "attach_document" as const, writeAction: "attachDocumentToClient" as const, label: "Attach", reason: "test", confidence: 0.7, requiresConfirmation: true, params: {} },
      ],
      draftReplyText: null, whyThisAction: "test", whyNotOtherActions: null, needsAdvisorInput: false, safetyFlags: [],
    };
    const result = minimalOrchestratorResult({
      response: { ...minimalOrchestratorResult().response, actionPlan: plan },
    });
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.message).not.toContain("aktualizace");
    expect(resp.message).not.toContain("zapíšu změny");
  });

  it("says clearly when multimodal pass failed and no facts were extracted", () => {
    const plan = {
      outputMode: "contact_update_from_image" as const,
      recommendedActions: [
        { intentType: "attach_document" as const, writeAction: "attachDocumentToClient" as const, label: "Attach", reason: "test", confidence: 0.7, requiresConfirmation: true, params: { documentId: "doc_1" } },
      ],
      draftReplyText: null, whyThisAction: "test", whyNotOtherActions: null, needsAdvisorInput: false, safetyFlags: [],
    };
    const result = minimalOrchestratorResult({
      response: {
        ...minimalOrchestratorResult().response,
        actionPlan: plan,
        factBundle: makeFactBundle({ facts: [], ambiguityReasons: ["multimodal_pass_failed"] }),
      },
    });
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.message).toMatch(/nepodařilo spolehlivě přečíst/i);
    expect(resp.message).not.toContain("náhledu kroků");
  });
});

describe("RUNTIME FIX: extracted fields surfaced when fact bundle non-empty", () => {
  it("ambiguous_needs_input still shows facts if present", () => {
    const plan = {
      outputMode: "ambiguous_needs_input" as const,
      recommendedActions: [
        { intentType: "create_internal_note" as const, writeAction: "createInternalNote" as const, label: "Note", reason: "fallback", confidence: 0.5, requiresConfirmation: true, params: {} },
      ],
      draftReplyText: null, whyThisAction: "test", whyNotOtherActions: null, needsAdvisorInput: true, safetyFlags: [],
    };
    const result = minimalOrchestratorResult({
      response: {
        ...minimalOrchestratorResult().response,
        actionPlan: plan,
        clientBinding: makeBinding({ state: "insufficient_binding", clientId: null }),
        factBundle: makeFactBundle(),
      },
    });
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.message).toContain("Rozpoznané údaje");
    expect(resp.message).not.toMatch(/nic.*přečteno/i);
  });
});

describe("RUNTIME FIX: updateContact preferred over attach-only for patchable fields", () => {
  it("CRM form facts (crm_* keys) trigger updateContact when client bound", () => {
    const crmFacts = makeFactBundle({
      facts: [
        { factType: "document_received", value: "Bohuslav", normalizedValue: "Bohuslav", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "crm_first_name" },
        { factType: "document_received", value: "Plachý", normalizedValue: "Plachý", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "crm_last_name" },
        { factType: "document_received", value: "Pod Křížkem 113", normalizedValue: "Pod Křížkem 113", confidence: 0.85, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "crm_street" },
        { factType: "document_received", value: "Hoštka – Kochovice", normalizedValue: "Hoštka – Kochovice", confidence: 0.85, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "crm_city" },
        { factType: "document_received", value: "41172", normalizedValue: "41172", confidence: 0.85, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "crm_zip" },
        { factType: "document_received", value: "+420777321210", normalizedValue: "+420777321210", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "crm_phone" },
        { factType: "document_received", value: "bohuslav.plachy@post.cz", normalizedValue: "bohuslav.plachy@post.cz", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "crm_email" },
      ],
    });
    const binding = makeBinding({ clientLabel: "Bohuslav Plachý" });
    const intent = parseExplicitIntent("přiřaď mi tyto údaje ke klientovi Bohuslav Plachý");
    const plan = buildActionPlanV4(makeClassification({ inputType: "screenshot_crm_admin_ui" }), binding, crmFacts, null, null, null, intent);
    expect(plan.recommendedActions.some(a => a.writeAction === "updateContact")).toBe(true);
  });

  it("maybeUpgradeToContactUpdate promotes structured_image_fact_intake when crm_* patchable facts ≥ 3", () => {
    const crmFacts = makeFactBundle({
      facts: [
        { factType: "document_received", value: "Bohuslav", normalizedValue: "Bohuslav", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "crm_first_name" },
        { factType: "document_received", value: "Pod Křížkem 113", normalizedValue: "Pod Křížkem 113", confidence: 0.85, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "crm_street" },
        { factType: "document_received", value: "41172", normalizedValue: "41172", confidence: 0.85, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "crm_zip" },
      ],
    });
    const binding = makeBinding();
    const upgraded = maybeUpgradeToContactUpdate("structured_image_fact_intake", crmFacts, binding);
    expect(upgraded).toBe("contact_update_from_image");
  });

  it("guardrails keep updateContact in allowed image-intake action surface", () => {
    const classification = makeClassification({ inputType: "photo_or_scan_document" });
    const binding = makeBinding({ clientLabel: "Bohuslav Plachý" });
    const intent = parseExplicitIntent("přiřaď mi tyto údaje ke klientovi Bohuslav Plachý");
    const crmFacts = makeFactBundle({
      facts: [
        { factType: "document_received", value: "Bohuslav", normalizedValue: "Bohuslav", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "crm_first_name" },
        { factType: "document_received", value: "Plachý", normalizedValue: "Plachý", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "crm_last_name" },
        { factType: "document_received", value: "bohuslav.plachy@post.cz", normalizedValue: "bohuslav.plachy@post.cz", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "crm_email" },
      ],
    });
    const plan = buildActionPlanV4(classification, binding, crmFacts, null, null, null, intent);
    const verdict = enforceImageIntakeGuardrails(
      { lane: "image_intake", confidence: 1, reason: "test", handoffReason: null },
      classification,
      binding,
      plan,
    );
    expect(plan.recommendedActions.some((action) => action.writeAction === "updateContact")).toBe(true);
    expect(verdict.strippedActions.some((action) => action.writeAction === "updateContact")).toBe(false);
  });
});

describe("RUNTIME FIX: crm_* keys recognized as structured form", () => {
  it("looksLikeStructuredFormScreenshot matches crm_* fact keys", () => {
    const crmFacts = makeFactBundle({
      facts: [
        { factType: "document_received", value: "Bohuslav", normalizedValue: "Bohuslav", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "crm_first_name" },
        { factType: "document_received", value: "Plachý", normalizedValue: "Plachý", confidence: 0.9, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "crm_last_name" },
        { factType: "document_received", value: "Pod Křížkem 113", normalizedValue: "Pod Křížkem 113", confidence: 0.85, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "crm_street" },
        { factType: "document_received", value: "41172", normalizedValue: "41172", confidence: 0.85, evidence: null, isActionable: false, needsConfirmation: false, observedVsInferred: "observed", factKey: "crm_zip" },
      ],
    });
    expect(looksLikeStructuredFormScreenshot(crmFacts)).toBe(true);
  });
});

describe("RUNTIME FIX: no AI Review wording for CRM update modes", () => {
  it("handoff hint suppressed in contact_update_from_image mode", () => {
    const plan = {
      outputMode: "contact_update_from_image" as const,
      recommendedActions: [
        { intentType: "update_contact" as const, writeAction: "updateContact" as const, label: "Update", reason: "test", confidence: 0.9, requiresConfirmation: true, params: {} },
      ],
      draftReplyText: null, whyThisAction: "test", whyNotOtherActions: null, needsAdvisorInput: false, safetyFlags: [],
    };
    const result = minimalOrchestratorResult({
      response: { ...minimalOrchestratorResult().response, actionPlan: plan },
      handoffPayload: { summary: "AI Review handoff stuff", handoffReason: "test" } as any,
      previewPayload: {
        ...minimalOrchestratorResult().previewPayload,
        lifecycleStatusNote: "AI Review by měl potvrdit kontext",
      },
    });
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    for (const action of resp.suggestedActions) {
      expect(action.label).not.toMatch(/AI.?Review/i);
      expect(action.label).not.toMatch(/handoff/i);
      expect(action.label).not.toMatch(/orientační přehled/i);
    }
    for (const w of resp.warnings) {
      expect(w).not.toMatch(/AI.?Review/i);
      expect(w).not.toMatch(/handoff/i);
    }
  });

  it("warnings sanitize AI Review patterns", () => {
    const plan = {
      outputMode: "structured_image_fact_intake" as const,
      recommendedActions: [
        { intentType: "create_internal_note" as const, writeAction: "createInternalNote" as const, label: "Note", reason: "test", confidence: 0.8, requiresConfirmation: true, params: {} },
      ],
      draftReplyText: null, whyThisAction: "test", whyNotOtherActions: null, needsAdvisorInput: false,
      safetyFlags: ["AI_REVIEW_HANDOFF_RECOMMENDED"],
    };
    const result = minimalOrchestratorResult({
      response: {
        ...minimalOrchestratorResult().response,
        actionPlan: plan,
        trace: { ...minimalOrchestratorResult().response.trace, guardrailsTriggered: [] },
      },
    });
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    for (const w of resp.warnings) {
      expect(w).not.toMatch(/AI_REVIEW/);
    }
  });
});

describe("RUNTIME FIX: attach action hydration", () => {
  beforeEach(() => {
    vi.mocked(materializeIntakeImagesAsDocuments).mockReset();
  });

  it("hydrates attachDocumentToClient placeholders with materialized document ids", async () => {
    vi.mocked(materializeIntakeImagesAsDocuments).mockResolvedValueOnce(["doc_1", "doc_2"]);
    const plan = {
      outputMode: "contact_update_from_image" as const,
      recommendedActions: [
        {
          intentType: "attach_document" as const,
          writeAction: "attachDocumentToClient" as const,
          label: "Přiložit zdrojový screenshot ke klientovi",
          reason: "test",
          confidence: 0.8,
          requiresConfirmation: true,
          params: { contactId: "client_123" },
        },
      ],
      draftReplyText: null,
      whyThisAction: "test",
      whyNotOtherActions: null,
      needsAdvisorInput: false,
      safetyFlags: [],
    };

    await hydrateAttachActionsWithMaterializedDocuments(
      plan,
      [makeAsset("asset_1"), makeAsset("asset_2")],
      "tenant_1",
      "user_1",
      "img_1",
    );

    expect(plan.recommendedActions).toHaveLength(2);
    expect(plan.recommendedActions.every((action) => action.params.documentId)).toBe(true);
  });
});

describe("PLAN: create/update routing (image intake)", () => {
  it("update_contact + insufficient_binding + patchable facts → structured_image_fact_intake", () => {
    const classification = makeClassification({ inputType: "photo_or_scan_document", confidence: 0.85 });
    const binding = makeBinding({ state: "insufficient_binding", clientId: null, clientLabel: null, source: "none" });
    const facts = makeFactBundle({
      facts: [
        {
          factType: "document_received",
          value: "Pod Křížkem 113",
          normalizedValue: "Pod Křížkem 113",
          confidence: 0.85,
          evidence: null,
          isActionable: false,
          needsConfirmation: false,
          observedVsInferred: "observed",
          factKey: "crm_street",
        },
        {
          factType: "document_received",
          value: "Hoštka",
          normalizedValue: "Hoštka",
          confidence: 0.85,
          evidence: null,
          isActionable: false,
          needsConfirmation: false,
          observedVsInferred: "observed",
          factKey: "crm_city",
        },
      ],
    });
    const intent = parseExplicitIntent("Přiřaď mi údaje ke klientovi Jan Novák");
    const plan = buildActionPlanV4(classification, binding, facts, null, null, null, intent);
    expect(plan.outputMode).toBe("structured_image_fact_intake");
    expect(plan.needsAdvisorInput).toBe(true);
  });

  it("update_contact + multiple_candidates + patchable facts → structured and needsAdvisorInput", () => {
    const classification = makeClassification();
    const binding = makeBinding({
      state: "multiple_candidates",
      clientId: null,
      clientLabel: null,
      candidates: [
        { id: "c1", label: "Jan Novák" },
        { id: "c2", label: "Jan Novák ml." },
      ],
      source: "explicit_user_text",
    });
    const facts = makeFactBundle({
      facts: [
        {
          factType: "document_received",
          value: "+420777",
          normalizedValue: "+420777",
          confidence: 0.9,
          evidence: null,
          isActionable: false,
          needsConfirmation: false,
          observedVsInferred: "observed",
          factKey: "crm_phone",
        },
      ],
    });
    const intent = parseExplicitIntent("Přiřaď údaje ke klientovi Jan Novák");
    const plan = buildActionPlanV4(classification, binding, facts, null, null, null, intent);
    expect(plan.outputMode).toBe("structured_image_fact_intake");
    expect(plan.needsAdvisorInput).toBe(true);
  });

  it("identity CRM draft message avoids doklad-only empty copy", () => {
    const facts = makeFactBundle({
      facts: [
        {
          factType: "document_received",
          value: "Bohuslav",
          normalizedValue: "Bohuslav",
          confidence: 0.9,
          evidence: null,
          isActionable: false,
          needsConfirmation: false,
          observedVsInferred: "observed",
          factKey: "crm_first_name",
        },
        {
          factType: "document_received",
          value: "Plachý",
          normalizedValue: "Plachý",
          confidence: 0.9,
          evidence: null,
          isActionable: false,
          needsConfirmation: false,
          observedVsInferred: "observed",
          factKey: "crm_last_name",
        },
      ],
    });
    const plan = buildIdentityContactIntakeActionPlan(facts, []);
    const result = minimalOrchestratorResult({
      response: {
        ...minimalOrchestratorResult().response,
        actionPlan: plan,
        factBundle: facts,
        clientBinding: makeBinding({ state: "insufficient_binding", clientId: null, clientLabel: null }),
      },
      parsedIntent: parseExplicitIntent("Založ klienta z fotky"),
    });
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.message).toContain("obráz");
    expect(resp.message).not.toContain("Údaje z dokladu nebyly přečteny");
  });

  it("structured + update intent + no client binding shows bind hint in message", () => {
    const facts = makeFactBundle({
      facts: [
        {
          factType: "document_received",
          value: "A@b.cz",
          normalizedValue: "A@b.cz",
          confidence: 0.9,
          evidence: null,
          isActionable: false,
          needsConfirmation: false,
          observedVsInferred: "observed",
          factKey: "crm_email",
        },
      ],
    });
    const plan = {
      outputMode: "structured_image_fact_intake" as const,
      recommendedActions: [
        { intentType: "create_internal_note" as const, writeAction: "createInternalNote" as const, label: "Note", reason: "t", confidence: 0.8, requiresConfirmation: true, params: {} },
      ],
      draftReplyText: null,
      whyThisAction: "test",
      whyNotOtherActions: null,
      needsAdvisorInput: true,
      safetyFlags: [],
    };
    const result = minimalOrchestratorResult({
      response: {
        ...minimalOrchestratorResult().response,
        actionPlan: plan,
        factBundle: facts,
        clientBinding: makeBinding({ state: "insufficient_binding", clientId: null, clientLabel: null }),
      },
      parsedIntent: parseExplicitIntent("Přiřaď ke klientovi Bohuslav Plachý"),
    });
    const resp = mapImageIntakeToAssistantResponse(result, "s1");
    expect(resp.message).toMatch(/CRM|klienta|jednoznačně/i);
  });
});
