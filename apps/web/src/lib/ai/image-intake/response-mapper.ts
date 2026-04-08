/**
 * AI Photo / Image Intake — maps ImageIntakeOrchestratorResult to AssistantResponse.
 *
 * Phase 3 enhancements:
 * - richer message with extracted facts summary
 * - draft reply preview attached to suggestedActions
 * - missing fields / ambiguity reasons surfaced in warnings
 * - multimodal flag state in sourcesSummary
 *
 * Reuses AssistantResponse; ambiguous_needs_input používá suggestedNextStepItems (hint / focus).
 */

import type { AssistantResponse } from "../assistant-tool-router";
import type { ActionPayload } from "../action-catalog";
import type { ImageIntakeOrchestratorResult } from "./orchestrator";
import { buildFactsSummaryLines } from "./extractor";
import { buildStitchingSummary } from "./stitching";
import { buildThreadSummaryLines } from "./thread-reconstruction";
import { buildHandoffPreviewNote } from "./handoff-payload";
import { buildIntentChangeSummary } from "./intent-change-detection";
import { buildContactNewPrefillQuery, mapFactBundleToCreateContactDraft } from "./identity-contact-intake";
import { looksLikeStructuredFormScreenshot } from "./review-handoff";

// ---------------------------------------------------------------------------
// Message templates by output mode
// ---------------------------------------------------------------------------

