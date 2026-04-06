/**
 * AI Photo / Image Intake — action planning v1.
 *
 * Conservative, safe planning based on classifier + binding.
 * Only proposes actions that are provably valid and already in canonical action surface.
 *
 * Phase 2 scope:
 * - attach_to_client / attach_to_case  → always safe for any image with binding
 * - create_internal_note               → safe when there's something noteworthy
 * - create_task                        → only when communication shows a clear request
 * - no reply drafting, no auto-send, no high-risk actions
 */

import type {
  InputClassificationResult,
  ClientBindingResult,
  ImageIntakeActionPlan,
  ImageIntakeActionCandidate,
  ImageOutputMode,
  ExtractedFactBundle,
} from "./types";
import { safeOutputModeForUncertainInput } from "./guardrails";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAction(
  intentType: ImageIntakeActionCandidate["intentType"],
  writeAction: ImageIntakeActionCandidate["writeAction"],
  label: string,
  reason: string,
  params: Record<string, unknown> = {},
): ImageIntakeActionCandidate {
  return {
    intentType,
    writeAction,
    label,
    reason,
    confidence: 0.8,
    requiresConfirmation: true,
    params,
  };
}

// ---------------------------------------------------------------------------
// Output mode resolution from classification
// ---------------------------------------------------------------------------

function resolveOutputMode(
  classification: InputClassificationResult,
  binding: ClientBindingResult,
): ImageOutputMode {
  if (classification.inputType === "general_unusable_image") {
    return "no_action_archive_only";
  }

  if (
    binding.state === "insufficient_binding" ||
    binding.state === "multiple_candidates" ||
    binding.state === "weak_candidate"
  ) {
    return "ambiguous_needs_input";
  }

  if (classification.inputType === "mixed_or_uncertain_image" || classification.confidence < 0.5) {
    return "ambiguous_needs_input";
  }

  if (classification.inputType === "supporting_reference_image") {
    return "supporting_reference_image";
  }

  if (classification.inputType === "screenshot_client_communication") {
    return classification.confidence >= 0.65 ? "client_message_update" : "ambiguous_needs_input";
  }

  if (
    classification.inputType === "screenshot_payment_details" ||
    classification.inputType === "screenshot_bank_or_finance_info" ||
    classification.inputType === "photo_or_scan_document"
  ) {
    return classification.confidence >= 0.60 ? "structured_image_fact_intake" : "ambiguous_needs_input";
  }

  return safeOutputModeForUncertainInput(classification, binding);
}

// ---------------------------------------------------------------------------
// Action planning by output mode
// ---------------------------------------------------------------------------

function planClientMessageUpdate(binding: ClientBindingResult): ImageIntakeActionCandidate[] {
  const actions: ImageIntakeActionCandidate[] = [
    makeAction(
      "create_internal_note",
      "createInternalNote",
      "Uložit zprávu klienta jako poznámku",
      "Screenshot klientské komunikace — doporučuji zaznamenat obsah.",
      { _imageIntakeOutputMode: "client_message_update" },
    ),
    makeAction(
      "create_task",
      "createTask",
      "Vytvořit úkol na základě zprávy klienta",
      "Pokud zpráva obsahuje požadavek, vytvoř úkol.",
      { _imageIntakeOutputMode: "client_message_update" },
    ),
  ];

  if (
    binding.state === "bound_client_confident" ||
    binding.state === "bound_case_confident"
  ) {
    actions.push(
      makeAction(
        "attach_document",
        "attachDocumentToClient",
        "Přiložit screenshot ke klientovi",
        "Archivovat screenshot u klienta jako referenci.",
        { contactId: binding.clientId },
      ),
    );
  }

  return actions;
}

function planStructuredFactIntake(binding: ClientBindingResult): ImageIntakeActionCandidate[] {
  const actions: ImageIntakeActionCandidate[] = [
    makeAction(
      "create_internal_note",
      "createInternalNote",
      "Uložit informace z obrázku jako poznámku",
      "Zaznamenat klíčová fakta z obrázku.",
      { _imageIntakeOutputMode: "structured_image_fact_intake" },
    ),
  ];

  if (
    binding.state === "bound_client_confident" ||
    binding.state === "bound_case_confident"
  ) {
    actions.push(
      makeAction(
        "attach_document",
        "attachDocumentToClient",
        "Přiložit ke klientovi",
        "Archivovat dokument/screenshot u klienta.",
        { contactId: binding.clientId },
      ),
    );
  }

  return actions;
}

function planSupportingReference(binding: ClientBindingResult): ImageIntakeActionCandidate[] {
  const base: ImageIntakeActionCandidate[] = [];

  if (
    binding.state === "bound_client_confident" ||
    binding.state === "bound_case_confident"
  ) {
    base.push(
      makeAction(
        "attach_document",
        "attachDocumentToClient",
        "Přiložit jako referenční podklad ke klientovi",
        "Supporting/reference image — archivovat u klienta.",
        { contactId: binding.clientId },
      ),
    );
  }

  base.push(
    makeAction(
      "create_internal_note",
      "createInternalNote",
      "Uložit jako interní poznámku",
      "Referenční podklad — zaznamenat jako poznámku.",
      { _imageIntakeOutputMode: "supporting_reference_image" },
    ),
  );

  return base;
}

