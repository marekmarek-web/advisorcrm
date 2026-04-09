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
  ReviewHandoffRecommendation,
  DocumentMultiImageResult,
} from "./types";
import { safeOutputModeForUncertainInput } from "./guardrails";
import {
  inferCreateContactDraftSource,
  mapFactBundleToCreateContactDraft,
} from "./identity-contact-intake";
import { enrichBirthDateFromPersonalIdInParams } from "../czech-personal-id-birth-date";
import { looksLikeStructuredFormScreenshot } from "./review-handoff";
import type { ParsedExplicitIntent } from "./explicit-intent-parser";

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
  intent?: ParsedExplicitIntent | null,
  factBundle?: ExtractedFactBundle | null,
): ImageOutputMode {
  if (classification.inputType === "general_unusable_image") {
    return "no_action_archive_only";
  }

  // Communication screenshots get their specialized mode even without a client.
  if (classification.inputType === "screenshot_client_communication") {
    if (classification.confidence < 0.65 && !intent?.hasExplicitTarget) return "ambiguous_needs_input";
    return "client_message_update";
  }

  // Payment intent from user text OR payment screenshot → payment mode when bound
  if (
    intent?.operation === "portal_payment_update" ||
    (classification.inputType === "screenshot_payment_details" &&
      binding.state === "bound_client_confident")
  ) {
    return "payment_details_portal_update";
  }

  // Contact update intent from user text with bound client → contact update mode
  if (
    intent?.operation === "update_contact" &&
    (binding.state === "bound_client_confident" || binding.state === "bound_case_confident")
  ) {
    return "contact_update_from_image";
  }

  // When user explicitly targets CRM extraction and has a client, allow structured mode
  // even with weaker classification confidence
  const intentBoost = intent?.hasExplicitTarget && intent.operation !== "unknown";

  if (
    binding.state === "insufficient_binding" ||
    binding.state === "multiple_candidates" ||
    binding.state === "weak_candidate"
  ) {
    // Explicit "create new client" intent works without an existing client binding
    if (intent?.operation === "create_contact") {
      return "identity_contact_intake";
    }
    // Update contact + extrahovaná CRM pole — strukturovaný náhled místo matoucího ambiguous/note-only
    if (intent?.operation === "update_contact" && countPatchableContactFields(factBundle) >= 1) {
      return "structured_image_fact_intake";
    }
    // Communication screenshots and explicit note/task intents still get their mode
    if (intent?.operation === "create_note" || intent?.operation === "create_task" || intent?.operation === "create_followup") {
      return "client_message_update";
    }
    return "ambiguous_needs_input";
  }

  if (classification.inputType === "mixed_or_uncertain_image" || classification.confidence < 0.5) {
    if (intent?.operation === "update_contact" && countPatchableContactFields(factBundle) >= 1) {
      return "structured_image_fact_intake";
    }
    if (intentBoost) return "structured_image_fact_intake";
    return "ambiguous_needs_input";
  }

  if (classification.inputType === "supporting_reference_image") {
    return "supporting_reference_image";
  }

  if (
    classification.inputType === "screenshot_payment_details" ||
    classification.inputType === "screenshot_bank_or_finance_info"
  ) {
    if (classification.confidence >= 0.60 || intentBoost) {
      return classification.inputType === "screenshot_payment_details"
        ? "payment_details_portal_update"
        : "structured_image_fact_intake";
    }
    return "ambiguous_needs_input";
  }

  if (classification.inputType === "photo_or_scan_document") {
    if (classification.confidence >= 0.60 || intentBoost) return "structured_image_fact_intake";
    return "ambiguous_needs_input";
  }

  return safeOutputModeForUncertainInput(classification, binding);
}

/**
 * Post-extraction output mode upgrade: when facts contain contact-patchable fields
 * and client binding is confident, boost to contact_update_from_image.
 * Called after multimodal extraction in orchestrator.
 */
