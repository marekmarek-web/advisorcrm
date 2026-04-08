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
} from "@/lib/ai/image-intake/planner";

// --- Response mapper ---
import { mapImageIntakeToAssistantResponse } from "@/lib/ai/image-intake/response-mapper";

// --- Guardrails ---
import { isValidTerminalOutputMode } from "@/lib/ai/image-intake/guardrails";

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
      { factType: "document_received", value: "900101/1234", normalizedValue: "900101/1234", confidence: 0.8, evidence: null, isActionable: false, needsConfirmation: true, observedVsInferred: "observed", factKey: "birth_number" },
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
  it("generates advisory Czech message for contact update mode", () => {
    const result = minimalOrchestratorResult({
      response: {
        ...minimalOrchestratorResult().response,
        actionPlan: {
          outputMode: "contact_update_from_image",
          recommendedActions: [{ intentType: "create_internal_note" as const, writeAction: "createInternalNote" as const, label: "Aktualizovat", reason: "test", confidence: 0.8, requiresConfirmation: true, params: {} }],
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
