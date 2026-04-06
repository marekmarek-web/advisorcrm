/**
 * AI Photo / Image Intake — preview-only draft reply v1 (Phase 3).
 *
 * Generates a short, neutral draft reply preview ONLY for:
 * - screenshot_client_communication
 * - confident client binding
 * - clear intent from extracted facts
 * - output mode = client_message_update
 *
 * This is PREVIEW-ONLY. Never auto-sends. Never bypasses confirm/review.
 * Advisor must explicitly confirm before anything is sent or recorded.
 */

import type { ExtractedFactBundle, ClientBindingResult, ImageInputType } from "./types";

// ---------------------------------------------------------------------------
// Safety checks — all conditions must hold
// ---------------------------------------------------------------------------

export type DraftReplyEligibility = {
  eligible: boolean;
  reason: string;
};

export function checkDraftReplyEligibility(
  inputType: ImageInputType,
  binding: ClientBindingResult,
  factBundle: ExtractedFactBundle,
  draftReplyIntent: string | null,
): DraftReplyEligibility {
  if (inputType !== "screenshot_client_communication") {
    return { eligible: false, reason: "Není screenshot komunikace — draft reply se nevytváří." };
  }

  if (
    binding.state !== "bound_client_confident" &&
    binding.state !== "bound_case_confident"
  ) {
    return {
      eligible: false,
      reason: `Klient není jistě identifikován (${binding.state}) — draft reply vyžaduje bezpečnou vazbu.`,
    };
  }

  const hasUsableIntent = Boolean(draftReplyIntent?.trim()) ||
    factBundle.facts.some((f) => ["what_client_wants", "required_follow_up"].includes(f.factKey) && f.value);

  if (!hasUsableIntent) {
    return { eligible: false, reason: "Záměr z obrázku není dostatečně zřejmý pro draft reply." };
  }

  return { eligible: true, reason: "Podmínky pro draft reply jsou splněny." };
}

// ---------------------------------------------------------------------------
// Draft reply builder
// ---------------------------------------------------------------------------

const DRAFT_REPLY_PREFIX = "Dobrý den,\n\n";
const DRAFT_REPLY_SUFFIX = "\n\nS pozdravem\n[Váš poradce]";

/**
 * Builds a conservative, neutral draft reply preview.
 * Based on extracted facts from the communication screenshot.
 * ALWAYS returns preview-only text — never executes anything.
 */
export function buildDraftReplyPreview(
  factBundle: ExtractedFactBundle,
  draftReplyIntent: string | null,
  clientLabel: string | null,
): string | null {
  const clientGreeting = clientLabel ? `vážený/á ${clientLabel},` : "přeji Vám hezký den,";

  // Try to build body from extracted facts
  const followUpFact = factBundle.facts.find((f) => f.factKey === "required_follow_up");
  const wantsFact = factBundle.facts.find((f) => f.factKey === "what_client_wants");

  const bodyLines: string[] = [];

  if (wantsFact?.value) {
    bodyLines.push(`Přijal/a jsem Vaši zprávu ohledně: ${String(wantsFact.value).slice(0, 200)}`);
  } else if (draftReplyIntent?.trim()) {
    bodyLines.push(`Přijal/a jsem Vaši zprávu. ${draftReplyIntent.trim().slice(0, 200)}`);
  }

  if (followUpFact?.value) {
    bodyLines.push(`Budu se tím zabývat a dám Vám vědět: ${String(followUpFact.value).slice(0, 200)}`);
  } else {
    bodyLines.push("Brzy se Vám ozvu s dalším postupem.");
  }

  if (bodyLines.length === 0) return null;

  return `${DRAFT_REPLY_PREFIX}${clientGreeting}\n\n${bodyLines.join("\n\n")}${DRAFT_REPLY_SUFFIX}`;
}

/**
 * Returns draft reply text if eligible, null otherwise.
 * Safe wrapper combining eligibility check + builder.
 */
export function tryBuildDraftReply(
  inputType: ImageInputType,
  binding: ClientBindingResult,
  factBundle: ExtractedFactBundle,
  draftReplyIntent: string | null,
): string | null {
  const eligibility = checkDraftReplyEligibility(inputType, binding, factBundle, draftReplyIntent);
  if (!eligibility.eligible) return null;
  return buildDraftReplyPreview(factBundle, draftReplyIntent, binding.clientLabel);
}
