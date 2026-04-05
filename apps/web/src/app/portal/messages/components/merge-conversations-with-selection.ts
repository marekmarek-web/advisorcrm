import type { ConversationListItem } from "@/app/actions/messages";

/** Kontakt vybraný přes „+“ ještě nemusí být v SQL seznamu (žádná zpráva) — doplníme řádek pro UI. */
export function mergeConversationsWithSelection(
  conversations: ConversationListItem[],
  selectedContactId: string | null,
  contactNameForSelection: string,
): ConversationListItem[] {
  if (!selectedContactId) return conversations;
  if (conversations.some((c) => c.contactId === selectedContactId)) return conversations;

  const label = contactNameForSelection.trim() || "Kontakt";
  const synthetic: ConversationListItem = {
    contactId: selectedContactId,
    contactName: label,
    lastMessage: "Nová konverzace — napište první zprávu",
    lastMessageAt: new Date().toISOString(),
    unreadCount: 0,
    unread: false,
  };

  return [synthetic, ...conversations].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}
