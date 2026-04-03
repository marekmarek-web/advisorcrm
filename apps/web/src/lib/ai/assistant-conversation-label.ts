/**
 * Shared list-row label for advisor AI assistant conversation picker (drawer + mobile).
 */

export type AdvisorAssistantConversationListLabelInput = {
  updatedAtIso: string;
  channel: string | null;
  lockedContactLabel: string | null;
  displayTitle: string | null;
};

/** Max length for custom displayTitle (metadata); keep in sync with repository slice. */
export const ASSISTANT_CONVERSATION_DISPLAY_TITLE_MAX_LEN = 80;

/**
 * Priority: user displayTitle → locked client name + time + channel → time + channel (legacy).
 */
export function formatAdvisorAssistantConversationListLabel(
  c: AdvisorAssistantConversationListLabelInput,
): string {
  const d = new Date(c.updatedAtIso);
  const when = Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" });
  const ch = c.channel?.replace(/_/g, " ") ?? "konverzace";

  const custom = c.displayTitle?.trim();
  if (custom) {
    return `${custom} · ${when}`;
  }

  const client = c.lockedContactLabel?.trim();
  if (client) {
    return `${client} · ${when} · ${ch}`;
  }

  return `${when} · ${ch}`;
}
