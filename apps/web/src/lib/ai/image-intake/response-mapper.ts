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
import { formatBirthDateLineForAdvisor, formatFactValueForAdvisorDisplay } from "./fact-value-display";

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
      const fromCrmScreenshot = draft.draftSource === "crm_form_screenshot";
      const routeMismatch = Boolean(response.clientBinding.suppressedActiveClientId);
      const multimodalFailed = result.response.factBundle.ambiguityReasons.includes("multimodal_pass_failed");
      const pre: string[] = [];
      const push = (label: string, v: string | undefined) => {
        const t = v?.trim();
        if (t) pre.push(`${label}: ${t}`);
      };
      push("Jméno", p.firstName);
      push("Příjmení", p.lastName);
      push("Datum narození", formatBirthDateLineForAdvisor(p.birthDate));
      const addrParts = [p.street, p.city, p.zip].filter((x) => x?.trim());
      if (addrParts.length) pre.push(`Adresa: ${addrParts.join(", ")}`);
      push("E-mail", p.email);
      push("Telefon", p.phone);
      push("Titul", p.title);
      // Fallback: show raw extracted facts if mapped params are empty but factBundle has data
      if (pre.length === 0 && result.response.factBundle.facts.length > 0) {
        const rawLines = buildFactsSummaryLines(result.response.factBundle, 8);
        for (const line of rawLines) pre.push(line);
      }
      const preBlock = pre.length
        ? pre.join("\n")
        : fromCrmScreenshot
          ? "Údaje ze screenshotu nebyly přečteny — vyplňte ručně v náhledu kroků."
          : "Údaje z dokladu nebyly přečteny — vyplňte ručně v náhledu kroků.";

      const need: string[] = [];
      for (const line of draft.missingAdvisorLines) {
        need.push(`${line} — doplněte podle potřeby`);
      }
      if (!p.email?.trim()) {
        need.push(
          fromCrmScreenshot
            ? "E-mail — na screenshotu často chybí nebo není čitelný"
            : "E-mail — na dokladu často chybí nebo není čitelný",
        );
      }
      if (!p.phone?.trim()) {
        need.push(
          fromCrmScreenshot
            ? "Telefon — na screenshotu často chybí nebo není čitelný"
            : "Telefon — na dokladu často chybí nebo není čitelný",
        );
      }
      for (const line of draft.needsConfirmationLines) need.push(line);

      const needBlock = need.length
        ? need.slice(0, 10).join("\n")
        : "Údaje prosím před uložením ještě jednou zkontrolujte v náhledu kroků.";

      const head = routeMismatch
        ? fromCrmScreenshot
          ? [
              "Údaje na screenshotu nesedí s kontaktem, který máte právě otevřený v CRM — automaticky ho k němu nepřiřazuji.",
              "",
              "Z rozpoznaných údajů můžete přesto založit nového klienta a podklady uložit podle plánu níže.",
              "",
            ]
          : [
              "Doklad vypadá na jinou osobu než kontakt, který máte právě otevřený v CRM — automaticky ho k němu nepřiřazuji.",
              "",
              "Z údajů na dokladu můžete přesto založit nového klienta a podklady uložit podle plánu níže.",
              "",
            ]
        : multimodalFailed
          ? [
              fromCrmScreenshot
                ? "Ze screenshotu se mi nepodařilo spolehlivě přečíst údaje pro založení klienta."
                : "Z nahraného dokladu se mi nepodařilo spolehlivě přečíst údaje pro založení klienta.",
              "",
            ]
          : fromCrmScreenshot
          ? ["Připravil jsem návrh nového klienta z údajů na nahraných obrázcích.", ""]
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
      const factLines = buildFactsSummaryLines(result.response.factBundle, 5);
      const factText = factLines.length > 0 ? `\n\nRozpoznané údaje:\n${factLines.map((l) => `• ${l}`).join("\n")}` : "";
      return `Obrázek jsem přijal, ale potřebuji doplnění.${bindingIssue}${classIssue} Vyberte klienta nebo upřesněte záměr.${factText}`;
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
      const previewOnly = result.response.actionPlan.actionAuthority === "preview_only";
      return previewOnly
        ? `Rozpoznal jsem screenshot klientské komunikace${client}. Zatím ukazuji jen náhled obsahu, protože jste výslovně neřekl(a), jestli z toho mám udělat poznámku, úkol nebo přiložení.${factText}${draftNote}`
        : `Rozpoznal jsem screenshot klientské komunikace${client}. Navrhuji zaznamenat obsah a případně vytvořit úkol nebo poznámku.${factText}${draftNote}`;
    }

    case "structured_image_fact_intake": {
      const client = clientLabel ? ` ke klientovi **${clientLabel}**` : "";
      const parsedIntent = result.parsedIntent;
      const multimodalFailed = result.response.factBundle.ambiguityReasons.includes("multimodal_pass_failed");
      const bindHintForUpdate =
        parsedIntent?.operation === "update_contact" &&
        (binding === "insufficient_binding" || binding === "multiple_candidates" || binding === "weak_candidate")
          ? "\n\nZ textu se mi nepodařilo jednoznačně najít klienta v CRM — údaje z obrázku jsou v náhledu. Otevřete správnou kartu klienta nebo upřesněte jméno a zkuste znovu."
          : "";
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
      if (!factText && !missing) {
        const intro = multimodalFailed
          ? `Údaje z obrázku${client} se mi nepodařilo spolehlivě přečíst.`
          : `Na obrázku${client} jsem zatím nenašel použitelné údaje pro zápis do CRM.`;
        return `${intro}${bindHintForUpdate}\n\nZkuste nahrát ostřejší screenshot nebo přiložit další část formuláře.`;
      }
      const previewOnly = result.response.actionPlan.actionAuthority === "preview_only";
      const intro = isForm
        ? previewOnly
          ? `Našel jsem údaje z formuláře${client}, ale zatím je ukazuji jen v náhledu.`
          : `Našel jsem údaje z formuláře a připravil návrh k uložení do CRM${client}.`
        : previewOnly
          ? `Rozpoznal jsem obrázek s ${typeLabel}. Zatím ukazuji jen náhled rozpoznaných údajů${client}.`
          : `Rozpoznal jsem obrázek s ${typeLabel}. Navrhuji uložit klíčové informace${client}.`;
      return `${intro}${factText}${missing}${bindHintForUpdate}`;
    }

    case "contact_update_from_image": {
      const client = clientLabel ? ` klienta **${clientLabel}**` : "";
      const hasRealUpdateAction = response.actionPlan.recommendedActions.some(
        (a) => a.writeAction === "updateContact",
      );
      const multimodalFailed = result.response.factBundle.ambiguityReasons.includes("multimodal_pass_failed");
      const diffFacts = result.response.factBundle.facts.filter(
        (f) => f.targetCrmField && f.value != null && String(f.value).trim(),
      );
      const lines: string[] = [];
      for (const f of diffFacts.slice(0, 12)) {
        const label = factKeyLabelForDiff(f.factKey);
        const val = formatFactValueForAdvisorDisplay(f.factKey, f.value, 80);
        const crmShow =
          f.diffStatus === "conflict" && f.existingCrmValue != null && String(f.existingCrmValue).trim()
            ? formatFactValueForAdvisorDisplay(f.factKey, f.existingCrmValue, 40)
            : f.existingCrmValue ?? "–";
        const tag =
          f.diffStatus === "new" ? " 🆕"
          : f.diffStatus === "conflict" ? ` ⚠ (CRM: ${crmShow})`
          : f.diffStatus === "same" ? " ✓"
          : "";
        lines.push(`• ${label}: ${val}${tag}`);
      }
      const fallbackLines = lines.length === 0 ? buildFactsSummaryLines(result.response.factBundle, 8) : [];
      const factText = lines.length > 0
        ? `\n\nÚdaje k aktualizaci:\n${lines.join("\n")}`
        : fallbackLines.length > 0
          ? `\n\nRozpoznané údaje:\n${fallbackLines.map((l) => `• ${l}`).join("\n")}`
          : "";
      if (hasRealUpdateAction) {
        const confirmNote = diffFacts.some((f) => f.needsConfirmation)
          ? "\n\nCitlivé údaje (rodné číslo, datum narození) vyžadují vaše potvrzení."
          : "\n\nPo potvrzení zapíšu změny do CRM.";
        return `Připravil jsem návrh aktualizace údajů${client} na základě nahraných obrázků.${factText}${confirmNote}`;
      }
      // No real updateContact step — honest fallback
      if (!factText) {
        const reason = multimodalFailed
          ? `Údaje z obrázku${client} se mi nepodařilo spolehlivě přečíst.`
          : `Na obrázku${client} jsem zatím nenašel použitelné údaje pro zápis do CRM.`;
        return `${reason}\n\nZkuste nahrát ostřejší screenshot nebo přiložit i část s identifikačními údaji klienta.`;
      }
      const intro = factText
        ? `Rozpoznal jsem údaje z obrázku${client}.${factText}\n\nPro zápis do CRM doplňte nebo potvrďte údaje v náhledu kroků.`
        : `Obrázek byl přijat${client}.`;
      return intro;
    }

    case "payment_details_portal_update": {
      const client = clientLabel ? ` pro klienta **${clientLabel}**` : "";
      const paymentFacts = result.response.factBundle.facts.filter(
        (f) => ["amount", "account_number", "variable_symbol", "due_date", "recipient", "iban", "bank_code"].includes(f.factKey),
      );
      const factLines = paymentFacts
        .filter((f) => f.value !== null)
        .slice(0, 6)
        .map((f) => {
          const label = f.factKey === "amount" ? "Částka"
            : f.factKey === "account_number" ? "Číslo účtu"
            : f.factKey === "variable_symbol" ? "VS"
            : f.factKey === "due_date" ? "Splatnost"
            : f.factKey === "recipient" ? "Příjemce"
            : f.factKey === "iban" ? "IBAN"
            : f.factKey;
          const val = formatFactValueForAdvisorDisplay(f.factKey, f.value, 80);
          return `• ${label}: ${val}`;
        });
      const factText = factLines.length > 0 ? `\n\nRozpoznané platební údaje:\n${factLines.join("\n")}` : "";
      const status = paymentFacts.length > 0
        ? "\n\nNáhled je připraven k ověření a uložení."
        : "\n\nPlatební údaje nebyly plně rozpoznány — ověřte obsah screenshotu.";
      return `Rozpoznal jsem platební screenshot${client}.${factText}${status}`;
    }

    default:
      return "Obrázek byl zpracován.";
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
  const { response, executionPlan, previewPayload, parsedIntent } = result;
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
    "LANE_VIOLATION",
    "BINDING_VIOLATION",
    "GUARDRAIL_",
    "SAFETY_FLAG_",
  ];

  const INTERNAL_CONTENT_PATTERNS = [
    /confidence\s+\d+%/i,
    /^[A-Z_]{3,}:/,
    /safetyFlag/i,
    /outputMode/i,
    /imageIntakeOutputMode/i,
    /AI.?Review/i,
    /handoff/i,
    /image.?intake.*lane/i,
    /orientační přehled/i,
  ];

  function sanitizeWarning(w: string): string | null {
    if (INTERNAL_FLAG_PREFIXES.some((p) => w.startsWith(p))) return null;
    if (INTERNAL_CONTENT_PATTERNS.some((p) => p.test(w))) return null;
    if (w.startsWith("BINDING_VIOLATION")) {
      return identityMode ? null : "Bez jistého klienta nelze připravit write-ready plán.";
    }
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
    if (parsedIntent?.operation === "create_contact") {
      suggestedNextStepItems.push(
        { label: "Sdělte jméno a příjmení nového klienta v textovém poli.", kind: "focus_composer" },
        { label: "Nebo otevřete formulář pro nového klienta.", kind: "hint" },
      );
    } else {
      suggestedNextStepItems.push(
        { label: "Otevřete kartu klienta a nahrajte obrázek znovu.", kind: "hint" },
        { label: "Nebo sdělte jméno klienta v textovém poli.", kind: "focus_composer" },
      );
    }
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

  // Handoff payload note (Phase 5) — suppress for CRM update / contact update modes
  const _om = response.actionPlan.outputMode;
  const isCrmUpdateMode =
    _om === "contact_update_from_image" ||
    _om === "structured_image_fact_intake" ||
    _om === "payment_details_portal_update" ||
    _om === "identity_contact_intake";
  if (result.handoffPayload && !isCrmUpdateMode) {
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

  // Phase 9: AI Review handoff lifecycle note — suppress for CRM update modes
  if (result.previewPayload.lifecycleStatusNote && !isCrmUpdateMode) {
    suggestedNextStepItems.push({ label: result.previewPayload.lifecycleStatusNote, kind: "hint" });
  }

  const sourceLabel = result.multimodalUsed
    ? `Image intake v4 (multimodal, ${response.actionPlan.outputMode})`
    : `Image intake (${response.actionPlan.outputMode})`;

  const suggestedActions: ActionPayload[] = [];
  const outputMode = response.actionPlan.outputMode;

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

  if (outputMode === "contact_update_from_image" && response.clientBinding.clientId) {
    suggestedActions.push({
      actionType: "open_portal_path",
      label: "Otevřít kartu klienta",
      entityType: "portal",
      entityId: response.clientBinding.clientId,
      payload: { path: `/portal/contacts/${response.clientBinding.clientId}` },
      requiresConfirmation: false,
      executionMode: "manual_only",
    });
  }

  if (outputMode === "payment_details_portal_update" && response.clientBinding.clientId) {
    suggestedActions.push({
      actionType: "show_portal_payment_preview",
      label: "Náhled platby",
      entityType: "payment",
      entityId: response.clientBinding.clientId,
      payload: { contactId: response.clientBinding.clientId },
      requiresConfirmation: false,
      executionMode: "manual_only",
    });
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

function factKeyLabelForDiff(key: string): string {
  const labels: Record<string, string> = {
    first_name: "Jméno", last_name: "Příjmení", client_name: "Jméno klienta",
    birth_date: "Datum narození", birth_number: "Rodné číslo",
    street: "Ulice", city: "Město", zip: "PSČ", phone: "Telefon", email: "E-mail",
    id_doc_first_name: "Jméno", id_doc_last_name: "Příjmení",
    id_doc_birth_date: "Datum narození", id_doc_personal_id: "Rodné číslo",
    id_doc_street: "Ulice", id_doc_city: "Město", id_doc_zip: "PSČ",
    id_doc_email: "E-mail", id_doc_phone: "Telefon", id_doc_title: "Titul",
    crm_first_name: "Jméno", crm_last_name: "Příjmení",
    crm_birth_date: "Datum narození", crm_personal_id: "Rodné číslo",
    crm_street: "Ulice", crm_city: "Město", crm_zip: "PSČ",
    crm_email: "E-mail", crm_phone: "Telefon", crm_title: "Titul",
    contact_first_name: "Jméno", contact_last_name: "Příjmení",
    contact_street: "Ulice", contact_city: "Město", contact_zip: "PSČ",
    contact_email: "E-mail", contact_phone: "Telefon",
    document_number: "Číslo dokladu", gender: "Pohlaví", citizenship: "Občanství",
    amount: "Částka", account_number: "Číslo účtu", variable_symbol: "VS",
    iban: "IBAN", due_date: "Splatnost",
  };
  return labels[key] ?? key;
}
