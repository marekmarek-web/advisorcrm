import type { PushNotificationSchema } from "@capacitor/push-notifications";

const FALLBACK_ROUTE = "/portal/today";

type NotificationData = Record<string, string | undefined>;

function pickId(data: NotificationData, keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

export function mapPushNotificationToRoute(notification: PushNotificationSchema): string {
  const data = (notification.data ?? {}) as NotificationData;
  const type = typeof data.type === "string" ? data.type : "";

  if (type === "NEW_LEAD") {
    const leadId = pickId(data, ["leadId", "opportunityId", "relatedEntityId"]);
    return leadId ? `/portal/pipeline/${encodeURIComponent(leadId)}` : "/portal/pipeline";
  }

  if (type === "NEW_DOCUMENT") {
    const contactId = pickId(data, ["contactId", "clientId"]);
    return contactId ? `/portal/contacts/${encodeURIComponent(contactId)}` : "/portal/today";
  }

  if (type === "CLIENT_REQUEST") {
    return "/portal/today";
  }

  if (type === "NEW_TASK") {
    return "/portal/today";
  }

  if (type === "REQUEST_STATUS_CHANGE") {
    const requestId = pickId(data, ["requestId", "relatedEntityId"]);
    return requestId ? `/portal/contracts/review/${encodeURIComponent(requestId)}` : "/portal/today";
  }

  if (type === "NEW_MESSAGE") {
    return "/portal/messages";
  }

  if (type === "REVIEW_WAITING") {
    const reviewId = pickId(data, ["reviewId", "relatedEntityId"]);
    return reviewId ? `/portal/contracts/review/${encodeURIComponent(reviewId)}` : "/portal/today";
  }

  if (type === "PAYMENT_BLOCKED") {
    const contactId = pickId(data, ["contactId", "relatedEntityId"]);
    return contactId ? `/portal/contacts/${encodeURIComponent(contactId)}#payments` : "/portal/today";
  }

  if (type === "REMINDER_DUE") {
    return "/portal/today";
  }

  if (type === "ESCALATION") {
    return "/portal/team-overview";
  }

  return FALLBACK_ROUTE;
}
