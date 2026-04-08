/**
 * AI Photo / Image Intake — pending client resolution & intake resume.
 *
 * When an image intake ends as ambiguous_needs_input due to a missing or
 * ambiguous client, the session stores a PendingImageIntakeResolution.
 * The next plain-text user message is intercepted here and treated as a
 * client name / selection input rather than a new open-ended chat query.
 *
 * On successful client resolution the original extracted facts are reused —
 * no re-parsing of the image is performed.
 */

import type { ExecutionPlan } from "../assistant-domain-model";
import type { AssistantSession } from "../assistant-session";
import { lockAssistantClient, clearPendingImageIntakeResolution } from "../assistant-session";
import type { PendingImageIntakeResolution } from "../assistant-session";
import type { AssistantResponse } from "../assistant-tool-router";
import { searchContactsForAssistant } from "../assistant-contact-search";
import { buildFactsSummaryLines } from "./extractor";
import { isPendingImageIntakeResolutionExpired } from "./pending-resolution-metadata";
import { buildExecutionPlanAfterIntakeResume } from "./resume-intake-execution-plan";
import { mapToPreviewItems } from "./intake-execution-plan-mapper";
import { looksLikeClientNameInput } from "./client-name-input-heuristic";
import { parseExplicitClientNameFromText } from "./binding-v2";

export { looksLikeClientNameInput } from "./client-name-input-heuristic";

// ---------------------------------------------------------------------------
// CRM lookup for resolution input
// ---------------------------------------------------------------------------

async function resolveClientFromText(
  tenantId: string,
  text: string,
  existingCandidates: Array<{ id: string; label: string }>,
): Promise<
  | { state: "resolved"; clientId: string; clientLabel: string }
  | { state: "multiple"; candidates: Array<{ id: string; label: string }> }
  | { state: "not_found" }
> {
  // If there were existing candidates (multiple_candidates), check if the user
  // is picking by name substring among them first (cheap, no DB call)
  if (existingCandidates.length > 0) {
    const lower = text.trim().toLowerCase();
    const matched = existingCandidates.filter(
      (c) => c.label.toLowerCase().includes(lower) || lower.includes(c.label.toLowerCase()),
    );
    if (matched.length === 1) {
      return { state: "resolved", clientId: matched[0].id, clientLabel: matched[0].label };
    }
    if (matched.length > 1) {
      return { state: "multiple", candidates: matched };
    }
  }

  // Full CRM name lookup
  let matches: Array<{ id: string; displayName: string }>;
  try {
    matches = await searchContactsForAssistant(tenantId, text.trim(), 6, { match: "name_only" });
  } catch {
    return { state: "not_found" };
  }

  if (matches.length === 0) return { state: "not_found" };
  if (matches.length === 1) {
    return { state: "resolved", clientId: matches[0].id, clientLabel: matches[0].displayName };
  }
  return {
    state: "multiple",
    candidates: matches.map((m) => ({ id: m.id, label: m.displayName })),
  };
}

// ---------------------------------------------------------------------------
// Public: check if the session has an active pending resolution
// ---------------------------------------------------------------------------

