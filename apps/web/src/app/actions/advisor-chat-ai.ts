"use server";

import { loadAdvisorChatAiBundle } from "@/lib/advisor-chat/load-advisor-chat-ai-bundle";
import { getOpenAIAdvisorChatProvider } from "@/lib/advisor-chat/openai-advisor-chat-provider";
import type { AdvisorChatAiSummary } from "@/lib/advisor-chat/advisor-chat-ai-types";

function humanError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export type AdvisorChatAiSummaryResult =
  | { ok: true; summary: AdvisorChatAiSummary }
  | { ok: false; error: string };

export type AdvisorChatAiDraftResult = { ok: true; draft: string } | { ok: false; error: string };

/** Stručný AI souhrn pro pravý panel (Fáze 5). */
export async function generateAdvisorChatContextSummary(contactId: string): Promise<AdvisorChatAiSummaryResult> {
  try {
    const bundle = await loadAdvisorChatAiBundle(contactId);
    if (!bundle) return { ok: false, error: "Kontext se nepodařilo načíst nebo k němu nemáte přístup." };
    const provider = getOpenAIAdvisorChatProvider();
    const summary = await provider.generateContextSummary(bundle);
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, error: humanError(e) };
  }
}

/** Návrh odpovědi pro poradce — vždy jen draft, nic se neodesílá. */
export async function generateAdvisorChatReplyDraft(
  contactId: string,
  options?: { variantHint?: string },
): Promise<AdvisorChatAiDraftResult> {
  try {
    const bundle = await loadAdvisorChatAiBundle(contactId);
    if (!bundle) return { ok: false, error: "Kontext se nepodařilo načíst nebo k němu nemáte přístup." };
    const provider = getOpenAIAdvisorChatProvider();
    const draft = await provider.generateReplyDraft(bundle, { variantHint: options?.variantHint });
    return { ok: true, draft };
  } catch (e) {
    return { ok: false, error: humanError(e) };
  }
}
