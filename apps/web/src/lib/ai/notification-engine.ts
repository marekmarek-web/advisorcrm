/**
 * Notification engine (Plan 5C.4).
 * Aggregates priority items and follow-up suggestions into notification items with dedup.
 */

import type { UrgentItem } from "./dashboard-types";
import type { FollowUpSuggestion } from "./followup-recommendations";

export type NotificationType =
  | "review_waiting_too_long"
  | "payment_setup_blocked"
  | "missing_data_followup_needed"
  | "client_needs_attention"
  | "overdue_task_warning"
  | "communication_draft_ready"
  | "apply_ready_item"
  | "quality_issue_detected";

export type NotificationSeverity = "high" | "medium" | "low";

export type NotificationItem = {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  description: string;
  entityLinks: { type: string; id: string }[];
  suggestedAction?: string;
  dueHint?: string;
  reasonCodes: string[];
  dismissed: boolean;
  snoozedUntil?: number;
};

function mapUrgentToNotification(item: UrgentItem): NotificationItem | null {
  if (item.type === "task") {
    return {
      type: "overdue_task_warning",
      severity: item.severity,
      title: item.title,
      description: item.description,
      entityLinks: [{ type: "task", id: item.entityId }],
      suggestedAction: item.recommendedAction,
      reasonCodes: ["TASK_OVERDUE"],
      dismissed: false,
    };
  }
  if (item.type === "review") {
    return {
      type: "review_waiting_too_long",
      severity: item.severity,
      title: item.title,
      description: item.description,
      entityLinks: [{ type: "review", id: item.entityId }],
      suggestedAction: item.recommendedAction,
      reasonCodes: ["REVIEW_PENDING"],
      dismissed: false,
    };
  }
  if (item.type === "client") {
    return {
      type: "client_needs_attention",
      severity: item.severity,
      title: item.title,
      description: item.description,
      entityLinks: [{ type: "client", id: item.entityId }],
      suggestedAction: item.recommendedAction,
      reasonCodes: ["CLIENT_ATTENTION"],
      dismissed: false,
    };
  }
  return null;
}

function mapFollowUpToNotification(suggestion: FollowUpSuggestion): NotificationItem {
  const typeMap: Record<string, NotificationType> = {
    review_waiting_too_long: "review_waiting_too_long",
    payment_setup_blocked: "payment_setup_blocked",
    client_no_followup: "client_needs_attention",
    change_document_unresolved: "quality_issue_detected",
    apply_candidate_ready: "apply_ready_item",
  };

  return {
    type: typeMap[suggestion.type] ?? "quality_issue_detected",
    severity: suggestion.severity,
    title: suggestion.title,
    description: suggestion.description,
    entityLinks: suggestion.entityLinks,
    suggestedAction: suggestion.suggestedAction,
    dueHint: suggestion.dueHint,
    reasonCodes: suggestion.reasonCodes,
    dismissed: false,
  };
}

export function generateNotificationItems(
  urgentItems: UrgentItem[],
  followUpSuggestions: FollowUpSuggestion[],
): NotificationItem[] {
  const seen = new Set<string>();
  const items: NotificationItem[] = [];

  for (const suggestion of followUpSuggestions) {
    const notification = mapFollowUpToNotification(suggestion);
    const key = `${notification.type}:${notification.entityLinks[0]?.id ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      items.push(notification);
    }
  }

  for (const urgent of urgentItems) {
    const notification = mapUrgentToNotification(urgent);
    if (!notification) continue;
    const key = `${notification.type}:${urgent.entityId}`;
    if (!seen.has(key)) {
      seen.add(key);
      items.push(notification);
    }
  }

  return items.sort((a, b) => {
    const sevOrder = { high: 0, medium: 1, low: 2 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  });
}