export function hasPendingImageIntakeResolution(session: AssistantSession): boolean {
  const p = session.pendingImageIntakeResolution;
  if (!p) return false;
  if (isPendingImageIntakeResolutionExpired(p)) {
    clearPendingImageIntakeResolution(session);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Public: attempt to resume the pending intake with the user's text input
// ---------------------------------------------------------------------------

export async function resumeImageIntakeWithClientResolution(
  userMessage: string,
  session: AssistantSession,
  tenantId: string,
): Promise<AssistantResponse> {
  const pending = session.pendingImageIntakeResolution!;

  // Guard: expired or message does not look like a name
  if (isPendingImageIntakeResolutionExpired(pending)) {
    clearPendingImageIntakeResolution(session);
    return expiredResponse(session.sessionId);
  }

  const extractedName = parseExplicitClientNameFromText(userMessage);
  if (!looksLikeClientNameInput(userMessage) && !extractedName) {
    // The message looks like a new chat query — do NOT consume the pending state.
    // Return a sentinel so the caller knows to fall through to the text router.
    return fallThroughSentinel(session.sessionId);
  }

  const queryForCrm = (extractedName ?? userMessage).trim();
  const resolution = await resolveClientFromText(tenantId, queryForCrm, pending.candidates);

  if (resolution.state === "not_found") {
    // Keep the pending state active so the user can try again
    return clientNotFoundResponse(session.sessionId, userMessage, pending);
  }

  if (resolution.state === "multiple") {
    // Update candidate list so next attempt only needs to pick among these
    session.pendingImageIntakeResolution = {
      ...pending,
      candidates: resolution.candidates,
      bindingState: "multiple_candidates",
    };
    return multipleMatchesResponse(session.sessionId, resolution.candidates, pending);
  }

  // ---- resolved ----
  lockAssistantClient(session, resolution.clientId);
  clearPendingImageIntakeResolution(session);

  // Zahoď případný starý plán z jiného tahu (jinak by se v UI sloučil s touto odpovědí).
  session.lastExecutionPlan = undefined;
  const executionPlan = buildExecutionPlanAfterIntakeResume(
    pending.intakeId,
    pending,
    resolution.clientId,
    resolution.clientLabel,
  );
  if (executionPlan) {
    session.lastExecutionPlan = executionPlan;
  }

  return buildResumedResponse(
    session.sessionId,
    resolution.clientId,
    resolution.clientLabel,
    pending,
    executionPlan,
  );
}

// ---------------------------------------------------------------------------
// Sentinel value — signals the caller to fall through to the text router
// ---------------------------------------------------------------------------

export const INTAKE_RESUME_FALLTHROUGH = "__intake_resume_fallthrough__";

function fallThroughSentinel(sessionId: string): AssistantResponse {
  return {
    message: INTAKE_RESUME_FALLTHROUGH,
    referencedEntities: [],
    suggestedActions: [],
    warnings: [],
    confidence: 0,
    sourcesSummary: [],
    sessionId,
    executionState: null,
    contextState: null,
  };
}

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

function expiredResponse(sessionId: string): AssistantResponse {
  return {
    message:
      "Předchozí zpracování obrázku vypršelo (15 min). Nahrajte obrázek znovu, abychom mohli pokračovat.",
    referencedEntities: [],
    suggestedActions: [],
    warnings: ["pending_intake_expired"],
    confidence: 0,
    sourcesSummary: ["image_intake_resume"],
    sessionId,
    executionState: null,
    contextState: null,
  };
}

function clientNotFoundResponse(
  sessionId: string,
  userInput: string,
  pending: PendingImageIntakeResolution,
): AssistantResponse {
  return {
    message: `Klienta „${userInput}" jsem v CRM nenašel. Zkuste jiné jméno nebo otevřete kartu klienta a nahrajte obrázek znovu.`,
    referencedEntities: [],
    suggestedActions: [],
    warnings: [`crm_no_match: "${userInput}"`],
    confidence: 0,
    sourcesSummary: ["image_intake_resume"],
    sessionId,
    executionState: null,
    contextState: null,
    suggestedNextSteps: [
      "Zkontrolujte pravopis jména.",
      "Otevřete kartu klienta a nahrajte obrázek znovu.",
    ],
    hasPartialFailure: false,
  } as AssistantResponse;
}

function multipleMatchesResponse(
  sessionId: string,
  candidates: Array<{ id: string; label: string }>,
  pending: PendingImageIntakeResolution,
): AssistantResponse {
  const list = candidates.map((c) => `• ${c.label}`).join("\n");
  return {
    message: `Nalezl jsem více klientů odpovídajících tomuto jménu. Upřesněte, o kterého jde:\n\n${list}`,
    referencedEntities: [],
    suggestedActions: [],
    warnings: [],
    confidence: 0,
    sourcesSummary: ["image_intake_resume"],
    sessionId,
    executionState: null,
    contextState: null,
    suggestedNextSteps: ["Napište celé jméno nebo vyberte klienta z karty."],
    hasPartialFailure: false,
  } as AssistantResponse;
}

function buildUnderstandingSummaryLine(
  pending: PendingImageIntakeResolution,
  factLines: string[],
): string | null {
  if (factLines.length > 0) {
    const snippet = factLines
      .slice(0, 3)
      .map((l) => l.replace(/^[^:]+:\s*/, "").trim())
      .filter(Boolean)
      .join(" ");
    if (snippet) {
      return `Ze screenshotu chápu zejména toto: ${snippet.slice(0, 280)}${snippet.length > 280 ? "…" : ""}`;
    }
  }
  if (pending.inputType === "screenshot_client_communication") {
    return "Jde o klientskou komunikaci — níže jsou body k uložení a navrhované kroky v CRM.";
  }
  if (pending.inputType === "screenshot_payment_details" || pending.inputType === "screenshot_bank_or_finance_info") {
    return "Jde o platební nebo bankovní údaje — ověřte částky a údaje proti dokladům.";
  }
  if (pending.inputType === "photo_or_scan_document") {
    return "Jde o dokument nebo sken — zkontrolujte přepis proti originálu.";
  }
  return null;
}

function buildResumedResponse(
  sessionId: string,
  clientId: string,
  clientLabel: string,
  pending: PendingImageIntakeResolution,
  executionPlan: ExecutionPlan | null,
): AssistantResponse {
  const factLines = buildFactsSummaryLines(pending.factBundle, 5);
  const understanding = buildUnderstandingSummaryLine(pending, factLines);

  const parts: string[] = [`Klient přiřazen: **${clientLabel}**.`];
  if (understanding) {
    parts.push("", understanding);
  }
  if (factLines.length > 0) {
    parts.push("", "Co z obrázku vyplynulo:", ...factLines.map((l) => `• ${l}`));
  }
  if (executionPlan && executionPlan.steps.length > 0) {
    parts.push("", "Níže vyberte navrhované kroky a potvrďte je — bez dalšího psaní příkazů.");
  } else {
    parts.push("", "Automatický návrh CRM kroků není k dispozici — uložte prosím informace ručně z karty klienta.");
  }

  const message = parts.join("\n");

  const suggestedNextSteps: string[] = [
    "Potvrďte návrh akcí zaškrtnutím a tlačítkem (pokud je zobrazen).",
    "Nebo upravte znění poznámky či úkolu před potvrzením.",
    "Zkontrolujte, že jde skutečně o správného klienta.",
  ];
  if (pending.factBundle.missingFields.length > 0) {
    suggestedNextSteps.push("Ověřte, zda v obrázku nechybí důležité údaje pro váš další postup.");
  }

  const executionState: AssistantResponse["executionState"] =
    executionPlan && executionPlan.steps.length > 0
      ? {
          status: "awaiting_confirmation",
          planId: executionPlan.planId,
          totalSteps: executionPlan.steps.length,
          pendingSteps: executionPlan.steps.filter((s) => s.status === "requires_confirmation").length,
          stepPreviews: mapToPreviewItems(executionPlan),
          clientLabel,
        }
      : null;

  return {
    message,
    referencedEntities: [{ type: "contact", id: clientId, label: clientLabel }],
    suggestedActions: [],
    warnings: [],
    confidence: 0.85,
    sourcesSummary: [`image_intake_resume (${pending.intakeId})`],
    sessionId,
    executionState,
    contextState: {
      channel: null,
      lockedClientId: clientId,
      lockedClientLabel: clientLabel,
    },
    suggestedNextSteps,
    hasPartialFailure: false,
  } as AssistantResponse;
}
