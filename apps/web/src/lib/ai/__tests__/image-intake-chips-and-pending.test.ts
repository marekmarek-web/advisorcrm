/**
 * Ambiguous image intake: structured next-step chips + pending session builder.
 * Also covers: chip no-send behavior, response mapper hints, identity-doc flow guard.
 */
import { describe, it, expect, vi } from "vitest";
import {
  dispatchSuggestedNextStepItem,
  effectiveLegacySuggestedNextSteps,
} from "@/lib/ai/suggested-next-step-dispatch";
import { looksLikeClientNameInput } from "@/lib/ai/image-intake/client-name-input-heuristic";
import { buildPendingImageIntakeResolutionFromOrchestratorResult } from "@/lib/ai/image-intake/pending-resolution-metadata";
import { mapImageIntakeToAssistantResponse } from "@/lib/ai/image-intake/response-mapper";
import type { ImageIntakeOrchestratorResult } from "@/lib/ai/image-intake/orchestrator";
import type { SuggestedNextStepItem } from "@/lib/ai/suggested-next-step-types";

describe("effectiveLegacySuggestedNextSteps", () => {
  it("returns empty legacy steps when stepItems are present (stitching hint must not be sendable)", () => {
    const legacy = ["2 navazujících obrázků bylo zpracováno jako jeden balíček."];
    const stepItems: SuggestedNextStepItem[] = [
      { label: legacy[0]!, kind: "hint" },
      { label: "Nebo sdělte jméno klienta v textovém poli.", kind: "focus_composer" },
    ];
    expect(effectiveLegacySuggestedNextSteps(legacy, stepItems)).toEqual([]);
  });

  it("passes through legacy steps only when no structured items", () => {
    expect(effectiveLegacySuggestedNextSteps(["Odeslat shrnutí"], undefined)).toEqual(["Odeslat shrnutí"]);
  });
});

describe("dispatchSuggestedNextStepItem", () => {
  it("focus_composer calls onFocusComposer and not onSend", () => {
    const onSend = vi.fn();
    const onFocusComposer = vi.fn();
    const item: SuggestedNextStepItem = {
      label: "Nebo sdělte jméno klienta v textovém poli.",
      kind: "focus_composer",
    };
    dispatchSuggestedNextStepItem(item, { onSend, onFocusComposer });
    expect(onSend).not.toHaveBeenCalled();
    expect(onFocusComposer).toHaveBeenCalledTimes(1);
  });

  it("send_message calls onSend with label", () => {
    const onSend = vi.fn();
    const onFocusComposer = vi.fn();
    const item: SuggestedNextStepItem = { label: "Potvrďte akci", kind: "send_message" };
    dispatchSuggestedNextStepItem(item, { onSend, onFocusComposer });
    expect(onSend).toHaveBeenCalledWith("Potvrďte akci");
    expect(onFocusComposer).not.toHaveBeenCalled();
  });

  it("hint is a no-op", () => {
    const onSend = vi.fn();
    const onFocusComposer = vi.fn();
    const item: SuggestedNextStepItem = { label: "Nápověda", kind: "hint" };
    dispatchSuggestedNextStepItem(item, { onSend, onFocusComposer });
    expect(onSend).not.toHaveBeenCalled();
    expect(onFocusComposer).not.toHaveBeenCalled();
  });
});

describe("looksLikeClientNameInput", () => {
  it("rejects instructional chip copy", () => {
    expect(looksLikeClientNameInput("Nebo sdělte jméno klienta v textovém poli.")).toBe(false);
    expect(looksLikeClientNameInput("Otevřete kartu klienta a nahrajte obrázek znovu.")).toBe(false);
  });

  it("accepts a real name", () => {
    expect(looksLikeClientNameInput("Lucie Opalecká")).toBe(true);
  });
});

