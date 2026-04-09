/**
 * CRM screenshot → "Založ klienta" flow tests.
 *
 * Covers the 7-bug fix chain:
 * - BUG 1: planner gate now lets create_contact through even without binding
 * - BUG 2/3: orchestrator + detectIdentityContactIntakeSignals activated by parsedIntent
 * - BUG 4: mapFactBundleToCreateContactDraft reads crm_* keys
 * - BUG 5: multimodal instructions include crm_* extraction keys
 * - BUG 6: CRM_EXTRACTION_TEXT_HINTS match "založ klienta"
 * - BUG 7: response-mapper offers create_contact hint when ambiguous
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditAction: vi.fn() }));
vi.mock("@/lib/openai", () => ({
  createResponseStructured: vi.fn(async () => ({ text: "{}", parsed: null, model: "gpt-4.1-mini" })),
  createResponseSafe: vi.fn(),
  createResponseStructuredWithImage: vi.fn(async () => ({ text: "{}", parsed: null, model: "gpt-4.1-mini" })),
  createResponseStructuredWithImages: vi.fn(async () => ({ text: "{}", parsed: null, model: "gpt-4.1-mini" })),
  logOpenAICall: vi.fn(),
}));
vi.mock("../assistant-contact-search", () => ({ searchContactsForAssistant: vi.fn(async () => []) }));
vi.mock("db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({ limit: vi.fn(async () => []) })),
          })),
        })),
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({ limit: vi.fn(async () => []) })),
          limit: vi.fn(async () => []),
        })),
      })),
    })),
    delete: vi.fn(() => ({ where: vi.fn(async () => ({ rowCount: 0 })) })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  },
  aiGenerations: {},
  contractUploadReviews: {},
  opportunities: {},
  households: {},
  householdMembers: {},
  contacts: {},
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn(),
  desc: vi.fn(),
  asc: vi.fn(),
  lt: vi.fn(),
}));
vi.mock("@/lib/ai/review-queue-repository", () => ({
  createContractReview: vi.fn(async () => "review-row-123"),
  getContractReviewById: vi.fn(async () => null),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/app/lib/coverage/item-keys", () => ({
  getAllCoverageItemKeys: vi.fn(() => []),
  getItemInfo: vi.fn(() => null),
}));
vi.mock("../assistant-coverage-item-resolve", () => ({
  normalizeCoverageStatus: vi.fn(() => null),
  getCoverageItemLabel: vi.fn(() => null),
}));
vi.mock("../assistant-execution-plan", () => ({
  buildExecutionPlan: vi.fn(() => ({ planId: "mock", steps: [] })),
  mapStepsToPreview: vi.fn(() => []),
  computeWriteStepPreflight: vi.fn(() => ({ preflightStatus: "ready", blockedReason: null })),
}));
vi.mock("../assistant-tool-router", () => ({
  routeAssistantMessage: vi.fn(),
  routeAssistantMessageCanonical: vi.fn(),
}));
vi.mock("../assistant-run-context", () => ({
  getAssistantRunStore: vi.fn(() => null),
}));
vi.mock("../image-intake/materialize-intake-documents", () => ({
  materializeIntakeImagesAsDocuments: vi.fn(async () => []),
}));
vi.mock("../image-intake/load-contact-display-label-for-intake", () => ({
  loadContactDisplayLabelForIntake: vi.fn(async () => null),
}));
vi.mock("../image-intake/binding-household", () => ({
  resolveHouseholdBinding: vi.fn(async () => ({
    state: "no_household",
    primaryClientId: null,
    primaryClientLabel: null,
    householdMembers: [],
    confidence: 0,
    ambiguityNote: null,
  })),
}));
vi.mock("../image-intake/intent-assist", () => ({
  runIntentAssist: vi.fn(async () => null),
  lookupIntentAssistCachePersistent: vi.fn(async () => null),
  storeIntentAssistCachePersistent: vi.fn(async () => undefined),
}));
vi.mock("../image-intake/feature-flag", () => ({
  isImageIntakeEnabled: vi.fn(() => true),
  isImageIntakeMultimodalEnabled: vi.fn(() => false),
  isImageIntakeMultimodalEnabledForUser: vi.fn(() => false),
  isImageIntakeStitchingEnabled: vi.fn(() => false),
  isImageIntakeReviewHandoffEnabledForUser: vi.fn(() => true),
  isImageIntakeThreadReconstructionEnabledForUser: vi.fn(() => false),
  isImageIntakeCaseSignalEnabledForUser: vi.fn(() => false),
  isImageIntakeCombinedMultimodalEnabledForUser: vi.fn(() => false),
  isImageIntakeCrossSessionEnabledForUser: vi.fn(() => false),
  getImageIntakeClassifierConfig: vi.fn(() => ({ model: undefined, routingCategory: "copilot", maxOutputTokens: 120 })),
  getImageIntakeMultimodalConfig: vi.fn(() => ({ model: undefined, routingCategory: "copilot" })),
  getImageIntakeFlagState: vi.fn(() => "enabled"),
  getImageIntakeMultimodalFlagState: vi.fn(() => "disabled"),
  getImageIntakeFlagSummary: vi.fn(() => ({})),
}));
vi.mock("@/lib/admin/feature-flags", () => ({
  isFeatureEnabled: vi.fn(() => true),
  getImageIntakeAdminFlags: vi.fn(() => ({
    enabled: true,
    combinedMultimodal: true,
    intentAssist: true,
    handoffQueueSubmit: true,
    crossSessionPersistence: true,
  })),
  setFeatureOverride: vi.fn(),
  clearFeatureOverride: vi.fn(),
  getAllFlagStates: vi.fn(() => []),
  getFlagDefinition: vi.fn(),
}));

import {
  processImageIntake,
  purgePreflightCache,
  detectIdentityContactIntakeSignals,
  mapFactBundleToCreateContactDraft,
  buildActionPlanV4,
  emptyActionPlan,
  emptyFactBundle,
} from "../image-intake";
import { parseExplicitIntent } from "../image-intake/explicit-intent-parser";
import { mapImageIntakeToAssistantResponse } from "../image-intake/response-mapper";
import type {
  ImageIntakeRequest,
  NormalizedImageAsset,
  InputClassificationResult,
  ClientBindingResult,
  ExtractedFactBundle,
} from "../image-intake";
import type { ImageIntakeOrchestratorResult } from "../image-intake/orchestrator";
import { createResponseStructured } from "@/lib/openai";

const TENANT = "t-crm-test";
const USER = "u-crm-test";
const SESSION_ID = "sess-crm-test";

function makeAsset(overrides: Partial<NormalizedImageAsset> = {}): NormalizedImageAsset {
  return {
    assetId: "asset-crm-001",
    originalFilename: "crm-screenshot.png",
    mimeType: "image/png",
    sizeBytes: 300_000,
    width: 1024,
    height: 768,
    contentHash: "hash-crm-001",
    storageUrl: "https://storage.example.com/crm.png",
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

function mockClassifier(inputType: string, confidence = 0.55) {
  vi.mocked(createResponseStructured).mockResolvedValueOnce({
    text: "{}",
    parsed: {
      inputType,
      confidence,
      rationale: "test",
      needsDeepExtraction: false,
      safePreviewAlready: false,
    },
    model: "gpt-4.1-mini",
  });
}

function makeClassification(inputType: string, confidence = 0.6): InputClassificationResult {
  return {
    inputType: inputType as any,
    subtype: null,
    confidence,
    containsText: true,
    likelyMessageThread: false,
    likelyDocument: inputType === "photo_or_scan_document",
    likelyPayment: false,
    likelyFinancialInfo: false,
    uncertaintyFlags: [],
  };
}

function makeNoBinding(): ClientBindingResult {
  return {
    state: "insufficient_binding",
    clientId: null,
    clientLabel: null,
    confidence: 0.0,
    candidates: [],
    source: "none",
    warnings: ["Klient nebyl identifikován — write-ready plán nelze vytvořit bez aktivního klientského kontextu."],
  };
}

function makeCrmFactBundle(): ExtractedFactBundle {
  return {
    ...emptyFactBundle(),
    facts: [
      { factKey: "crm_first_name", value: "Lukáš", confidence: 0.9, observedVsInferred: "observed" },
      { factKey: "crm_last_name", value: "Bibiš", confidence: 0.9, observedVsInferred: "observed" },
      { factKey: "crm_birth_date", value: "1995-01-16", confidence: 0.85, observedVsInferred: "observed" },
      { factKey: "crm_personal_id", value: "950116/2825", confidence: 0.8, observedVsInferred: "observed" },
      { factKey: "crm_street", value: "Alej 17. listopadu 1761", confidence: 0.85, observedVsInferred: "observed" },
      { factKey: "crm_city", value: "Roudnice nad Labem", confidence: 0.9, observedVsInferred: "observed" },
      { factKey: "crm_zip", value: "413 01", confidence: 0.85, observedVsInferred: "observed" },
      { factKey: "crm_phone", value: "607414122", confidence: 0.9, observedVsInferred: "observed" },
      { factKey: "crm_email", value: "lukas.bibis@gmail.com", confidence: 0.9, observedVsInferred: "observed" },
    ],
    missingFields: [],
    ambiguityReasons: [],
    extractionSource: "multimodal",
  };
}

// ---------------------------------------------------------------------------
// BUG 6: Classifier text hints
// ---------------------------------------------------------------------------
describe("parseExplicitIntent — BUG 6: založ klienta detection", () => {
  it("detects create_contact from 'Založ z těchto údajů nového klienta'", () => {
    const intent = parseExplicitIntent("Založ z těchto údajů nového klienta");
    expect(intent.operation).toBe("create_contact");
    expect(intent.verb).toBe("create");
    expect(intent.hasExplicitTarget).toBe(true);
  });

  it("detects create_contact from 'Vytvoř nového klienta'", () => {
    const intent = parseExplicitIntent("Vytvoř nového klienta z tohoto screenshotu");
    expect(intent.operation).toBe("create_contact");
  });

  it("detects create_contact from 'Založ klienta'", () => {
    const intent = parseExplicitIntent("Založ klienta podle přiložených dat");
    expect(intent.operation).toBe("create_contact");
  });
});

// ---------------------------------------------------------------------------
// BUG 3: detectIdentityContactIntakeSignals extended with parsedIntent
// ---------------------------------------------------------------------------
describe("detectIdentityContactIntakeSignals — BUG 3: create_contact intent bypass", () => {
  it("returns true when parsedIntent.operation === create_contact, regardless of classification", () => {
    const intent = parseExplicitIntent("Založ z těchto údajů nového klienta");
    const classification = makeClassification("mixed_or_uncertain_image", 0.3);
    const bundle = emptyFactBundle();

    expect(detectIdentityContactIntakeSignals(classification, bundle, null, intent)).toBe(true);
  });

  it("returns true when parsedIntent.operation === create_contact even without id_doc_* facts", () => {
    const intent = parseExplicitIntent("Založ klienta");
    const classification = makeClassification("screenshot_client_communication", 0.7);
    const bundle = makeCrmFactBundle();

    expect(detectIdentityContactIntakeSignals(classification, bundle, null, intent)).toBe(true);
  });

  it("still returns false without parsedIntent and no id_doc signals (original behavior)", () => {
    const classification = makeClassification("mixed_or_uncertain_image", 0.3);
    const bundle = emptyFactBundle();

    expect(detectIdentityContactIntakeSignals(classification, bundle, null, null)).toBe(false);
  });

  it("does not treat crm screenshot facts as implicit create-contact intent without explicit text", () => {
    const classification = makeClassification("photo_or_scan_document", 0.75);
    const bundle = makeCrmFactBundle();

    expect(detectIdentityContactIntakeSignals(classification, bundle, null, null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BUG 4: mapFactBundleToCreateContactDraft reads crm_* keys
// ---------------------------------------------------------------------------
describe("mapFactBundleToCreateContactDraft — BUG 4: crm_* key support", () => {
  it("maps crm_first_name and crm_last_name when no id_doc_* keys present", () => {
    const bundle = makeCrmFactBundle();
    const draft = mapFactBundleToCreateContactDraft(bundle);

    expect(draft.params.firstName).toBe("Lukáš");
    expect(draft.params.lastName).toBe("Bibiš");
  });

  it("maps all crm_* contact fields", () => {
    const bundle = makeCrmFactBundle();
    const draft = mapFactBundleToCreateContactDraft(bundle);

    expect(draft.params.birthDate).toBe("1995-01-16");
    expect(draft.params.personalId).toBe("950116/2825");
    expect(draft.params.street).toBe("Alej 17. listopadu 1761");
    expect(draft.params.city).toBe("Roudnice nad Labem");
    expect(draft.params.zip).toBe("413 01");
    expect(draft.params.phone).toBe("607414122");
    expect(draft.params.email).toBe("lukas.bibis@gmail.com");
  });

  it("prefers id_doc_* over crm_* when both present", () => {
    const bundle: ExtractedFactBundle = {
      ...emptyFactBundle(),
      facts: [
        { factKey: "id_doc_first_name", value: "Jan", confidence: 0.9, observedVsInferred: "observed" },
        { factKey: "crm_first_name", value: "Lukáš", confidence: 0.9, observedVsInferred: "observed" },
      ],
      missingFields: [],
      ambiguityReasons: [],
      extractionSource: "multimodal",
    };
    const draft = mapFactBundleToCreateContactDraft(bundle);
    expect(draft.params.firstName).toBe("Jan");
  });

  it("does not produce missing advisor lines when first+last name extracted from crm_* keys", () => {
    const bundle = makeCrmFactBundle();
    const draft = mapFactBundleToCreateContactDraft(bundle);

    expect(draft.missingAdvisorLines).not.toContain("Jméno");
    expect(draft.missingAdvisorLines).not.toContain("Příjmení");
  });
});

// ---------------------------------------------------------------------------
// BUG 1: planner resolveOutputMode routes create_contact to identity_contact_intake
// ---------------------------------------------------------------------------
describe("buildActionPlanV4 — BUG 1: create_contact intent with no binding", () => {
  it("returns identity_contact_intake mode when intent is create_contact and binding is insufficient", () => {
    const intent = parseExplicitIntent("Založ z těchto údajů nového klienta");
    const classification = makeClassification("mixed_or_uncertain_image", 0.35);
    const binding = makeNoBinding();
    const bundle = emptyFactBundle();

    const plan = buildActionPlanV4(classification, binding, bundle, null, null, null, intent);

    expect(plan.outputMode).toBe("identity_contact_intake");
  });

  it("returns identity_contact_intake even when classification is photo_or_scan_document without id signals", () => {
    const intent = parseExplicitIntent("Vytvoř nového klienta");
    const classification = makeClassification("photo_or_scan_document", 0.55);
    const binding = makeNoBinding();
    const bundle = emptyFactBundle();

    const plan = buildActionPlanV4(classification, binding, bundle, null, null, null, intent);

    expect(plan.outputMode).toBe("identity_contact_intake");
  });

  it("still returns ambiguous_needs_input when no create_contact intent and binding is insufficient", () => {
    const intent = parseExplicitIntent("Podívej se na tohle");
    const classification = makeClassification("mixed_or_uncertain_image", 0.3);
    const binding = makeNoBinding();
    const bundle = emptyFactBundle();

    const plan = buildActionPlanV4(classification, binding, bundle, null, null, null, intent);

    expect(plan.outputMode).toBe("ambiguous_needs_input");
  });
});

// ---------------------------------------------------------------------------
// BUG 7: response-mapper provides create_contact hints in ambiguous mode
// ---------------------------------------------------------------------------
describe("mapImageIntakeToAssistantResponse — BUG 7: create_contact hints", () => {
  function makeMinimalOrchestratorResult(
    outputMode: string,
    parsedIntentOverride?: ReturnType<typeof parseExplicitIntent>,
  ): ImageIntakeOrchestratorResult {
    const plan = emptyActionPlan(outputMode as any);
    return {
      response: {
        intakeId: "test-intake",
        laneDecision: { lane: "image_intake", confidence: 1.0, reason: "test", handoffReason: null },
        preflight: { eligible: true, skipReason: null, assetCount: 1, assetsSkipped: [] },
        clientBinding: {
          state: "insufficient_binding",
          clientId: null,
          clientLabel: null,
          confidence: 0.0,
          candidates: [],
          source: "none",
          warnings: [],
        },
        caseBinding: { state: "insufficient_binding", caseId: null, caseLabel: null, confidence: 0.0 },
        classification: null,
        multimodalResult: null,
        factBundle: emptyFactBundle(),
        actionPlan: plan,
        draftReply: null,
        previewSteps: [],
        trace: {
          intakeId: "test-intake",
          sessionId: SESSION_ID,
          assetIds: [],
          laneDecision: "image_intake",
          classificationResult: null,
          multimodalUsed: false,
          factCount: 0,
          bindingState: "insufficient_binding",
          outputMode: outputMode as any,
          durationMs: 0,
          timestamp: new Date(),
          guardrailsTriggered: [],
        } as any,
      },
      executionPlan: null,
      previewPayload: {
        intakeId: "test-intake",
        outputMode: outputMode as any,
        inputType: "mixed_or_uncertain_image",
        clientLabel: null,
        caseLabel: null,
        summary: "test",
        factsSummary: [],
        uncertainties: [],
        recommendedActions: [],
        writeReady: false,
        warnings: [],
        householdAmbiguityNote: null,
        documentSetNote: null,
        lifecycleStatusNote: null,
        intentAssistCacheStatus: null,
      },
      classifierUsedModel: false,
      multimodalUsed: false,
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
      parsedIntent: parsedIntentOverride ?? null,
    };
  }

  it("suggests create_contact hints when ambiguous + create_contact intent", () => {
    const intent = parseExplicitIntent("Založ z těchto údajů nového klienta");
    const result = makeMinimalOrchestratorResult("ambiguous_needs_input", intent);
    const response = mapImageIntakeToAssistantResponse(result, "sess-test");

    const items = response.suggestedNextStepItems ?? [];
    const labels = items.map((i) => i.label);
    expect(labels.some((l) => l.toLowerCase().includes("nového klienta") || l.toLowerCase().includes("jméno"))).toBe(true);
  });

  it("suggests open client card hints when ambiguous without create_contact intent", () => {
    const result = makeMinimalOrchestratorResult("ambiguous_needs_input", null);
    const response = mapImageIntakeToAssistantResponse(result, "sess-test");

    const items = response.suggestedNextStepItems ?? [];
    const labels = items.map((i) => i.label);
    expect(labels.some((l) => l.toLowerCase().includes("kartu klienta"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: full processImageIntake with create_contact accompanying text
// ---------------------------------------------------------------------------
describe("processImageIntake integration — CRM screenshot + založ klienta", () => {
  beforeEach(() => {
    purgePreflightCache(SESSION_ID);
    vi.clearAllMocks();
  });

  it("routes to identity_contact_intake when accompanyingText is 'Založ z těchto údajů nového klienta'", async () => {
    // Classifier returns mixed/uncertain (as would happen with a CRM screenshot)
    mockClassifier("mixed_or_uncertain_image", 0.35);

    const result = await processImageIntake(
      makeRequest({ accompanyingText: "Založ z těchto údajů nového klienta" }),
      null,
    );

    expect(result.response.actionPlan.outputMode).toBe("identity_contact_intake");
    expect(result.parsedIntent?.operation).toBe("create_contact");
  });

  it("generates createContact step in execution plan", async () => {
    mockClassifier("mixed_or_uncertain_image", 0.35);

    const result = await processImageIntake(
      makeRequest({ accompanyingText: "Založ z těchto údajů nového klienta" }),
      null,
    );

    expect(result.executionPlan).not.toBeNull();
    const hasCreateContact = result.executionPlan!.steps.some(
      (s) => s.action === "createContact",
    );
    expect(hasCreateContact).toBe(true);
  });

  it("produces createContact execution step and awaiting_confirmation plan (not ambiguous fallback)", async () => {
    mockClassifier("photo_or_scan_document", 0.6);

    const result = await processImageIntake(
      makeRequest({ accompanyingText: "Vytvoř nového klienta" }),
      null,
    );

    expect(result.response.actionPlan.outputMode).toBe("identity_contact_intake");
    // execution plan has createContact step and is awaiting confirmation
    expect(result.executionPlan).not.toBeNull();
    expect(result.executionPlan!.steps.some((s) => s.action === "createContact")).toBe(true);
    expect(result.executionPlan!.status).toBe("awaiting_confirmation");
    // writeReady stays false because advisor must review data before confirming (by design)
    expect(result.previewPayload.writeReady).toBe(false);
  });

  it("parsedIntent is included in the result", async () => {
    mockClassifier("mixed_or_uncertain_image", 0.3);

    const result = await processImageIntake(
      makeRequest({ accompanyingText: "Založ klienta" }),
      null,
    );

    expect(result.parsedIntent).not.toBeNull();
    expect(result.parsedIntent?.operation).toBe("create_contact");
  });

  it("does not create createContact plan for CRM screenshot facts when user did not explicitly ask to create a client", async () => {
    mockClassifier("photo_or_scan_document", 0.7);

    const result = await processImageIntake(
      makeRequest(),
      null,
    );

    expect(result.parsedIntent?.operation ?? "unknown").toBe("unknown");
    expect(result.response.actionPlan.outputMode).not.toBe("identity_contact_intake");
    expect(result.executionPlan?.steps.some((s) => s.action === "createContact") ?? false).toBe(false);
  });
});
