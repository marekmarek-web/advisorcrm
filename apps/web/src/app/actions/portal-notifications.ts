"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db } from "db";
import { portalNotifications } from "db";
import { eq, and, desc, isNull } from "db";

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

/** Počet nepřečtených pro klienta. */
export async function getPortalNotificationsUnreadCount(): Promise<number> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || !auth.contactId) return 0;

  const rows = await db
    .select({ id: portalNotifications.id })
    .from(portalNotifications)
    .where(
      and(
        eq(portalNotifications.tenantId, auth.tenantId),
        eq(portalNotifications.contactId, auth.contactId),
        isNull(portalNotifications.readAt)
      )
    );
  return rows.length;
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
  type: "new_message" | "request_status_change" | "new_document" | "important_date";
  title: string;
  body?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}): Promise<void> {
  await db.insert(portalNotifications).values({
    tenantId: params.tenantId,
    contactId: params.contactId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    relatedEntityType: params.relatedEntityType ?? null,
    relatedEntityId: params.relatedEntityId ?? null,
  });
}