function minimalAmbiguousOrchestratorResult(): ImageIntakeOrchestratorResult {
  return {
    response: {
      intakeId: "intake_test_1",
      laneDecision: "image_intake",
      preflight: {
        eligible: true,
        qualityLevel: "good",
        isDuplicate: false,
        mimeSupported: true,
        sizeWithinLimits: true,
        rejectReason: null,
        warnings: [],
      },
      classification: {
        inputType: "screenshot_client_communication",
        inputSubtype: "client_chat_single",
        confidence: 0.8,
        rationale: "test",
        needsDeepExtraction: false,
        safePreviewAlready: false,
        likelyFinancialInfo: false,
        uncertaintyFlags: [],
      },
      clientBinding: {
        state: "insufficient_binding",
        clientId: null,
        clientLabel: null,
        confidence: 0,
        candidates: [],
        source: "none",
        warnings: [],
      },
      caseBinding: {
        state: "insufficient_binding",
        caseId: null,
        caseLabel: null,
        confidence: 0,
        candidates: [],
        source: "none",
      },
      factBundle: {
        facts: [],
        missingFields: [],
        ambiguityReasons: [],
        extractionSource: "stub",
      },
      actionPlan: {
        outputMode: "ambiguous_needs_input",
        recommendedActions: [],
        draftReplyText: null,
        whyThisAction: "test",
        whyNotOtherActions: null,
        needsAdvisorInput: true,
        safetyFlags: [],
      },
      previewSteps: [],
      trace: {
        intakeId: "intake_test_1",
        sessionId: "sess",
        assetIds: [],
        laneDecision: "image_intake",
        inputType: "screenshot_client_communication",
        outputMode: "ambiguous_needs_input",
        clientBindingState: "insufficient_binding",
        factCount: 0,
        actionCount: 0,
        writeReady: false,
        guardrailsTriggered: [],
        durationMs: 1,
        timestamp: new Date(),
      },
    },
    executionPlan: null,
    previewPayload: {
      writeReady: false,
      warnings: [],
      advisorSummaryLines: [],
      lifecycleStatusNote: null,
    },
    classifierUsedModel: null,
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
  };
}

