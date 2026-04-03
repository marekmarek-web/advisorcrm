"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import {
  listAssistantConversationsForUser,
  loadAssistantConversationHistoryMessagesForUser,
  patchAssistantConversationDisplayTitleForUser,
} from "@/lib/ai/assistant-conversation-repository";
import {
  mapAssistantHistoryRowsToClientPayload,
  type AdvisorAssistantHistoryMessageDto,
} from "@/lib/ai/assistant-history-mapper";

export type AdvisorAssistantConversationListItemDto = {
  id: string;
  channel: string | null;
  lockedContactId: string | null;
  lockedContactLabel: string | null;
  displayTitle: string | null;
  updatedAtIso: string;
  createdAtIso: string;
};

function assertAdvisorRole(roleName: string): void {
  if (roleName === "Client") {
    throw new Error("Forbidden");
  }
}

/** Seznam konverzací poradce za posledních 7 dní (max 40). */
export async function listAdvisorAssistantConversations(): Promise<AdvisorAssistantConversationListItemDto[]> {
  const auth = await requireAuthInAction();
  assertAdvisorRole(auth.roleName);
  const rows = await listAssistantConversationsForUser(auth.tenantId, auth.userId, {
    since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    limit: 40,
  });
  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    lockedContactId: r.lockedContactId,
    lockedContactLabel: r.lockedContactLabel,
    displayTitle: r.displayTitle,
    updatedAtIso: r.updatedAt.toISOString(),
    createdAtIso: r.createdAt.toISOString(),
  }));
}

export type RenameAdvisorAssistantConversationResult =
  | { ok: true }
  | { ok: false; error: string };

/** Nastaví vlastní název vlákna (metadata.displayTitle) nebo ho smaže při prázdném řetězci / null. */
export async function renameAdvisorAssistantConversation(
  conversationId: string,
  title: string | null,
): Promise<RenameAdvisorAssistantConversationResult> {
  const auth = await requireAuthInAction();
  assertAdvisorRole(auth.roleName);
  const id = conversationId.trim();
  if (!id) {
    return { ok: false, error: "Chybí ID konverzace." };
  }
  const t = title?.trim() ?? "";
  return patchAssistantConversationDisplayTitleForUser(id, auth.tenantId, auth.userId, t === "" ? null : t);
}

export type LoadAdvisorAssistantHistoryResult =
  | { ok: true; messages: AdvisorAssistantHistoryMessageDto[] }
  | { ok: false; error: string };

/** Načte historii zpráv pro danou konverzaci (ověření tenant + user). */
export async function loadAdvisorAssistantConversationHistory(
  conversationId: string,
): Promise<LoadAdvisorAssistantHistoryResult> {
  const auth = await requireAuthInAction();
  assertAdvisorRole(auth.roleName);
  const trimmed = conversationId.trim();
  if (!trimmed) {
    return { ok: false, error: "Chybí ID konverzace." };
  }
  const { conversation, messages } = await loadAssistantConversationHistoryMessagesForUser(
    trimmed,
    auth.tenantId,
    auth.userId,
    60,
  );
  if (!conversation) {
    return { ok: false, error: "Konverzace nenalezena." };
  }
  const payload = mapAssistantHistoryRowsToClientPayload(messages, conversation);
  return { ok: true, messages: payload };
}
