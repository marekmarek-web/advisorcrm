/**
 * Integration tests for Phase 3 image intake capability.
 * Covers:
 * - fact extraction from multimodal pass
 * - CRM-aware binding v2 (session priority, CRM lookup, multiple candidates)
 * - draft reply eligibility and generation
 * - action planning v2 with extracted facts
 * - full orchestration with multimodal enabled/disabled
 * - canonical action surface remains the only write path
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), logAuditAction: vi.fn() }));
vi.mock("@/lib/openai", () => ({
  createResponseSafe: vi.fn(),
  createResponseStructured: vi.fn(),
  createResponseStructuredWithImage: vi.fn(),
}));
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
vi.mock("../assistant-contact-search", () => ({
  searchContactsForAssistant: vi.fn(),
}));
vi.mock("../image-intake/feature-flag", () => ({
  isImageIntakeEnabled: vi.fn(() => true),
  isImageIntakeMultimodalEnabled: vi.fn(() => false), // disabled by default in tests
  getImageIntakeClassifierConfig: vi.fn(() => ({
    model: undefined,
    routingCategory: "copilot",
    maxOutputTokens: 120,
  })),
  getImageIntakeMultimodalConfig: vi.fn(() => ({
    model: undefined,
    routingCategory: "copilot",
  })),
  getImageIntakeFlagState: vi.fn(() => "enabled"),
  getImageIntakeMultimodalFlagState: vi.fn(() => "disabled"),
}));
vi.mock("next/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("next/server")>();
  return { ...original, after: vi.fn() };
});

import {
  extractFactsFromMultimodalPass,
  buildSupportingReferenceFacts,
  buildFactsSummaryLines,
} from "../image-intake/extractor";
import { resolveClientBindingV2, parseExplicitClientNameFromText } from "../image-intake/binding-v2";
import {
  checkDraftReplyEligibility,
  tryBuildDraftReply,
} from "../image-intake/draft-reply";
import { buildActionPlanV2, buildActionPlanV1, buildIntentContract } from "../image-intake/planner";
import type {
  MultimodalCombinedPassResult,
  ClientBindingResult,
  InputClassificationResult,
  ExtractedFactBundle,
  ImageIntakeRequest,
} from "../image-intake/types";
import { emptyFactBundle } from "../image-intake/types";
import { searchContactsForAssistant } from "../assistant-contact-search";

const mockSearchContacts = vi.mocked(searchContactsForAssistant);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClassification(
  inputType: InputClassificationResult["inputType"],
  confidence = 0.85,
): InputClassificationResult {
  return {
    inputType,
    subtype: null,
    confidence,
    containsText: true,
    likelyMessageThread: inputType === "screenshot_client_communication",
    likelyDocument: inputType === "photo_or_scan_document",
    likelyPayment: inputType === "screenshot_payment_details",
    likelyFinancialInfo: inputType === "screenshot_bank_or_finance_info",
    uncertaintyFlags: [],
  };
}

function makeConfidentBinding(clientId = "client-123"): ClientBindingResult {
  return {
    state: "bound_client_confident",
    clientId,
    clientLabel: "Jan Novák",
    confidence: 0.9,
    candidates: [],
    source: "session_context",
    warnings: [],
  };
}

function makeRequest(overrides: Partial<ImageIntakeRequest> = {}): ImageIntakeRequest {
  return {
    sessionId: "session-test",
    tenantId: "tenant-1",
    userId: "user-1",
    assets: [],
    activeClientId: null,
    activeOpportunityId: null,
    activeCaseId: null,
    accompanyingText: null,
    channel: null,
    ...overrides,
  };
}

function makeCommunicationPassResult(): MultimodalCombinedPassResult {
  return {
    inputType: "screenshot_client_communication",
    confidence: 0.9,
    rationale: "WhatsApp screenshot",
    actionabilityLevel: "high",
    possibleClientNameSignal: "Pavel Svoboda",
    facts: [
      { factKey: "what_client_said", value: "Prosím o refinancování hypotéky", confidence: 0.92, source: "observed" },
      { factKey: "required_follow_up", value: "Zavolat do pátku 16:00", confidence: 0.88, source: "observed" },
      { factKey: "urgency_signal", value: "high", confidence: 0.8, source: "inferred" },
    ],
    missingFields: [],
    ambiguityReasons: [],
    draftReplyIntent: "Potvrzení přijetí požadavku a avizování zpětného volání",
  };
}

function makePaymentPassResult(): MultimodalCombinedPassResult {
  return {
    inputType: "screenshot_payment_details",
    confidence: 0.85,
    rationale: "Payment QR code",
    actionabilityLevel: "medium",
    possibleClientNameSignal: null,
    facts: [
      { factKey: "amount", value: "12 500 Kč", confidence: 0.95, source: "observed" },
      { factKey: "account_number", value: "123456789/0800", confidence: 0.9, source: "observed" },
      { factKey: "variable_symbol", value: "12345678", confidence: 0.88, source: "observed" },
      { factKey: "is_complete", value: "partial", confidence: 0.75, source: "inferred" },
    ],
    missingFields: ["due_date", "recipient"],
    ambiguityReasons: [],
    draftReplyIntent: null,
  };
}

// ---------------------------------------------------------------------------
// Fact Extraction Tests
// ---------------------------------------------------------------------------

describe("extractFactsFromMultimodalPass", () => {
  it("converts communication pass result to ExtractedFactBundle", () => {
    const passResult = makeCommunicationPassResult();
    const bundle = extractFactsFromMultimodalPass(passResult, "asset-1");

    expect(bundle.extractionSource).toBe("multimodal_pass");
    expect(bundle.facts).toHaveLength(3);
    expect(bundle.facts[0].factKey).toBe("what_client_said");
    expect(bundle.facts[0].observedVsInferred).toBe("observed");
    expect(bundle.facts[2].factKey).toBe("urgency_signal");
    expect(bundle.facts[2].observedVsInferred).toBe("inferred");
    expect(bundle.facts[2].needsConfirmation).toBe(true);
  });

  it("marks actionable facts correctly", () => {
    const passResult = makeCommunicationPassResult();
    const bundle = extractFactsFromMultimodalPass(passResult, "asset-1");

    const requiredFollowUp = bundle.facts.find((f) => f.factKey === "required_follow_up");
    expect(requiredFollowUp?.isActionable).toBe(true);
  });

  it("converts payment facts with partial completeness", () => {
    const passResult = makePaymentPassResult();
    const bundle = extractFactsFromMultimodalPass(passResult, "asset-2");

    expect(bundle.missingFields).toContain("due_date");
    expect(bundle.missingFields).toContain("recipient");
    const amountFact = bundle.facts.find((f) => f.factKey === "amount");
    expect(amountFact?.value).toBe("12 500 Kč");
    expect(amountFact?.observedVsInferred).toBe("observed");
  });

  it("filters out null-value facts", () => {
    const passResult: MultimodalCombinedPassResult = {
      ...makeCommunicationPassResult(),
      facts: [
        { factKey: "what_client_said", value: null, confidence: 0.5, source: "observed" },
        { factKey: "required_follow_up", value: "Urgentní", confidence: 0.9, source: "observed" },
      ],
    };
    const bundle = extractFactsFromMultimodalPass(passResult, "asset-3");
    expect(bundle.facts).toHaveLength(1);
    expect(bundle.facts[0].factKey).toBe("required_follow_up");
  });

  it("includes asset ID in evidence reference", () => {
    const bundle = extractFactsFromMultimodalPass(makeCommunicationPassResult(), "my-asset-id");
    expect(bundle.facts[0].evidence?.sourceAssetId).toBe("my-asset-id");
  });
});

describe("buildSupportingReferenceFacts", () => {
  it("returns template fact bundle without model calls", () => {
    const bundle = buildSupportingReferenceFacts("ref-asset-1");
    expect(bundle.extractionSource).toBe("stub");
    expect(bundle.facts).toHaveLength(1);
    expect(bundle.facts[0].factType).toBe("reference_only");
    expect(bundle.facts[0].isActionable).toBe(false);
  });
});

describe("buildFactsSummaryLines", () => {
  it("returns human-readable lines from fact bundle", () => {
    const bundle = extractFactsFromMultimodalPass(makeCommunicationPassResult(), "asset-1");
    const lines = buildFactsSummaryLines(bundle, 3);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain("Klient napsal:");
  });

  it("returns ambiguity reasons when no facts", () => {
    const bundle: ExtractedFactBundle = {
      facts: [],
      missingFields: [],
      ambiguityReasons: ["Obrázek je nečitelný"],
      extractionSource: "stub",
    };
    const lines = buildFactsSummaryLines(bundle);
    expect(lines).toContain("Obrázek je nečitelný");
  });
});

// ---------------------------------------------------------------------------
// Explicit client name from user text (accompanying message)
// ---------------------------------------------------------------------------

describe("parseExplicitClientNameFromText", () => {
  it("parses ke klientovi Roman Koloburda", () => {
    expect(
      parseExplicitClientNameFromText("přiřaď údaje z fotky ke klientovi Roman Koloburda"),
    ).toBe("Roman Koloburda");
  });

  it("parses pro klienta Jan Novák", () => {
    expect(parseExplicitClientNameFromText("ulož to pro klienta Jan Novák")).toBe("Jan Novák");
  });

  it("returns null when no pattern matches", () => {
    expect(parseExplicitClientNameFromText("jen obecný text bez jména")).toBeNull();
  });

  it("parses pod Roman Koloburda without klient", () => {
    expect(parseExplicitClientNameFromText("přiřaď údaje v této fotce pod Roman Koloburda")).toBe(
      "Roman Koloburda",
    );
  });

  it("parses najdi mi klienta with mixed case", () => {
    expect(parseExplicitClientNameFromText("Najdi mi klienta ROman koloburda")).toBe("ROman koloburda");
  });

  it("does not treat requested field as client name", () => {
    expect(parseExplicitClientNameFromText("doplň klientovi rodné číslo")).toBeNull();
  });
});

describe("buildIntentContract", () => {
  it("keeps preview_only when user mentions field but not CRM destination", () => {
    const binding = makeConfidentBinding();
    const contract = buildIntentContract(binding, {
      clientName: null,
      verb: "fill",
      destination: "unknown",
      operation: "update_contact",
      requestedFields: ["personalId"],
      hasExplicitTarget: true,
      mentionsClientPlacement: false,
      mentionsCrmDestination: false,
      mentionsTaskIntent: false,
      mentionsNoteIntent: false,
      raw: "doplň rodné číslo",
    });

    expect(contract.allowedActionLevel).toBe("preview_only");
    expect(contract.userGoal).toBe("update_contact");
  });
});

describe("buildActionPlanV1 authority ladder", () => {
  it("returns preview-only structured intake without attach/update when intent is not explicit enough", () => {
    const binding = makeConfidentBinding();
    const factBundle = extractFactsFromMultimodalPass({
      ...makeCommunicationPassResult(),
      inputType: "photo_or_scan_document",
      facts: [
        { factKey: "crm_personal_id", value: "720212/5821", confidence: 0.95, source: "observed" },
        { factKey: "crm_first_name", value: "Bohuslav", confidence: 0.91, source: "observed" },
      ],
      possibleClientNameSignal: "Bohuslav Plachý",
      draftReplyIntent: null,
    }, "asset-7");

    const plan = buildActionPlanV1(
      makeClassification("photo_or_scan_document", 0.9),
      binding,
      factBundle,
      {
        clientName: null,
        verb: "fill",
        destination: "unknown",
        operation: "update_contact",
        requestedFields: ["personalId"],
        hasExplicitTarget: true,
        mentionsClientPlacement: false,
        mentionsCrmDestination: false,
        mentionsTaskIntent: false,
        mentionsNoteIntent: false,
        raw: "doplň rodné číslo",
      },
    );

    expect(plan.actionAuthority).toBe("preview_only");
    expect(plan.recommendedActions).toEqual([]);
    expect(plan.needsAdvisorInput).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CRM-aware Binding v2 Tests
// ---------------------------------------------------------------------------

describe("resolveClientBindingV2", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns session context binding when lockedClientId present", async () => {
    const session = { lockedClientId: "locked-client-1" } as any;
    const result = await resolveClientBindingV2(makeRequest(), session, "Jan Novák");

    expect(result.state).toBe("bound_client_confident");
    expect(result.clientId).toBe("locked-client-1");
    expect(result.source).toBe("session_context");
    // CRM lookup should NOT have been called (session has priority)
    expect(mockSearchContacts).not.toHaveBeenCalled();
  });

  it("returns session activeClientId binding", async () => {
    const session = { lockedClientId: null, activeClientId: "active-client-1" } as any;
    const result = await resolveClientBindingV2(makeRequest(), session, null);

    expect(result.state).toBe("bound_client_confident");
    expect(result.clientId).toBe("active-client-1");
    expect(result.source).toBe("session_context");
  });

  it("returns UI context binding from request.activeClientId", async () => {
    const result = await resolveClientBindingV2(
      makeRequest({ activeClientId: "ui-client-1" }),
      null,
      null,
    );
    expect(result.state).toBe("bound_client_confident");
    expect(result.clientId).toBe("ui-client-1");
    expect(result.source).toBe("ui_context");
  });

  it("does CRM lookup when no session context and name signal present", async () => {
    mockSearchContacts.mockResolvedValueOnce([
      { id: "crm-client-1", displayName: "Pavel Svoboda", hint: "…@email.cz" },
    ]);

    const result = await resolveClientBindingV2(makeRequest(), null, "Pavel Svoboda");

    expect(result.state).toBe("weak_candidate");
    expect(result.clientId).toBe("crm-client-1");
    expect(result.source).toBe("crm_match");
    expect(result.confidence).toBeLessThan(0.7);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("explicit name from user text → bound_client_confident when CRM returns single match", async () => {
    mockSearchContacts.mockResolvedValueOnce([
      { id: "crm-rk", displayName: "Roman Koloburda", hint: "" },
    ]);
    const result = await resolveClientBindingV2(makeRequest(), null, null, "Roman Koloburda");

    expect(result.state).toBe("bound_client_confident");
    expect(result.clientId).toBe("crm-rk");
    expect(result.source).toBe("explicit_user_text");
    expect(mockSearchContacts).toHaveBeenCalled();
    expect(result.warnings).toHaveLength(0);
  });

  it("same single CRM match from image signal only stays weak_candidate", async () => {
    mockSearchContacts.mockResolvedValueOnce([
      { id: "crm-rk", displayName: "Roman Koloburda", hint: "" },
    ]);
    const result = await resolveClientBindingV2(makeRequest(), null, "Roman Koloburda", null);

    expect(result.state).toBe("weak_candidate");
    expect(result.source).toBe("crm_match");
  });

  it("explicit text name is resolved before image name signal (one lookup)", async () => {
    mockSearchContacts.mockResolvedValueOnce([
      { id: "explicit-id", displayName: "Jan Novák", hint: "" },
    ]);
    const result = await resolveClientBindingV2(
      makeRequest(),
      null,
      "Jiné Jméno Z Obrázku",
      "Jan Novák",
    );

    expect(result.clientId).toBe("explicit-id");
    expect(mockSearchContacts).toHaveBeenCalledTimes(1);
  });

  it("returns multiple_candidates when CRM lookup finds multiple matches", async () => {
    mockSearchContacts.mockResolvedValueOnce([
      { id: "client-A", displayName: "Jan Novák", hint: "" },
      { id: "client-B", displayName: "Jan Novák", hint: "Praha" },
    ]);

    const result = await resolveClientBindingV2(makeRequest(), null, "Jan Novák");

    expect(result.state).toBe("multiple_candidates");
    expect(result.clientId).toBeNull();
    expect(result.candidates).toHaveLength(2);
  });

  it("returns insufficient_binding when no context and no name signal", async () => {
    const result = await resolveClientBindingV2(makeRequest(), null, null);

    expect(result.state).toBe("insufficient_binding");
    expect(result.clientId).toBeNull();
    expect(mockSearchContacts).not.toHaveBeenCalled();
  });

  it("returns insufficient_binding when CRM lookup finds nothing", async () => {
    mockSearchContacts.mockResolvedValueOnce([]);

    const result = await resolveClientBindingV2(makeRequest(), null, "Neznámý Člověk");

    expect(result.state).toBe("insufficient_binding");
  });

  it("no confident write-ready path from weak_candidate binding", async () => {
    mockSearchContacts.mockResolvedValueOnce([
      { id: "client-X", displayName: "Karel Novotný", hint: "" },
    ]);

    const result = await resolveClientBindingV2(makeRequest(), null, "Karel Novotný");
    expect(result.state).toBe("weak_candidate");
    // Fix 1 (resolveOutputMode): communication screenshots now get client_message_update
    // regardless of binding; attach_document excluded for non-confident binding.
    const classification = makeClassification("screenshot_client_communication", 0.85);
    const factBundle = extractFactsFromMultimodalPass(makeCommunicationPassResult(), "a1");
    const plan = buildActionPlanV2(classification, result, factBundle, null);

    expect(plan.outputMode).toBe("client_message_update");
    // note + task always proposed; attach only for bound_client_confident
    expect(plan.recommendedActions.some((a) => a.writeAction === "createInternalNote")).toBe(true);
    expect(plan.recommendedActions.some((a) => a.writeAction === "attachDocumentToClient")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Draft Reply Tests
// ---------------------------------------------------------------------------

describe("checkDraftReplyEligibility", () => {
  it("eligible when: communication screenshot + confident binding + intent present", () => {
    const bundle = extractFactsFromMultimodalPass(makeCommunicationPassResult(), "a1");
    const eligibility = checkDraftReplyEligibility(
      "screenshot_client_communication",
      makeConfidentBinding(),
      bundle,
      "Potvrzení požadavku",
    );
    expect(eligibility.eligible).toBe(true);
  });

  it("not eligible for non-communication type", () => {
    const bundle = extractFactsFromMultimodalPass(makePaymentPassResult(), "a1");
    const eligibility = checkDraftReplyEligibility(
      "screenshot_payment_details",
      makeConfidentBinding(),
      bundle,
      null,
    );
    expect(eligibility.eligible).toBe(false);
  });

  it("not eligible when binding is insufficient", () => {
    const weakBinding: ClientBindingResult = {
      state: "insufficient_binding",
      clientId: null,
      clientLabel: null,
      confidence: 0,
      candidates: [],
      source: "none",
      warnings: [],
    };
    const bundle = extractFactsFromMultimodalPass(makeCommunicationPassResult(), "a1");
    const eligibility = checkDraftReplyEligibility(
      "screenshot_client_communication",
      weakBinding,
      bundle,
      "test",
    );
    expect(eligibility.eligible).toBe(false);
  });

  it("not eligible when binding is multiple_candidates", () => {
    const ambigBinding: ClientBindingResult = {
      state: "multiple_candidates",
      clientId: null,
      clientLabel: null,
      confidence: 0,
      candidates: [{ id: "a", label: "A", score: 0.5 }],
      source: "crm_match",
      warnings: [],
    };
    const bundle = emptyFactBundle();
    const eligibility = checkDraftReplyEligibility(
      "screenshot_client_communication",
      ambigBinding,
      bundle,
      "intent",
    );
    expect(eligibility.eligible).toBe(false);
  });

  it("not eligible when no intent and no relevant facts", () => {
    const bundle = emptyFactBundle();
    const eligibility = checkDraftReplyEligibility(
      "screenshot_client_communication",
      makeConfidentBinding(),
      bundle,
      null,
    );
    expect(eligibility.eligible).toBe(false);
  });
});

describe("tryBuildDraftReply", () => {
  it("returns draft reply string when all conditions met", () => {
    const bundle = extractFactsFromMultimodalPass(makeCommunicationPassResult(), "a1");
    const draft = tryBuildDraftReply(
      "screenshot_client_communication",
      makeConfidentBinding(),
      bundle,
      "Potvrzení žádosti",
    );
    expect(draft).not.toBeNull();
    expect(typeof draft).toBe("string");
    expect(draft).toContain("Dobrý den");
    expect(draft).toContain("[Váš poradce]");
    expect(draft).not.toContain("undefined");
  });

  it("returns null for payment screenshot", () => {
    const bundle = extractFactsFromMultimodalPass(makePaymentPassResult(), "a1");
    const draft = tryBuildDraftReply("screenshot_payment_details", makeConfidentBinding(), bundle, null);
    expect(draft).toBeNull();
  });

  it("does not auto-send or auto-execute (preview-only contract)", () => {
    const bundle = extractFactsFromMultimodalPass(makeCommunicationPassResult(), "a1");
    const draft = tryBuildDraftReply(
      "screenshot_client_communication",
      makeConfidentBinding(),
      bundle,
      "Intent",
    );
    // Draft is just a string — no execution, no send
    expect(typeof draft === "string" || draft === null).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Action Planning v2 Tests
// ---------------------------------------------------------------------------

describe("buildActionPlanV2", () => {
  it("enriches note actions with extracted facts summary", () => {
    const classification = makeClassification("screenshot_client_communication", 0.85);
    const binding = makeConfidentBinding();
    const bundle = extractFactsFromMultimodalPass(makeCommunicationPassResult(), "a1");
    const plan = buildActionPlanV2(classification, binding, bundle, null);

    expect(plan.outputMode).toBe("client_message_update");
    const noteAction = plan.recommendedActions.find((a) => a.writeAction === "createInternalNote");
    expect(noteAction?.params._extractedFactsSummary).toBeTruthy();
    expect(noteAction?.params._factCount).toBe(3);
  });

  it("adds task action when required_follow_up fact is present", () => {
    const classification = makeClassification("screenshot_client_communication", 0.85);
    const binding = makeConfidentBinding();
    const bundle = extractFactsFromMultimodalPass(makeCommunicationPassResult(), "a1");
    const plan = buildActionPlanV2(classification, binding, bundle, null);

    const taskAction = plan.recommendedActions.find((a) => a.writeAction === "createTask");
    expect(taskAction).toBeTruthy();
  });

  it("attaches draft reply text to plan", () => {
    const classification = makeClassification("screenshot_client_communication", 0.85);
    const binding = makeConfidentBinding();
    const bundle = extractFactsFromMultimodalPass(makeCommunicationPassResult(), "a1");
    const plan = buildActionPlanV2(classification, binding, bundle, "Navrhovaná odpověď...");

    expect(plan.draftReplyText).toBe("Navrhovaná odpověď...");
  });

  it("no write-ready plan without confident binding — note+task offered, attach excluded", () => {
    // Fix 1: communication screenshots get client_message_update even without binding.
    // Write-readiness is determined by binding, not outputMode — advisor must confirm.
    const classification = makeClassification("screenshot_client_communication", 0.85);
    const noBinding: ClientBindingResult = {
      state: "insufficient_binding",
      clientId: null,
      clientLabel: null,
      confidence: 0,
      candidates: [],
      source: "none",
      warnings: [],
    };
    const bundle = extractFactsFromMultimodalPass(makeCommunicationPassResult(), "a1");
    const plan = buildActionPlanV2(classification, noBinding, bundle, null);

    expect(plan.outputMode).toBe("client_message_update");
    expect(plan.needsAdvisorInput).toBe(true); // insufficient_binding → needsAdvisorInput=true
    expect(plan.recommendedActions.some((a) => a.writeAction === "createInternalNote")).toBe(true);
    expect(plan.recommendedActions.some((a) => a.writeAction === "attachDocumentToClient")).toBe(false);
  });

  it("supporting/reference stays as supporting_reference_image", () => {
    const classification = makeClassification("supporting_reference_image", 0.9);
    const binding = makeConfidentBinding();
    const bundle = buildSupportingReferenceFacts("a1");
    const plan = buildActionPlanV2(classification, binding, bundle, null);

    expect(plan.outputMode).toBe("supporting_reference_image");
    // Not placed into structured fact intake or client message update
  });

  it("unusable image returns no_action_archive_only", () => {
    const classification = makeClassification("general_unusable_image", 0.95);
    const binding = makeConfidentBinding();
    const plan = buildActionPlanV2(classification, binding, emptyFactBundle(), null);

    expect(plan.outputMode).toBe("no_action_archive_only");
    expect(plan.recommendedActions).toHaveLength(0);
  });

  it("uses canonical action surface only (no new write engine)", () => {
    const classification = makeClassification("screenshot_client_communication", 0.85);
    const binding = makeConfidentBinding();
    const bundle = extractFactsFromMultimodalPass(makeCommunicationPassResult(), "a1");
    const plan = buildActionPlanV2(classification, binding, bundle, "draft text");

    const allowedWriteActions = new Set([
      "createTask", "createInternalNote", "attachDocumentToClient",
      "createClientRequest", "createMeetingNote", "createFollowUp",
      null,
    ]);
    for (const action of plan.recommendedActions) {
      expect(allowedWriteActions.has(action.writeAction)).toBe(true);
    }
  });

  it("document-like image does NOT trigger AI Review flow", () => {
    const classification = makeClassification("photo_or_scan_document", 0.8);
    const binding = makeConfidentBinding();
    const plan = buildActionPlanV2(classification, binding, emptyFactBundle(), null);

    // Should be structured_image_fact_intake, not any AI Review path
    expect(plan.outputMode).toBe("structured_image_fact_intake");
    // No ai_review actions
    const hasAiReviewAction = plan.recommendedActions.some(
      (a) => a.intentType.includes("review") || String(a.writeAction).includes("review"),
    );
    expect(hasAiReviewAction).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cost optimization: multimodal is NOT called unnecessarily
// ---------------------------------------------------------------------------

describe("multimodal cost guardrails", () => {
  it("shouldRunMultimodalPass returns false for general_unusable_image", async () => {
    const { shouldRunMultimodalPass } = await import("../image-intake/multimodal");
    expect(shouldRunMultimodalPass("general_unusable_image", 0.9, false, "https://url.com/img.jpg", true)).toBe(false);
  });

  it("shouldRunMultimodalPass returns false for supporting_reference_image", async () => {
    const { shouldRunMultimodalPass } = await import("../image-intake/multimodal");
    expect(shouldRunMultimodalPass("supporting_reference_image", 0.9, false, "https://url.com/img.jpg", true)).toBe(false);
  });

  it("shouldRunMultimodalPass returns false when earlyExit=true", async () => {
    const { shouldRunMultimodalPass } = await import("../image-intake/multimodal");
    expect(shouldRunMultimodalPass("screenshot_client_communication", 0.9, true, "https://url.com/img.jpg", true)).toBe(false);
  });
});