function buildIntakeMessage(result: ImageIntakeOrchestratorResult): string {
  const { response } = result;
  const mode = response.actionPlan.outputMode;
  const inputType = response.classification?.inputType;
  const clientLabel = response.clientBinding.clientLabel;
  const binding = response.clientBinding.state;

  switch (mode) {
    case "identity_contact_intake": {
      const draft = mapFactBundleToCreateContactDraft(result.response.factBundle);
      const p = draft.params;
      const routeMismatch = Boolean(response.clientBinding.suppressedActiveClientId);
      const pre: string[] = [];
      const push = (label: string, v: string | undefined) => {
        const t = v?.trim();
        if (t) pre.push(`${label}: ${t}`);
      };
      push("Jméno", p.firstName);
      push("Příjmení", p.lastName);
      push("Datum narození", p.birthDate);
      const addrParts = [p.street, p.city, p.zip].filter((x) => x?.trim());
      if (addrParts.length) pre.push(`Adresa: ${addrParts.join(", ")}`);
      push("E-mail", p.email);
      push("Telefon", p.phone);
      push("Titul", p.title);
      const preBlock = pre.length
        ? pre.join("\n")
        : "Žádné spolehlivé údaje nebyly z dokladu přečteny — vyplňte ručně v náhledu kroků.";

      const need: string[] = [];
      for (const line of draft.missingAdvisorLines) {
        need.push(`${line} — doplněte podle potřeby`);
      }
      if (!p.email?.trim()) need.push("E-mail — na dokladu často chybí nebo není čitelný");
      if (!p.phone?.trim()) need.push("Telefon — na dokladu často chybí nebo není čitelný");
      for (const line of draft.needsConfirmationLines) need.push(line);

      const needBlock = need.length
        ? need.slice(0, 10).join("\n")
        : "Údaje prosím před uložením ještě jednou zkontrolujte v náhledu kroků.";

      const head = routeMismatch
        ? [
            "Doklad vypadá na jinou osobu než kontakt, který máte právě otevřený v CRM — automaticky ho k němu nepřiřazuji.",
            "",
            "Z údajů na dokladu můžete přesto založit nového klienta a podklady uložit podle plánu níže.",
            "",
          ]
        : ["Připravil jsem návrh nového klienta z nahraných dokladů.", ""];

      return [
        ...head,
        "Předvyplněné údaje",
        preBlock,
        "",
        "Je potřeba doplnit nebo potvrdit",
        needBlock,
        "",
        "Další krok",
        "Ověřte údaje a pokračujte potvrzením plánu nebo tlačítkem pro úpravu ve formuláři.",
      ].join("\n");
    }

    case "no_action_archive_only": {
      const handoff = result.reviewHandoff;
      if (handoff?.recommended) {
        return `Obrázek vypadá jako kandidát na podrobnější analýzu. ${handoff.advisorExplanation.slice(0, 200)}`;
      }
      return "Na obrázku jsem nenašel použitelné CRM informace. Obrázek lze archivovat, ale navrhovat žádnou CRM akci nemám.";
    }

    case "ambiguous_needs_input": {
      const bindingIssue =
        binding === "insufficient_binding"
          ? " Nepodařilo se mi bezpečně identifikovat klienta."
          : binding === "multiple_candidates"
            ? " Existuje více možných klientů — potřebuji upřesnění."
            : "";
      const classIssue =
        !inputType || inputType === "mixed_or_uncertain_image"
          ? " Typ vstupu není jednoznačný."
          : "";
      return `Obrázek jsem přijal, ale potřebuji doplnění.${bindingIssue}${classIssue} Vyberte klienta nebo upřesněte záměr.`;
    }

    case "supporting_reference_image":
      return clientLabel
        ? `Obrázek vypadá jako referenční podklad — navrhuji přiložit ke klientovi **${clientLabel}** nebo archivovat.`
        : "Obrázek vypadá jako referenční podklad. Navrhuji přiložit ke klientovi nebo archivovat.";

    case "client_message_update": {
      const client = clientLabel ? ` od klienta **${clientLabel}**` : "";
      const factLines = buildFactsSummaryLines(result.response.factBundle, 3);
      const factText = factLines.length > 0 ? `\n\nExtrahovaná fakta:\n${factLines.map((l) => `• ${l}`).join("\n")}` : "";
      const draftNote = result.response.actionPlan.draftReplyText
        ? "\n\n_Draft odpovědi je připraven k revizi (preview-only — nic nebylo odesláno)._"
        : "";
      return `Rozpoznal jsem screenshot klientské komunikace${client}. Navrhuji zaznamenat obsah a případně vytvořit úkol nebo poznámku.${factText}${draftNote}`;
    }

    case "structured_image_fact_intake": {
      const client = clientLabel ? ` ke klientovi **${clientLabel}**` : "";
      const isForm = looksLikeStructuredFormScreenshot(result.response.factBundle);
      const typeLabel = isForm
        ? "formulářem s klientskými údaji"
        : inputType === "screenshot_payment_details"
          ? "platební screenshotem"
          : inputType === "screenshot_bank_or_finance_info"
            ? "bankovním screenshotem"
            : "dokumentem";
      const factLines = buildFactsSummaryLines(result.response.factBundle, isForm ? 6 : 4);
      const factText = factLines.length > 0 ? `\n\nRozpoznané údaje:\n${factLines.map((l) => `• ${l}`).join("\n")}` : "";
      const missing = result.response.factBundle.missingFields.length > 0
        ? `\n\nChybějící údaje: ${result.response.factBundle.missingFields.slice(0, 3).join(", ")}.`
        : "";
      const intro = isForm
        ? `Našel jsem údaje z formuláře a připravil návrh k uložení do CRM${client}.`
        : `Rozpoznal jsem obrázek s ${typeLabel}. Navrhuji uložit klíčové informace${client}.`;
      return `${intro}${factText}${missing}`;
    }

    default:
      return "Obrázek byl zpracován v režimu image intake.";
  }
}

// ---------------------------------------------------------------------------
// Map to AssistantResponse
// ---------------------------------------------------------------------------

/**
 * Maps an image intake result to the existing AssistantResponse format.
 * Reuses StepPreviewItem[] for preview/confirm UI.
 * Execution plan (if any) must be stored in session.lastExecutionPlan by caller.
 */