function whyThisAction(outputMode: ImageOutputMode, classification: InputClassificationResult): string {
  switch (outputMode) {
    case "client_message_update":
      return `Obrázek byl rozpoznán jako screenshot klientské komunikace (confidence ${(classification.confidence * 100).toFixed(0)}%). Navrhujeme zaznamenat obsah a případně vytvořit úkol.`;
    case "structured_image_fact_intake":
      return `Obrázek byl rozpoznán jako ${inputTypeLabel(classification.inputType)} (confidence ${(classification.confidence * 100).toFixed(0)}%). Navrhujeme uložit klíčová fakta.`;
    case "supporting_reference_image":
      return "Obrázek byl rozpoznán jako referenční podklad — není vhodné ho násilně strukturovat. Doporučujeme přiložit ke klientovi nebo archivovat.";
    case "ambiguous_needs_input":
      return `Vstup je nejasný (confidence ${(classification.confidence * 100).toFixed(0)}%) nebo klient není jistě identifikován. Poradce musí potvrdit, jak pokračovat.`;
    case "no_action_archive_only":
      return "Obrázek neobsahuje použitelné CRM informace. Žádná akce není doporučena.";
  }
}

function inputTypeLabel(type: InputClassificationResult["inputType"]): string {
  const labels: Record<typeof type, string> = {
    screenshot_client_communication: "screenshot komunikace",
    photo_or_scan_document: "foto/scan dokumentu",
    screenshot_payment_details: "screenshot platebních údajů",
    screenshot_bank_or_finance_info: "bankovní screenshot",
    supporting_reference_image: "referenční podklad",
    general_unusable_image: "nepoužitelný obrázek",
    mixed_or_uncertain_image: "smíšený/nejasný vstup",
  };
  return labels[type] ?? type;
}

// ---------------------------------------------------------------------------
// Main planner entrypoint
// ---------------------------------------------------------------------------

/**
 * Phase 3: action planning v2.
 * Extends v1 with extracted facts — creates richer note/task content
 * and passes through the draft reply text.
 */
export function buildActionPlanV2(
  classification: InputClassificationResult,
  binding: ClientBindingResult,
  factBundle: ExtractedFactBundle,
  draftReplyText: string | null,
): ImageIntakeActionPlan {
  const base = buildActionPlanV1(classification, binding);

  // Enrich note actions with extracted facts summary
  if (factBundle.facts.length > 0) {
    const factsSummary = factBundle.facts
      .filter((f) => f.value !== null)
      .slice(0, 5)
      .map((f) => `${f.factKey}: ${String(f.value).slice(0, 120)}`)
      .join("; ");

    base.recommendedActions = base.recommendedActions.map((a) => {
      if (a.writeAction === "createInternalNote" || a.writeAction === "createTask") {
        return {
          ...a,
          params: {
            ...a.params,
            _extractedFactsSummary: factsSummary,
            _factCount: factBundle.facts.length,
            _extractionSource: factBundle.extractionSource,
          },
        };
      }
      return a;
    });

    // If facts include required_follow_up or urgency, ensure task action is present
    const hasUrgentFollowUp = factBundle.facts.some(
      (f) => f.factKey === "required_follow_up" && f.value,
    );
    const hasTask = base.recommendedActions.some((a) => a.writeAction === "createTask");

    if (hasUrgentFollowUp && !hasTask && base.outputMode !== "no_action_archive_only" && base.outputMode !== "ambiguous_needs_input") {
      const followUp = factBundle.facts.find((f) => f.factKey === "required_follow_up");
      base.recommendedActions.push(
        makeAction(
          "create_task",
          "createTask",
          "Vytvořit úkol na základě požadavku klienta",
          "Extrahovaný požadavek na follow-up.",
          {
            _suggestedTitle: followUp?.value ? String(followUp.value).slice(0, 150) : "Follow-up z obrázku",
            _imageIntakeOutputMode: base.outputMode,
          },
        ),
      );
    }
  }

  // Attach draft reply to plan (preview-only)
  base.draftReplyText = draftReplyText;

  // Enrich whyThisAction with fact extraction note
  if (factBundle.extractionSource === "multimodal_pass" && factBundle.facts.length > 0) {
    base.whyThisAction += ` Extrahováno ${factBundle.facts.length} fakt${factBundle.facts.length > 1 ? "ů" : ""}.`;
  }

  return base;
}

export function buildActionPlanV1(
  classification: InputClassificationResult,
  binding: ClientBindingResult,
): ImageIntakeActionPlan {
  const outputMode = resolveOutputMode(classification, binding);

  let recommendedActions: ImageIntakeActionCandidate[] = [];

  switch (outputMode) {
    case "client_message_update":
      recommendedActions = planClientMessageUpdate(binding);
      break;
    case "structured_image_fact_intake":
      recommendedActions = planStructuredFactIntake(binding);
      break;
    case "supporting_reference_image":
      recommendedActions = planSupportingReference(binding);
      break;
    case "ambiguous_needs_input":
    case "no_action_archive_only":
      recommendedActions = [];
      break;
  }

  const needsAdvisorInput =
    outputMode === "ambiguous_needs_input" ||
    outputMode === "no_action_archive_only" ||
    binding.state === "insufficient_binding";

  return {
    outputMode,
    recommendedActions,
    draftReplyText: null,
    whyThisAction: whyThisAction(outputMode, classification),
    whyNotOtherActions:
      outputMode === "no_action_archive_only"
        ? "Obrázek neposkytuje použitelné CRM informace."
        : outputMode === "ambiguous_needs_input"
          ? "Bez jistého klienta nebo jasné klasifikace nelze bezpečně navrhovat write akce."
          : null,
    needsAdvisorInput,
    safetyFlags: binding.warnings.length > 0 ? binding.warnings : [],
  };
}
