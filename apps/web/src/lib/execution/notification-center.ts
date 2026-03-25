/**
 * Notification center (Plan 6B.2).
 * Unified advisor-facing notification surface.
 */

export type NotificationSeverity = "info" | "warning" | "urgent";
export type NotificationStatus = "unread" | "read" | "dismissed" | "archived";
export type NotificationChannel = "in_app" | "push" | "email_digest";

export type NotificationItem = {
  id: string;
  tenantId: string;
  type: string;
  title: string;
  body: string;
  severity: NotificationSeverity;
  targetUserId: string;
  channels: NotificationChannel[];
  relatedEntityType?: string;
  relatedEntityId?: string;
  status: NotificationStatus;
  groupKey?: string;
  createdAt: Date;
  readAt?: Date;
  dismissedAt?: Date;
};

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;
const recentGroupKeys = new Map<string, number>();

export function isDuplicate(groupKey: string | undefined): boolean {
  if (!groupKey) return false;
  const last = recentGroupKeys.get(groupKey);
  return !!last && Date.now() - last < DEDUP_WINDOW_MS;
}

function recordGroupKey(groupKey: string | undefined): void {
  if (groupKey) recentGroupKeys.set(groupKey, Date.now());
}

export function clearNotificationDedupStore(): void {
  recentGroupKeys.clear();
}

export async function emitNotification(
  item: Omit<NotificationItem, "id" | "status" | "createdAt">,
): Promise<NotificationItem | null> {
  if (isDuplicate(item.groupKey)) return null;

  const notification: NotificationItem = {
    ...item,
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    status: "unread",
    createdAt: new Date(),
  };

  recordGroupKey(item.groupKey);

  try {
    const { db, advisorNotifications } = await import("db");
    await db.insert(advisorNotifications).values({
      tenantId: notification.tenantId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      severity: notification.severity,
      targetUserId: notification.targetUserId,
      channels: notification.channels,
      relatedEntityType: notification.relatedEntityType,
      relatedEntityId: notification.relatedEntityId,
      status: notification.status,
      groupKey: notification.groupKey,
    });
  } catch { /* best-effort persist */ }

  if (notification.channels.includes("push")) {
    try {
      const { sendPushToUser } = await import("@/lib/push/send");
      await sendPushToUser({
        type: mapNotificationTypeToPushType(notification.type),
        title: notification.title,
        body: notification.body,
        tenantId: notification.tenantId,
        userId: notification.targetUserId,
        data: notification.relatedEntityId ? { relatedEntityId: notification.relatedEntityId } : undefined,
      });
    } catch { /* push delivery is best-effort */ }
  }

  return notification;
}

function mapNotificationTypeToPushType(type: string): string {
  const mapping: Record<string, string> = {
    review_waiting: "REVIEW_WAITING",
    payment_blocked: "PAYMENT_BLOCKED",
    reminder_due: "REMINDER_DUE",
    escalation: "ESCALATION",
  };
  return mapping[type] ?? "CLIENT_REQUEST";
}

export async function markNotificationRead(
  notificationId: string,
  tenantId: string,
): Promise<boolean> {
  try {
    const { db, advisorNotifications, eq, and } = await import("db");
    await db.update(advisorNotifications).set({
      status: "read",
      readAt: new Date(),
    }).where(and(
      eq(advisorNotifications.id, notificationId),
      eq(advisorNotifications.tenantId, tenantId),
    ));
    return true;
  } catch {
    return false;
  }
}

export async function dismissNotification(
  notificationId: string,
  tenantId: string,
): Promise<boolean> {
  try {
    const { db, advisorNotifications, eq, and } = await import("db");
    await db.update(advisorNotifications).set({
      status: "dismissed",
      dismissedAt: new Date(),
    }).where(and(
      eq(advisorNotifications.id, notificationId),
      eq(advisorNotifications.tenantId, tenantId),
    ));
    return true;
  } catch {
    return false;
  }
}

export function bundleNotifications(
  items: NotificationItem[],
): { groups: Map<string, NotificationItem[]>; singles: NotificationItem[] } {
  const groups = new Map<string, NotificationItem[]>();
  const singles: NotificationItem[] = [];

  for (const item of items) {
    if (item.groupKey) {
      const key = item.type;
      const existing = groups.get(key) ?? [];
      existing.push(item);
      groups.set(key, existing);
    } else {
      singles.push(item);
    }
  }

  return { groups, singles };
}
