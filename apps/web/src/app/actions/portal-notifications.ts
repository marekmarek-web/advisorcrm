"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db } from "db";
import { portalNotifications } from "db";
import { eq, and, desc, isNull, sql } from "db";
import { sendPushForPortalNotification } from "@/lib/push/send";

export type PortalNotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  readAt: Date | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdAt: Date;
};

/** Pro klienta: seznam notifikací (vlastní contactId). */
export async function getPortalNotificationsForClient(): Promise<
  PortalNotificationRow[]
> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId) return [];

  const rows = await db
    .select({
      id: portalNotifications.id,
      type: portalNotifications.type,
      title: portalNotifications.title,
      body: portalNotifications.body,
      readAt: portalNotifications.readAt,
      relatedEntityType: portalNotifications.relatedEntityType,
      relatedEntityId: portalNotifications.relatedEntityId,
      createdAt: portalNotifications.createdAt,
    })
    .from(portalNotifications)
    .where(
      and(
        eq(portalNotifications.tenantId, auth.tenantId),
        eq(portalNotifications.contactId, auth.contactId)
      )
    )
    .orderBy(desc(portalNotifications.createdAt))
    .limit(50);

  return rows as PortalNotificationRow[];
}

/** Počet nepřečtených pro klienta — 5C: SQL count místo full-row select. */
export async function getPortalNotificationsUnreadCount(): Promise<number> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId) return 0;

  const [result] = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(portalNotifications)
    .where(
      and(
        eq(portalNotifications.tenantId, auth.tenantId),
        eq(portalNotifications.contactId, auth.contactId),
        isNull(portalNotifications.readAt)
      )
    );
  return Number(result?.cnt ?? 0);
}

/** Označit notifikaci jako přečtenou (pouze vlastní). */
export async function markPortalNotificationRead(
  notificationId: string
): Promise<void> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId) return;

  await db
    .update(portalNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(portalNotifications.tenantId, auth.tenantId),
        eq(portalNotifications.contactId, auth.contactId),
        eq(portalNotifications.id, notificationId)
      )
    );
}

/** Vytvořit notifikaci pro kontakt (volá CRM při nové zprávě, novém dokumentu, změně stavu). */
export async function createPortalNotification(params: {
  tenantId: string;
  contactId: string;
  type:
    | "new_message"
    | "request_status_change"
    | "new_document"
    | "important_date"
    | "advisor_material_request";
  title: string;
  body?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  /**
   * When > 0 (default: 5 if `relatedEntityId` is set, else 0), skips insert if an
   * unread row already exists for the same tenant, contact, `type`, and `relatedEntityId`.
   * Pass `0` to force insert even when a duplicate unread exists.
   */
  dedupWindowMinutes?: number;
}): Promise<void> {
  // 5C: Dedup — skip if an unread notification already exists for same type + entity
  const dedupMinutes = params.dedupWindowMinutes ?? (params.relatedEntityId ? 5 : 0);
  if (dedupMinutes > 0 && params.relatedEntityId) {
    const [existing] = await db
      .select({ id: portalNotifications.id })
      .from(portalNotifications)
      .where(
        and(
          eq(portalNotifications.tenantId, params.tenantId),
          eq(portalNotifications.contactId, params.contactId),
          eq(portalNotifications.type, params.type),
          eq(portalNotifications.relatedEntityId, params.relatedEntityId),
          isNull(portalNotifications.readAt),
        )
      )
      .limit(1);
    if (existing && existing.id) {
      // Recent unread notification for same entity already exists — skip
      return;
    }
  }

  await db.insert(portalNotifications).values({
    tenantId: params.tenantId,
    contactId: params.contactId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    relatedEntityType: params.relatedEntityType ?? null,
    relatedEntityId: params.relatedEntityId ?? null,
  });

  await sendPushForPortalNotification({
    tenantId: params.tenantId,
    contactId: params.contactId,
    type: params.type,
    title: params.title,
    body: params.body,
    relatedEntityId: params.relatedEntityId,
  });
}
