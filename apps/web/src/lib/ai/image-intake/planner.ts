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
    binding.state === "multiple_candidates"
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
