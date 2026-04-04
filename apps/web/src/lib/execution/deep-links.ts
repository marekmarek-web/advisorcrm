/**
 * Deep link routing (Plan 6D.5).
 * Maps entity types to portal URLs.
 */

export function resolveDeepLink(entityType: string, entityId: string): string {
  switch (entityType) {
    case "review":
      return `/portal/contracts/review/${encodeURIComponent(entityId)}`;
    case "client":
    case "contact":
      return `/portal/contacts/${encodeURIComponent(entityId)}`;
    case "payment":
      return `/portal/contacts/${encodeURIComponent(entityId)}#payments`;
    case "opportunity":
      return `/portal/pipeline/${encodeURIComponent(entityId)}`;
    case "task":
      return `/portal/today`;
    case "draft":
      return `/portal/drafts/${encodeURIComponent(entityId)}`;
    case "escalation":
      return `/portal/team-overview`;
    case "reminder":
      return `/portal/today`;
    case "notification":
      return `/portal/today`;
    case "calendar_event":
      return `/portal/calendar`;
    case "document":
      return `/portal/today`;
    case "contract":
      return `/portal/today`;
    case "advisor_material_request":
      return `/portal/today`;
    default:
      return "/portal/today";
  }
}

export function buildActionCenterDeepLink(): string {
  return "/portal/action-center";
}

export function buildNotificationDeepLink(notificationId: string): string {
  return `/portal/notifications/${encodeURIComponent(notificationId)}`;
}
