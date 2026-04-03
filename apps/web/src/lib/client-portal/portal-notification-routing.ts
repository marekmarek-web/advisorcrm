/**
 * Phase 5H — single deep-link map for portal notifications (web list, dashboard CTA, mobile).
 * Keep in sync with acceptance: bell / dashboard / notifications page must route identically.
 */
export function getPortalNotificationDeepLink(
  n: { type?: string | null; relatedEntityId?: string | null } | null
): string | null {
  if (!n?.type) return null;
  if (n.type === "new_message") return "/client/messages";
  if (n.type === "new_document") return "/client/documents";
  if (n.type === "advisor_material_request") {
    return n.relatedEntityId
      ? `/client/pozadavky-poradce/${n.relatedEntityId}`
      : "/client/pozadavky-poradce";
  }
  if (n.type === "request_status_change") return "/client/requests";
  if (n.type === "important_date") return "/client/portfolio";
  return null;
}
