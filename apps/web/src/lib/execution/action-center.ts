/**
 * Action center model (Plan 6D.1).
 * Unified pending-actions surface for web and mobile.
 */

export type ActionCenterItemType =
  | "approval_pending" | "reminder_due" | "blocked_item"
  | "draft_awaiting" | "review_waiting" | "escalation";

export type QuickAction = {
  actionType: string;
  label: string;
  requiresConfirmation: boolean;
};

export type ActionCenterItem = {
  id: string;
  type: ActionCenterItemType;
  title: string;
  description: string;
  severity: "info" | "warning" | "urgent";
  entityType: string;
  entityId: string;
  quickActions: QuickAction[];
  deepLink: string;
  createdAt: Date;
};

const SEVERITY_ORDER: Record<string, number> = { urgent: 0, warning: 1, info: 2 };

export function sortBySeverityAndDate(items: ActionCenterItem[]): ActionCenterItem[] {
  return [...items].sort((a, b) => {
    const sevDiff = (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2);
    if (sevDiff !== 0) return sevDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export function buildQuickActions(type: ActionCenterItemType): QuickAction[] {
  switch (type) {
    case "approval_pending":
      return [
        { actionType: "approve_draft", label: "Schválit", requiresConfirmation: true },
        { actionType: "open_detail", label: "Detail", requiresConfirmation: false },
      ];
    case "reminder_due":
      return [
        { actionType: "mark_done", label: "Hotovo", requiresConfirmation: false },
        { actionType: "snooze", label: "Odložit", requiresConfirmation: false },
      ];
    case "blocked_item":
      return [
        { actionType: "open_review", label: "Otevřít", requiresConfirmation: false },
      ];
    case "draft_awaiting":
      return [
        { actionType: "approve_draft", label: "Schválit", requiresConfirmation: true },
        { actionType: "edit_draft", label: "Upravit", requiresConfirmation: false },
      ];
    case "review_waiting":
      return [
        { actionType: "open_review", label: "Zkontrolovat", requiresConfirmation: false },
      ];
    case "escalation":
      return [
        { actionType: "acknowledge", label: "Přijmout", requiresConfirmation: true },
        { actionType: "open_detail", label: "Detail", requiresConfirmation: false },
      ];
    default:
      return [];
  }
}

export function resolveDeepLinkForItem(entityType: string, entityId: string): string {
  switch (entityType) {
    case "review": return `/portal/contracts/review/${encodeURIComponent(entityId)}`;
    case "client":
    case "contact": return `/portal/contacts/${encodeURIComponent(entityId)}`;
    case "payment": return `/portal/contacts/${encodeURIComponent(entityId)}#payments`;
    case "escalation": return `/portal/team-overview`;
    default: return "/portal/today";
  }
}

export async function getActionCenterItems(
  tenantId: string,
  userId: string,
): Promise<ActionCenterItem[]> {
  const items: ActionCenterItem[] = [];

  try {
    const { db, reminders, advisorNotifications, escalationEvents, eq, and } = await import("db");

    const pendingReminders = await db.select().from(reminders)
      .where(and(eq(reminders.tenantId, tenantId), eq(reminders.assignedTo, userId), eq(reminders.status, "pending")))
      .limit(50);

    for (const r of pendingReminders) {
      items.push({
        id: `ac_rem_${r.id}`,
        type: "reminder_due",
        title: r.title,
        description: r.description ?? "",
        severity: r.severity === "critical" ? "urgent" : r.severity === "high" ? "warning" : "info",
        entityType: r.relatedEntityType ?? "reminder",
        entityId: r.relatedEntityId ?? r.id,
        quickActions: buildQuickActions("reminder_due"),
        deepLink: `/portal/today`,
        createdAt: r.createdAt,
      });
    }

    const unread = await db.select().from(advisorNotifications)
      .where(and(eq(advisorNotifications.tenantId, tenantId), eq(advisorNotifications.targetUserId, userId), eq(advisorNotifications.status, "unread")))
      .limit(50);

    for (const n of unread) {
      const itemType: ActionCenterItemType =
        n.type === "escalation" ? "escalation" :
        n.type === "review_waiting" ? "review_waiting" :
        n.type === "payment_blocked" ? "blocked_item" :
        "review_waiting";

      items.push({
        id: `ac_notif_${n.id}`,
        type: itemType,
        title: n.title,
        description: n.body ?? "",
        severity: n.severity === "urgent" ? "urgent" : n.severity === "warning" ? "warning" : "info",
        entityType: n.relatedEntityType ?? "notification",
        entityId: n.relatedEntityId ?? n.id,
        quickActions: buildQuickActions(itemType),
        deepLink: `/portal/today`,
        createdAt: n.createdAt,
      });
    }

    const pendingEscalations = await db.select().from(escalationEvents)
      .where(and(eq(escalationEvents.tenantId, tenantId), eq(escalationEvents.escalatedTo, userId), eq(escalationEvents.status, "pending")))
      .limit(20);

    for (const e of pendingEscalations) {
      items.push({
        id: `ac_esc_${e.id}`,
        type: "escalation",
        title: `Eskalace: ${e.policyCode}`,
        description: e.triggerReason,
        severity: "urgent",
        entityType: e.entityType,
        entityId: e.entityId,
        quickActions: buildQuickActions("escalation"),
        deepLink: `/portal/team-overview`,
        createdAt: e.createdAt,
      });
    }
  } catch { /* best-effort aggregation */ }

  return sortBySeverityAndDate(items);
}
