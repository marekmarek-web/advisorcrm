/** Operativní štítek inboxu poradce (uloženo v opportunities.customFields). */
export const ADVISOR_PORTAL_HANDLING_KEY = "client_portal_advisor_handling" as const;

export type AdvisorPortalRequestHandling = "waiting" | "resolved";

export function parseAdvisorPortalHandling(
  custom: Record<string, unknown>
): AdvisorPortalRequestHandling | null {
  const v = custom[ADVISOR_PORTAL_HANDLING_KEY];
  if (v === "waiting" || v === "resolved") return v;
  return null;
}