export function maybeUpgradeToContactUpdate(
  currentMode: ImageOutputMode,
  factBundle: ExtractedFactBundle,
  binding: ClientBindingResult,
  intent?: ParsedExplicitIntent | null,
): ImageOutputMode {
  if (currentMode === "contact_update_from_image") return currentMode;
  if (currentMode === "identity_contact_intake") return currentMode;
  if (currentMode === "no_action_archive_only") return currentMode;
  if (currentMode === "payment_details_portal_update") return currentMode;

  if (
    binding.state !== "bound_client_confident" &&
    binding.state !== "bound_case_confident"
  ) {
    return currentMode;
  }

  const contactFieldCount = factBundle.facts.filter(
    (f) =>
      CONTACT_PATCH_FACT_KEYS.has(f.factKey) &&
      f.value !== null &&
      String(f.value).trim().length > 0,
  ).length;

  const explicitCrmIntent =
    intent?.operation === "update_contact" ||
    intent?.verb === "assign" ||
    intent?.verb === "fill" ||
    intent?.verb === "save" ||
    intent?.verb === "update";

  if (contactFieldCount >= 3 || (contactFieldCount >= 1 && explicitCrmIntent)) {
    return "contact_update_from_image";
  }

  return currentMode;
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

// ---------------------------------------------------------------------------
// Contact update from image (structured form → existing client update)
// ---------------------------------------------------------------------------

function planContactUpdateFromImage(
  binding: ClientBindingResult,
  factBundle: ExtractedFactBundle,
): ImageIntakeActionCandidate[] {
  const actions: ImageIntakeActionCandidate[] = [];

  const contactFields = factBundle.facts.filter(
    (f) =>
      CONTACT_PATCH_FACT_KEYS.has(f.factKey) &&
      f.value !== null &&
      String(f.value).trim().length > 0,
  );

  if (contactFields.length > 0 && binding.clientId) {
    const patchParams: Record<string, unknown> = { contactId: binding.clientId };
    for (const f of contactFields) {
      const targetField = FACT_KEY_TO_CONTACT_FIELD[f.factKey];
      if (targetField) {
        patchParams[targetField] = f.value;
        if (f.needsConfirmation) {
          patchParams[`_confirm_${targetField}`] = true;
        }
      }
    }

    enrichBirthDateFromPersonalIdInParams(patchParams);

    actions.push(
      makeAction(
        "update_contact",
        "updateContact",
        "Aktualizovat údaje klienta",
        `Rozpoznáno ${contactFields.length} polí k aktualizaci v CRM.`,
        {
          ...patchParams,
          _imageIntakeOutputMode: "contact_update_from_image",
          _fieldCount: contactFields.length,
        },
      ),
    );
  }

  if (binding.clientId) {
    actions.push(
      makeAction(
        "attach_document",
        "attachDocumentToClient",
        "Přiložit zdrojový screenshot ke klientovi",
        "Archivovat zdrojový obrázek u klienta.",
        { contactId: binding.clientId },
      ),
    );
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Payment / portal update from image
// ---------------------------------------------------------------------------

function planPaymentPortalUpdate(
  binding: ClientBindingResult,
  factBundle: ExtractedFactBundle,
): ImageIntakeActionCandidate[] {
  const actions: ImageIntakeActionCandidate[] = [];

  const paymentFields = factBundle.facts.filter(
    (f) =>
      PAYMENT_FACT_KEYS.has(f.factKey) &&
      f.value !== null &&
      String(f.value).trim().length > 0,
  );

  const paymentParams: Record<string, unknown> = {};
  if (binding.clientId) paymentParams.contactId = binding.clientId;
  for (const f of paymentFields) {
    paymentParams[f.factKey] = f.value;
  }

  actions.push(
    makeAction(
      "create_internal_note",
      "createInternalNote",
      "Uložit platební údaje",
      paymentFields.length > 0
        ? `Rozpoznáno ${paymentFields.length} platebních polí.`
        : "Platební screenshot — údaje k ověření.",
      {
        ...paymentParams,
        _imageIntakeOutputMode: "payment_details_portal_update",
        _paymentFieldCount: paymentFields.length,
      },
    ),
  );

  if (binding.clientId) {
    actions.push(
      makeAction(
        "attach_document",
        "attachDocumentToClient",
        "Přiložit platební doklad ke klientovi",
        "Archivovat platební screenshot.",
        { contactId: binding.clientId },
      ),
    );
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Fact key → contact field mapping for contact update mode
// ---------------------------------------------------------------------------

const FACT_KEY_TO_CONTACT_FIELD: Record<string, string> = {
  first_name: "firstName",
  last_name: "lastName",
  client_name: "firstName",
  birth_date: "birthDate",
  birth_number: "personalId",
  street: "street",
  city: "city",
  zip: "zip",
  phone: "phone",
  email: "email",
  // Identity document keys
  id_doc_first_name: "firstName",
  id_doc_last_name: "lastName",
  id_doc_birth_date: "birthDate",
  id_doc_personal_id: "personalId",
  id_doc_street: "street",
  id_doc_city: "city",
  id_doc_zip: "zip",
  id_doc_email: "email",
  id_doc_phone: "phone",
  id_doc_title: "title",
  // CRM / admin form screenshot keys (multimodal extracts these for form screenshots)
  crm_first_name: "firstName",
  crm_last_name: "lastName",
  crm_birth_date: "birthDate",
  crm_personal_id: "personalId",
  crm_street: "street",
  crm_city: "city",
  crm_zip: "zip",
  crm_email: "email",
  crm_phone: "phone",
  crm_title: "title",
  // Contact-prefixed keys (alternate extraction)
  contact_first_name: "firstName",
  contact_last_name: "lastName",
  contact_birth_date: "birthDate",
  contact_personal_id: "personalId",
  contact_street: "street",
  contact_city: "city",
  contact_zip: "zip",
  contact_email: "email",
  contact_phone: "phone",
};

const CONTACT_PATCH_FACT_KEYS = new Set(Object.keys(FACT_KEY_TO_CONTACT_FIELD));

function countPatchableContactFields(factBundle: ExtractedFactBundle | null | undefined): number {
  if (!factBundle?.facts?.length) return 0;
  return factBundle.facts.filter(
    (f) =>
      CONTACT_PATCH_FACT_KEYS.has(f.factKey) &&
      f.value != null &&
      String(f.value).trim().length > 0,
  ).length;
}

/** Exported for tests / orchestrator diagnostics. */
export function countPatchableContactFieldsInBundle(factBundle: ExtractedFactBundle | null | undefined): number {
  return countPatchableContactFields(factBundle);
}

/**
 * Enriches fact bundle with diff status against existing CRM contact values.
 * Pure function — no DB calls; existing values passed in as a flat map.
 */
export function enrichFactsWithCrmDiff(
  factBundle: ExtractedFactBundle,
  existingValues: Record<string, string | null | undefined>,
): ExtractedFactBundle {
  const enriched = factBundle.facts.map((f) => {
    const targetField = FACT_KEY_TO_CONTACT_FIELD[f.factKey];
    if (!targetField) return f;
    const existing = existingValues[targetField];
    const extracted = f.value != null ? String(f.value).trim() : "";
    let diffStatus: import("./types").FieldDiffStatus;
    if (!extracted) {
      diffStatus = "missing";
    } else if (existing == null || existing.trim() === "") {
      diffStatus = "new";
    } else if (existing.trim().toLowerCase() === extracted.toLowerCase()) {
      diffStatus = "same";
    } else {
      diffStatus = "conflict";
    }
    return {
      ...f,
      existingCrmValue: existing ?? null,
      diffStatus,
      targetCrmField: targetField,
    };
  });
  return { ...factBundle, facts: enriched };
}

const PAYMENT_FACT_KEYS = new Set([
  "amount",
  "account_number",
  "variable_symbol",
  "due_date",
  "recipient",
  "payment_method",
  "iban",
  "bank_code",
  "specific_symbol",
  "payment_note",
  "balance_or_amount",
]);

function whyThisAction(outputMode: ImageOutputMode, classification: InputClassificationResult): string {
  switch (outputMode) {
    case "identity_contact_intake":
      return "Rozpoznán osobní doklad — připravíme návrh nového klienta z extrahovaných údajů.";
    case "client_message_update":
      return "Rozpoznán screenshot klientské komunikace. Navrhujeme zaznamenat obsah a případně vytvořit úkol.";
    case "structured_image_fact_intake":
      return `Rozpoznán ${inputTypeLabel(classification.inputType)}. Navrhujeme uložit klíčová fakta.`;
    case "contact_update_from_image":
      return "Rozpoznány klientské údaje vhodné k aktualizaci v CRM. Připravili jsme návrh změn.";
    case "payment_details_portal_update":
      return "Rozpoznány platební údaje. Připravili jsme náhled k uložení.";
    case "supporting_reference_image":
      return "Obrázek vypadá jako referenční podklad. Doporučujeme přiložit ke klientovi nebo archivovat.";
    case "ambiguous_needs_input":
      return "Vstup není jednoznačný nebo klient není identifikován. Upřesněte záměr.";
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
  intent?: ParsedExplicitIntent | null,
): ImageIntakeActionPlan {
  const base = buildActionPlanV1(classification, binding, factBundle, intent);

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

/**
 * Phase 4: action planning v3.
 * Extends v2 with review handoff recommendation surfacing.
 * When handoff is recommended, adds a note action with handoff explanation
 * and prevents normal write-ready paths from masking the handoff signal.
 */
export function buildActionPlanV3(
  classification: InputClassificationResult,
  binding: ClientBindingResult,
  factBundle: ExtractedFactBundle,
  draftReplyText: string | null,
  reviewHandoff: ReviewHandoffRecommendation | null,
  intent?: ParsedExplicitIntent | null,
): ImageIntakeActionPlan {
  const base = buildActionPlanV2(classification, binding, factBundle, draftReplyText, intent);

  if (!reviewHandoff?.recommended) return base;

  // Structured form screenshots: handoff is advisory-only, never overrides CRM extraction.
  const isStructuredForm = looksLikeStructuredFormScreenshot(factBundle);
  if (isStructuredForm) {
    return base;
  }

  // Handoff is recommended: surface it as safety flag + note action
  base.safetyFlags.push(
    `AI_REVIEW_HANDOFF_RECOMMENDED: ${reviewHandoff.advisorExplanation.slice(0, 150)}`,
  );

  if (reviewHandoff.handoffReady) {
    if (base.outputMode !== "no_action_archive_only") {
      base.outputMode = "no_action_archive_only";
      base.needsAdvisorInput = true;
      base.whyThisAction = reviewHandoff.advisorExplanation;
      base.recommendedActions = [
        makeAction(
          "create_internal_note",
          "createInternalNote",
          "Uložit jako orientační poznámku (AI Review doporučen)",
          reviewHandoff.advisorExplanation,
          {
            _imageIntakeOutputMode: "no_action_archive_only",
            _reviewHandoffSignals: reviewHandoff.signals,
            _reviewHandoffRecommended: true,
          },
        ),
      ];
    }
  }

  return base;
}

export function buildActionPlanV1(
  classification: InputClassificationResult,
  binding: ClientBindingResult,
  factBundle?: ExtractedFactBundle,
  intent?: ParsedExplicitIntent | null,
): ImageIntakeActionPlan {
  const outputMode = resolveOutputMode(classification, binding, intent, factBundle);

  let recommendedActions: ImageIntakeActionCandidate[] = [];

  switch (outputMode) {
    case "client_message_update":
      recommendedActions = planClientMessageUpdate(binding);
      break;
    case "structured_image_fact_intake":
      recommendedActions = planStructuredFactIntake(binding);
      break;
    case "identity_contact_intake":
      recommendedActions = [];
      break;
    case "contact_update_from_image":
      recommendedActions = planContactUpdateFromImage(binding, factBundle ?? { facts: [], missingFields: [], ambiguityReasons: [], extractionSource: "stub" });
      break;
    case "payment_details_portal_update":
      recommendedActions = planPaymentPortalUpdate(binding, factBundle ?? { facts: [], missingFields: [], ambiguityReasons: [], extractionSource: "stub" });
      break;
    case "supporting_reference_image":
      recommendedActions = planSupportingReference(binding);
      break;
    case "ambiguous_needs_input":
      recommendedActions = [
        makeAction(
          "create_internal_note",
          "createInternalNote",
          "Uložit obrázek jako poznámku",
          "Archivovat obsah obrázku jako interní poznámku — ke klientovi lze přiřadit později.",
          { _imageIntakeOutputMode: "ambiguous_needs_input", _unlinked: true },
        ),
      ];
      break;
    case "no_action_archive_only":
      recommendedActions = [];
      break;
  }

  const needsAdvisorInput =
    outputMode === "ambiguous_needs_input" ||
    outputMode === "no_action_archive_only" ||
    binding.state === "insufficient_binding" ||
    binding.state === "multiple_candidates" ||
    binding.state === "weak_candidate";

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

/**
 * Phase 10: action planning v4.
 * Extends v3 with document-set outcome awareness.
 *
 * Rules:
 * - supporting_reference_set → never generates structured fact actions (archive only)
 * - review_handoff_candidate  → stays handoff candidate; no extra actions added
 * - mixed_document_set        → conservative: keeps v3 output but adds safety flag
 * - consolidated_document_facts → allows structured fact actions (safe pass-through of v3)
 * - insufficient_for_merge    → conservative pass-through, no upscaling
 *
 * Cost: zero model calls.
 */
export function buildActionPlanV4(
  classification: InputClassificationResult,
  binding: ClientBindingResult,
  factBundle: ExtractedFactBundle,
  draftReplyText: string | null,
  reviewHandoff: ReviewHandoffRecommendation | null,
  documentSetResult: DocumentMultiImageResult | null,
  intent?: ParsedExplicitIntent | null,
): ImageIntakeActionPlan {
  const base = buildActionPlanV3(classification, binding, factBundle, draftReplyText, reviewHandoff, intent);

  if (!documentSetResult) return base;

  switch (documentSetResult.decision) {
    case "supporting_reference_set":
      // Fix 3: keep attachDocumentToClient when present, and always include
      // createInternalNote so the advisor has both options regardless of binding.
      base.outputMode = "supporting_reference_image";
      base.recommendedActions = base.recommendedActions.filter(
        (a) => a.writeAction === "attachDocumentToClient",
      );
      base.recommendedActions.push(
        makeAction(
          "create_internal_note",
          "createInternalNote",
          "Uložit skupinu referenčních podkladů jako poznámku",
          "Skupina referenčních obrázků — archivováno.",
          { _imageIntakeOutputMode: "supporting_reference_image", _documentSetDecision: "supporting_reference_set" },
        ),
      );
      base.whyThisAction = documentSetResult.documentSetSummary ?? base.whyThisAction;
      break;

    case "review_handoff_candidate":
      // Keep as handoff candidate — no extra actions, ensure handoff signal is preserved
      if (!base.safetyFlags.some((f) => f.includes("AI_REVIEW_HANDOFF"))) {
        base.safetyFlags.push(
          `DOCUMENT_SET_REVIEW_CANDIDATE: ${documentSetResult.documentSetSummary?.slice(0, 120) ?? "Vícestránkový dokument doporučen pro AI Review."}`,
        );
      }
      base.needsAdvisorInput = true;
      break;

    case "mixed_document_set":
      // Conservative: add safety flag, do not allow auto-merge
      base.safetyFlags.push(
        `DOCUMENT_SET_MIXED: ${documentSetResult.documentSetSummary?.slice(0, 100) ?? "Smíšená skupina — zpracováno samostatně."}`,
      );
      base.needsAdvisorInput = true;
      break;

    case "consolidated_document_facts":
      // Merged facts already in factBundle (done by orchestrator) — safe pass-through
      // Enrich whyThisAction with document set note
      base.whyThisAction =
        `${documentSetResult.documentSetSummary ?? ""} ${base.whyThisAction}`.trim();
      break;

    case "insufficient_for_merge":
      // Conservative — no upscaling, add note
      base.safetyFlags.push(
        `DOCUMENT_SET_INSUFFICIENT: Dokumentové stránky zpracovány samostatně (nízká jistota).`,
      );
      break;
  }

  return base;
}

/**
 * Plán pro rozpoznaný osobní doklad → createContact + attach nahraných stran (documentId z materializace).
 */
export function buildIdentityContactIntakeActionPlan(
  factBundle: ExtractedFactBundle,
  materializedDocumentIds: string[],
): ImageIntakeActionPlan {
  const source = inferCreateContactDraftSource(factBundle);
  const draft = mapFactBundleToCreateContactDraft(factBundle, source);
  const p = draft.params;

  const createReason =
    source === "crm_form_screenshot"
      ? "Návrh kontaktu z údajů na screenshotu — před uložením zkontrolujte pole v náhledu."
      : "Návrh kontaktu z rozpoznaného dokladu — před uložením zkontrolujte údaje v náhledu.";
  const attachReason =
    source === "crm_form_screenshot"
      ? "Přiřadí nahrané obrázky ke kartě nového klienta po jeho založení."
      : "Přiřadí nahrané strany dokladu ke kartě nového klienta po jeho založení.";
  const attachLabel0 = source === "crm_form_screenshot" ? "Uložit screenshoty jako podklad" : "Uložit doklady jako podklad";

  const actions: ImageIntakeActionCandidate[] = [
    makeAction(
      "create_contact",
      "createContact",
      "Založit klienta",
      createReason,
      {
        ...p,
        _imageIntakeOutputMode: "identity_contact_intake",
        _createContactDraftSource: source,
      },
    ),
  ];

  materializedDocumentIds.forEach((docId, i) => {
    actions.push(
      makeAction(
        "attach_document",
        "attachDocumentToClient",
        i === 0 ? attachLabel0 : `Přiložit stránku ${i + 1}`,
        attachReason,
        {
          documentId: docId,
          _identityIntakeAttach: true,
          _imageIntakeOutputMode: "identity_contact_intake",
        },
      ),
    );
  });

  const why =
    source === "crm_form_screenshot"
      ? "Rozpoznány údaje z formuláře nebo administrativní obrazovky. Připravili jsme návrh nového klienta a přiložení podkladů."
      : "Rozpoznán osobní doklad (občanka, pas nebo povolení k pobytu). Připravili jsme návrh nového klienta a přiložení podkladů.";

  return {
    outputMode: "identity_contact_intake",
    recommendedActions: actions,
    draftReplyText: null,
    whyThisAction: why,
    whyNotOtherActions: null,
    needsAdvisorInput: true,
    safetyFlags: [],
  };
}