describe("buildPendingImageIntakeResolutionFromOrchestratorResult", () => {
  it("returns pending only for ambiguous_needs_input", () => {
    const r = minimalAmbiguousOrchestratorResult();
    const p = buildPendingImageIntakeResolutionFromOrchestratorResult(r);
    expect(p).not.toBeNull();
    expect(p!.intakeId).toBe("intake_test_1");
    expect(p!.bindingState).toBe("insufficient_binding");
    expect(p!.actionPlan.outputMode).toBe("ambiguous_needs_input");
  });

  it("returns null when output mode is not ambiguous", () => {
    const r = minimalAmbiguousOrchestratorResult();
    r.response.actionPlan = { ...r.response.actionPlan, outputMode: "no_action_archive_only" };
    expect(buildPendingImageIntakeResolutionFromOrchestratorResult(r)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// T09 + T10: Chip click behavior — no send label, focus input
// ---------------------------------------------------------------------------

describe("T09 + T10: helper chip click behavior", () => {
  it("T09: focus_composer chip does NOT send label as message", () => {
    const onSend = vi.fn();
    const onFocusComposer = vi.fn();
    const chipFromImageIntakeAmbiguous: SuggestedNextStepItem = {
      label: "Nebo sdělte jméno klienta v textovém poli.",
      kind: "focus_composer",
    };
    dispatchSuggestedNextStepItem(chipFromImageIntakeAmbiguous, { onSend, onFocusComposer });
    expect(onSend).not.toHaveBeenCalled();
    expect(onFocusComposer).toHaveBeenCalledTimes(1);
  });

  it("T10: focus_composer chip focuses input (onFocusComposer called)", () => {
    const focused = vi.fn();
    dispatchSuggestedNextStepItem({ label: "Sdělte jméno klienta.", kind: "focus_composer" }, {
      onSend: vi.fn(),
      onFocusComposer: focused,
    });
    expect(focused).toHaveBeenCalled();
  });

  it("T09-hint: hint chip does NOT send anything and does NOT focus", () => {
    const onSend = vi.fn();
    const onFocusComposer = vi.fn();
    dispatchSuggestedNextStepItem({ label: "Otevřete kartu klienta a nahrajte obrázek znovu.", kind: "hint" }, { onSend, onFocusComposer });
    expect(onSend).not.toHaveBeenCalled();
    expect(onFocusComposer).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T11: Real client name text still goes through normal resume path
// ---------------------------------------------------------------------------

describe("T11: looksLikeClientNameInput — real name vs helper text", () => {
  it("instructional chip labels that contain specific trigger phrases are rejected", () => {
    // These contain explicit trigger phrases recognized by looksLikeClientNameInput
    expect(looksLikeClientNameInput("Nebo sdělte jméno klienta v textovém poli.")).toBe(false);
    expect(looksLikeClientNameInput("Otevřete kartu klienta a nahrajte obrázek znovu.")).toBe(false);
  });

  it("case/household contextual hints may pass through heuristic — that is acceptable because they are never sent as messages (chip dispatch blocks them as hints)", () => {
    // These texts are now in suggestedNextStepItems as kind: "hint" — they never reach
    // looksLikeClientNameInput at all, because chip dispatch does not call onSend for hints.
    // The heuristic is only tested against actual user-typed input, not chip labels.
    expect(looksLikeClientNameInput("Vyberte správný case/příležitost — nalezeno více kandidátů.")).toBe(true); // passes heuristic but is never sent
  });

  it("real client name goes through resume path", () => {
    expect(looksLikeClientNameInput("Lucie Opalecká")).toBe(true);
    expect(looksLikeClientNameInput("Jan Novák")).toBe(true);
    expect(looksLikeClientNameInput("Marie Svobodová")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Response mapper: suggestedNextSteps must be empty; all hints in suggestedNextStepItems
// ---------------------------------------------------------------------------

describe("response mapper: chip routing — no send_message for contextual hints", () => {
  it("ambiguous_needs_input produces suggestedNextStepItems, not suggestedNextSteps", () => {
    const r = minimalAmbiguousOrchestratorResult();
    const resp = mapImageIntakeToAssistantResponse(r, "test-session");
    // suggestedNextSteps (legacy string[]) must be empty — prevents accidental send_message
    expect(resp.suggestedNextSteps ?? []).toHaveLength(0);
    // suggestedNextStepItems must contain focus_composer + hint
    const items = resp.suggestedNextStepItems ?? [];
    expect(items.length).toBeGreaterThan(0);
    const hasFocusComposer = items.some((i) => i.kind === "focus_composer");
    const hasHint = items.some((i) => i.kind === "hint");
    expect(hasFocusComposer).toBe(true);
    expect(hasHint).toBe(true);
    // MUST NOT have send_message kind for any instructional label
    const sendMessageItems = items.filter((i) => i.kind === "send_message");
    expect(sendMessageItems).toHaveLength(0);
  });

  it("weak_candidate binding note goes into suggestedNextStepItems as hint, not send", () => {
    const r = minimalAmbiguousOrchestratorResult();
    r.response.clientBinding = {
      state: "weak_candidate",
      clientId: "c1",
      clientLabel: "Jan Novák",
      confidence: 0.4,
      candidates: [],
      source: "crm_name_match",
      warnings: [],
    };
    // Set outputMode to something non-ambiguous so we get weak_candidate note
    r.response.actionPlan = { ...r.response.actionPlan, outputMode: "client_message_update" };
    const resp = mapImageIntakeToAssistantResponse(r, "test-session");
    // suggestedNextSteps string[] must be empty
    expect(resp.suggestedNextSteps ?? []).toHaveLength(0);
    const items = resp.suggestedNextStepItems ?? [];
    const weakNote = items.find((i) => i.label.includes("Jan Novák"));
    expect(weakNote).toBeDefined();
    expect(weakNote?.kind).toBe("hint"); // NOT send_message
  });

  it("T13: identity_contact_intake mode does not fall into generic copilot response", () => {
    const r = minimalAmbiguousOrchestratorResult();
    r.response.actionPlan = {
      ...r.response.actionPlan,
      outputMode: "identity_contact_intake",
      recommendedActions: [
        {
          intentType: "create_contact",
          writeAction: "createContact",
          label: "Vytvořit nového klienta",
          reason: "identity doc",
          confidence: 0.9,
          requiresConfirmation: true,
          params: {},
        },
      ],
    };
    r.response.factBundle = {
      facts: [
        { factKey: "id_doc_first_name", value: "Jan", confidence: 0.9, source: "multimodal" },
        { factKey: "id_doc_last_name", value: "Novák", confidence: 0.9, source: "multimodal" },
        { factKey: "id_doc_is_identity_document", value: "yes", confidence: 0.95, source: "multimodal" },
      ],
      missingFields: [],
      ambiguityReasons: [],
      extractionSource: "multimodal",
    };
    const resp = mapImageIntakeToAssistantResponse(r, "test-session");
    // Message must contain identity-specific advisor text, not generic fallback
    expect(resp.message).toContain("návrh nového klienta");
    // Must have suggestedActions with open_portal_path for "Upravit údaje"
    const editAction = resp.suggestedActions?.find((a) => a.label === "Upravit údaje");
    expect(editAction).toBeDefined();
    // No generic "jak vám mohu pomoci" or capability dump
    expect(resp.message).not.toContain("jak vám mohu pomoci");
    expect(resp.message).not.toContain("Obrázek byl zpracován v režimu image intake.");
  });

  it("strips AI_REVIEW_HANDOFF_RECOMMENDED and DOCUMENT_SET_* from advisor warnings", () => {
    const r = minimalAmbiguousOrchestratorResult();
    r.previewPayload.warnings = [
      "AI_REVIEW_HANDOFF_RECOMMENDED: interní text",
      "DOCUMENT_SET_MIXED: smíšená sada",
      "DOCUMENT_SET_INSUFFICIENT: nízká jistota",
      "DOCUMENT_SET_REVIEW_CANDIDATE: kandidát",
    ];
    const resp = mapImageIntakeToAssistantResponse(r, "sess");
    expect(resp.warnings?.some((w) => w.includes("AI_REVIEW_HANDOFF"))).toBe(false);
    expect(resp.warnings?.some((w) => w.includes("DOCUMENT_SET_"))).toBe(false);
  });

  it("structured_image_fact_intake + form-like facts uses CRM-friendly intro", () => {
    const r = minimalAmbiguousOrchestratorResult();
    r.response.actionPlan = {
      ...r.response.actionPlan,
      outputMode: "structured_image_fact_intake",
      recommendedActions: [],
      needsAdvisorInput: false,
      safetyFlags: [],
    };
    r.response.classification = {
      inputType: "photo_or_scan_document",
      subtype: null,
      confidence: 0.85,
      containsText: true,
      likelyMessageThread: false,
      likelyDocument: true,
      likelyPayment: false,
      likelyFinancialInfo: false,
      uncertaintyFlags: [],
    };
    r.response.clientBinding = {
      state: "bound_client_confident",
      clientId: "c1",
      clientLabel: "Roman Koloburda",
      confidence: 0.65,
      candidates: [],
      source: "explicit_user_text",
      warnings: [],
    };
    r.response.factBundle = {
      facts: [
        {
          factType: "document_received",
          value: "Roman",
          normalizedValue: null,
          confidence: 0.9,
          evidence: null,
          isActionable: true,
          needsConfirmation: false,
          observedVsInferred: "observed",
          factKey: "first_name",
        },
        {
          factType: "document_received",
          value: "Koloburda",
          normalizedValue: null,
          confidence: 0.9,
          evidence: null,
          isActionable: true,
          needsConfirmation: false,
          observedVsInferred: "observed",
          factKey: "last_name",
        },
        {
          factType: "document_received",
          value: "x@seznam.cz",
          normalizedValue: null,
          confidence: 0.85,
          evidence: null,
          isActionable: true,
          needsConfirmation: false,
          observedVsInferred: "observed",
          factKey: "email",
        },
        {
          factType: "document_received",
          value: "+420",
          normalizedValue: null,
          confidence: 0.8,
          evidence: null,
          isActionable: true,
          needsConfirmation: false,
          observedVsInferred: "observed",
          factKey: "phone",
        },
      ],
      missingFields: [],
      ambiguityReasons: [],
      extractionSource: "multimodal_pass",
    };
    const resp = mapImageIntakeToAssistantResponse(r, "sess");
    expect(resp.message).toContain("Našel jsem údaje z formuláře");
    expect(resp.message).toContain("Roman Koloburda");
  });
});