export function mapImageIntakeToAssistantResponse(
  result: ImageIntakeOrchestratorResult,
  sessionId: string,
): AssistantResponse {
  const { response, executionPlan, previewPayload } = result;
  const plan = executionPlan;

  const message = buildIntakeMessage(result);

  const executionState: AssistantResponse["executionState"] =
    plan && plan.steps.length > 0
      ? {
          status: "awaiting_confirmation",
          planId: plan.planId,
          totalSteps: plan.steps.length,
          pendingSteps: plan.steps.filter((s) => s.status === "requires_confirmation").length,
          stepPreviews: result.response.previewSteps as any[],
          clientLabel: response.clientBinding.clientLabel ?? undefined,
        }
      : null;

  const identityMode = response.actionPlan.outputMode === "identity_contact_intake";

  // Internal safety flags and technical identifiers must never reach the advisor UI.
  // Translate known prefixes to human-readable Czech or drop them entirely.
  const INTERNAL_FLAG_PREFIXES = [
    "AI_REVIEW_HANDOFF_RECOMMENDED",
    "DOCUMENT_SET_REVIEW_CANDIDATE",
    "DOCUMENT_SET_MIXED",
    "DOCUMENT_SET_INSUFFICIENT",
  ];

  function sanitizeWarning(w: string): string | null {
    if (INTERNAL_FLAG_PREFIXES.some((p) => w.startsWith(p))) return null;
    if (w.startsWith("BINDING_VIOLATION")) {
      return identityMode ? null : "Bez jistého klienta nelze připravit write-ready plán.";
    }
    if (w.startsWith("LANE_VIOLATION")) return null;
    return w;
  }

  const warnings: string[] = [
    ...previewPayload.warnings,
    ...(response.clientBinding.warnings ?? []),
    ...response.trace.guardrailsTriggered,
    ...response.factBundle.missingFields
      .slice(0, 2)
      .map((f) => `Chybějící údaj: ${f}`),
  ]
    .map(sanitizeWarning)
    .filter((w): w is string => w !== null && w.length > 0);

  const confidence =
    response.classification?.confidence ??
    (response.actionPlan.outputMode === "no_action_archive_only" ? 0.9 : 0.5);

  // All contextual information goes into suggestedNextStepItems as hints — never into
  // suggestedNextSteps (string[]), because those are rendered as send_message buttons.
  // Only items that the advisor should actively send as a message use kind: "send_message".
  const suggestedNextSteps: string[] = []; // kept for API shape compatibility; stays empty
  const suggestedNextStepItems: NonNullable<AssistantResponse["suggestedNextStepItems"]> = [];

  if (response.actionPlan.outputMode === "ambiguous_needs_input") {
    suggestedNextStepItems.push(
      { label: "Otevřete kartu klienta a nahrajte obrázek znovu.", kind: "hint" },
      { label: "Nebo sdělte jméno klienta v textovém poli.", kind: "focus_composer" },
    );
  }

  // weak_candidate: contextual hint, not a sendable message
  if (response.clientBinding.state === "weak_candidate") {
    suggestedNextStepItems.push({
      label: `Potvrďte, zda obrázek patří klientovi: ${response.clientBinding.clientLabel ?? "nalezený kandidát"}.`,
      kind: "hint",
    });
  }

  // Thread reconstruction summary (Phase 5)
  if (result.threadReconstruction) {
    const threadLines = buildThreadSummaryLines(result.threadReconstruction);
    for (const line of threadLines) {
      suggestedNextStepItems.unshift({ label: line, kind: "hint" });
    }
  }

  // Stitching summary (Phase 4)
  const stitchingSummary = result.stitchingResult
    ? buildStitchingSummary(result.stitchingResult)
    : null;
  if (stitchingSummary) {
    suggestedNextStepItems.unshift({ label: stitchingSummary, kind: "hint" });
  }

  // Handoff payload note (Phase 5)
  if (result.handoffPayload) {
    const handoffNote = buildHandoffPreviewNote(result.handoffPayload);
    suggestedNextStepItems.push({ label: handoffNote, kind: "hint" });
  }

  // Case signals summary (Phase 5)
  if (result.caseSignals?.summary) {
    suggestedNextStepItems.push({ label: `Signály k příležitosti: ${result.caseSignals.summary}`, kind: "hint" });
  }

  // Intent change detection summary (Phase 6)
  if (result.intentChange && result.intentChange.status !== "stable") {
    const intentNote = buildIntentChangeSummary(result.intentChange);
    if (intentNote) {
      suggestedNextStepItems.push({ label: intentNote, kind: "hint" });
    }
  }

  // Cross-session reconstruction note (Phase 6)
  if (result.crossSessionReconstruction?.hasPriorContext) {
    const cs = result.crossSessionReconstruction;
    const delta = cs.priorVsLatestDelta ?? "Navazuje na předchozí session.";
    suggestedNextStepItems.push({
      label: `Cross-session kontext: ${delta}`,
      kind: "hint",
    });
  }

  // Case binding v2 (Phase 4)
  if (result.caseBindingV2) {
    const cbv2 = result.caseBindingV2;
    if (cbv2.state === "multiple_case_candidates") {
      suggestedNextStepItems.push({ label: "Vyberte správný case/příležitost — nalezeno více kandidátů.", kind: "hint" });
    } else if (cbv2.state === "weak_case_candidate") {
      suggestedNextStepItems.push({
        label: `Potvrďte příslušnost ke case: ${cbv2.caseLabel ?? "nalezený kandidát"}.`,
        kind: "hint",
      });
    }
  }

  // Phase 9: Household / multi-client ambiguity surfacing
  if (result.householdBinding) {
    const hh = result.householdBinding;
    if (hh.state === "household_ambiguous") {
      suggestedNextStepItems.push({
        label: `Domácnost více klientů: ${hh.ambiguityNote ?? "Upřesněte, ke kterému klientovi obrázek patří."}`,
        kind: "hint",
      });
    } else if (hh.state === "household_detected" && hh.ambiguityNote) {
      suggestedNextStepItems.push({ label: `Domácnost: ${hh.ambiguityNote}`, kind: "hint" });
    }
  }

  // Phase 9: Document multi-image set outcome
  if (result.documentSetResult) {
    const ds = result.documentSetResult;
    if (ds.documentSetSummary) {
      suggestedNextStepItems.push({ label: `Dokumentový set: ${ds.documentSetSummary}`, kind: "hint" });
    }
  }

  // Phase 9: AI Review handoff lifecycle note
  if (result.previewPayload.lifecycleStatusNote) {
    suggestedNextStepItems.push({ label: result.previewPayload.lifecycleStatusNote, kind: "hint" });
  }

  const sourceLabel = result.multimodalUsed
    ? `Image intake v4 (multimodal, ${response.actionPlan.outputMode})`
    : `Image intake (${response.actionPlan.outputMode})`;

  const suggestedActions: ActionPayload[] = [];
  if (identityMode) {
    const draft = mapFactBundleToCreateContactDraft(response.factBundle);
    const q = buildContactNewPrefillQuery(draft);
    suggestedActions.push({
      actionType: "open_portal_path",
      label: "Upravit údaje",
      entityType: "portal",
      entityId: "contacts_new_prefill",
      payload: { path: `/portal/contacts/new${q}` },
      requiresConfirmation: false,
      executionMode: "manual_only",
    });
    const sup = response.clientBinding.suppressedActiveClientId;
    if (sup) {
      suggestedActions.push({
        actionType: "open_portal_path",
        label: "Otevřít kartu otevřeného klienta",
        entityType: "portal",
        entityId: sup,
        payload: { path: `/portal/contacts/${sup}` },
        requiresConfirmation: false,
        executionMode: "manual_only",
      });
    }
  }

  return {
    message,
    referencedEntities: response.clientBinding.clientId
      ? [{ type: "contact", id: response.clientBinding.clientId, label: response.clientBinding.clientLabel ?? undefined }]
      : [],
    suggestedActions,
    warnings: [...new Set(warnings)],
    confidence,
    sourcesSummary: [sourceLabel],
    sessionId,
    executionState,
    contextState: {
      channel: null,
      lockedClientId: response.clientBinding.clientId,
      lockedClientLabel: response.clientBinding.clientLabel ?? null,
    },
    // Legacy suggestedNextSteps MUST stay empty when stepItems exist.
    // Hints must never appear as sendable messages.
    suggestedNextSteps: suggestedNextStepItems.length > 0 ? [] : suggestedNextSteps,
    suggestedNextStepItems:
      suggestedNextStepItems.length > 0 ? suggestedNextStepItems : undefined,
    hasPartialFailure: false,
  };
}
