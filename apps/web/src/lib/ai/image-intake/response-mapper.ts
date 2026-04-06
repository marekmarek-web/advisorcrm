/**
 * AI Photo / Image Intake — maps ImageIntakeOrchestratorResult to AssistantResponse.
 *
 * Reuses the existing AssistantResponse type so the chat route, SSE stream,
 * and frontend don't need changes for the response envelope.
 * stepPreviews reuse existing StepPreviewItem from assistant-execution-ui.
 */

import type { AssistantResponse } from "../assistant-tool-router";
import type { ImageIntakeOrchestratorResult } from "./orchestrator";

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
    case "no_action_archive_only":
      return "Na obrázku jsem nenašel použitelné CRM informace. Obrázek lze archivovat, ale navrhovat žádnou CRM akci nemám.";

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
      return `Rozpoznal jsem screenshot klientské komunikace${client}. Navrhuji zaznamenat obsah a případně vytvořit úkol nebo poznámku.`;
    }

    case "structured_image_fact_intake": {
      const client = clientLabel ? ` ke klientovi **${clientLabel}**` : "";
      const typeLabel = inputType === "screenshot_payment_details"
        ? "platební screenshotem"
        : inputType === "screenshot_bank_or_finance_info"
          ? "bankovním screenshotem"
          : "dokumentem";
      return `Rozpoznal jsem obrázek s ${typeLabel}. Navrhuji uložit klíčové informace${client}.`;
    }
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

  const warnings: string[] = [
    ...previewPayload.warnings,
    ...response.trace.guardrailsTriggered.map((v) =>
      v.startsWith("BINDING_VIOLATION")
        ? "Bez jistého klienta nelze připravit write-ready plán."
        : v.startsWith("LANE_VIOLATION")
          ? "Tato zpráva patří do image intake lane, ne AI Review."
          : v,
    ),
  ].filter(Boolean);

  const confidence =
    response.classification?.confidence ??
    (response.actionPlan.outputMode === "no_action_archive_only" ? 0.9 : 0.5);

  const suggestedNextSteps: string[] = [];
  if (response.actionPlan.outputMode === "ambiguous_needs_input") {
    suggestedNextSteps.push("Otevřete kartu klienta a nahrajte obrázek znovu.");
    suggestedNextSteps.push("Nebo sdělte jméno klienta v textovém poli.");
  }

  return {
    message,
    referencedEntities: response.clientBinding.clientId
      ? [{ type: "contact", id: response.clientBinding.clientId, label: response.clientBinding.clientLabel ?? undefined }]
      : [],
    suggestedActions: [],
    warnings: [...new Set(warnings)],
    confidence,
    sourcesSummary: [`Image intake (${response.actionPlan.outputMode})`],
    sessionId,
    executionState,
    contextState: {
      channel: null,
      lockedClientId: response.clientBinding.clientId,
      lockedClientLabel: response.clientBinding.clientLabel ?? null,
    },
    suggestedNextSteps,
    hasPartialFailure: false,
  };
}
