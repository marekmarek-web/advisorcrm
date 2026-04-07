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

import type { AssistantSession } from "../assistant-session";
import { lockAssistantClient, clearPendingImageIntakeResolution } from "../assistant-session";
import type { PendingImageIntakeResolution } from "../assistant-session";
import type { AssistantResponse } from "../assistant-tool-router";
import { searchContactsForAssistant } from "../assistant-contact-search";
import { buildFactsSummaryLines } from "./extractor";
import { isPendingImageIntakeResolutionExpired } from "./pending-resolution-metadata";

// ---------------------------------------------------------------------------
// Detect whether a text message looks like a client name attempt
// ---------------------------------------------------------------------------

/** Messages up to 80 chars with no "?" or verb-heavy structure are treated as name candidates. */
function looksLikeClientNameInput(text: string): boolean {
  const t = text.trim();
  if (t.length === 0 || t.length > 80) return false;
  // Avoid question marks and sentences that look like commands/questions (case-insensitive)
  const lower = t.toLowerCase();
  if (lower.includes("?") || lower.includes("vytvoř") || lower.includes("přidej") || lower.includes("smaž")) return false;
  return true;
}

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

  if (!looksLikeClientNameInput(userMessage)) {
    // The message looks like a new chat query — do NOT consume the pending state.
    // Return a sentinel so the caller knows to fall through to the text router.
    return fallThroughSentinel(session.sessionId);
  }

  const resolution = await resolveClientFromText(tenantId, userMessage, pending.candidates);

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

  return buildResumedResponse(session.sessionId, resolution.clientId, resolution.clientLabel, pending);
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

function buildResumedResponse(
  sessionId: string,
  clientId: string,
  clientLabel: string,
  pending: PendingImageIntakeResolution,
): AssistantResponse {
  const factLines = buildFactsSummaryLines(pending.factBundle, 5);
  const factText =
    factLines.length > 0
      ? `\n\nExtrahovaná fakta ze screenshotu:\n${factLines.map((l) => `• ${l}`).join("\n")}`
      : "";

  const inputTypeLabel =
    pending.inputType === "screenshot_client_communication"
      ? "screenshot klientské komunikace"
      : pending.inputType === "screenshot_payment_details"
        ? "platební screenshot"
        : pending.inputType === "screenshot_bank_or_finance_info"
          ? "bankovní screenshot"
          : "obrázek";

  const message =
    `Klient **${clientLabel}** identifikován. Navazuji na předchozí zpracování — rozpoznal jsem ${inputTypeLabel}.${factText}\n\nNavrhuji zaznamenat obsah a případně vytvořit úkol nebo poznámku.`;

  const suggestedNextSteps: string[] = [
    `Potvrďte přiřazení k ${clientLabel}.`,
    "Zkontrolujte extrahovaná fakta a potvrďte kroky.",
  ];
  if (pending.factBundle.missingFields.length > 0) {
    suggestedNextSteps.push(
      `Chybějící údaje: ${pending.factBundle.missingFields.slice(0, 3).join(", ")}.`,
    );
  }

  return {
    message,
    referencedEntities: [{ type: "contact", id: clientId, label: clientLabel }],
    suggestedActions: [],
    warnings: [],
    confidence: 0.8,
    sourcesSummary: [`image_intake_resume (${pending.intakeId})`],
    sessionId,
    executionState: null,
    contextState: {
      channel: null,
      lockedClientId: clientId,
      lockedClientLabel: clientLabel,
    },
    suggestedNextSteps,
    hasPartialFailure: false,
  } as AssistantResponse;
}
