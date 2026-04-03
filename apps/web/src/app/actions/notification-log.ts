"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db, notificationLog, contacts, eq, desc, and, gte, sql, like } from "db";
import type { RoleName } from "@/shared/rolePermissions";
import { hasPermission } from "@/shared/rolePermissions";

export type NotificationRow = {
  id: string;
  channel: string;
  template: string | null;
  subject: string | null;
  recipient: string | null;
  status: string;
  contactName: string | null;
  contactId: string | null;
  meta: Record<string, unknown> | null;
  sentAt: Date;
};

export type NotificationLogFilter = {
  status?: string;
  channel?: string;
  since?: Date;
  search?: string;
  limit?: number;
};

export async function getNotificationLog(limitOrFilter: number | NotificationLogFilter = 50): Promise<NotificationRow[]> {
  const auth = await requireAuthInAction();
  const filter: NotificationLogFilter = typeof limitOrFilter === "number" ? { limit: limitOrFilter } : limitOrFilter;
  const limit = filter.limit ?? 50;

  const conditions = [eq(notificationLog.tenantId, auth.tenantId)];
  if (filter.status) conditions.push(eq(notificationLog.status, filter.status));
  if (filter.channel) conditions.push(eq(notificationLog.channel, filter.channel));
  if (filter.since) conditions.push(gte(notificationLog.sentAt, filter.since));
  if (filter.search) {
    const q = `%${filter.search}%`;
    conditions.push(
      sql`(${notificationLog.subject} ilike ${q} or ${notificationLog.recipient} ilike ${q} or ${notificationLog.template} ilike ${q})`
    );
  }

  const rows = await db
    .select({
      id: notificationLog.id,
      channel: notificationLog.channel,
      template: notificationLog.template,
      subject: notificationLog.subject,
      recipient: notificationLog.recipient,
      status: notificationLog.status,
      contactId: notificationLog.contactId,
      meta: notificationLog.meta,
      sentAt: notificationLog.sentAt,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
    })
    .from(notificationLog)
    .leftJoin(contacts, eq(notificationLog.contactId, contacts.id))
    .where(and(...conditions))
    .orderBy(desc(notificationLog.sentAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    template: r.template,
    subject: r.subject,
    recipient: r.recipient,
    status: r.status,
    contactId: r.contactId ?? null,
    meta: (r.meta as Record<string, unknown> | null) ?? null,
    contactName:
      r.contactFirstName && r.contactLastName
        ? `${r.contactFirstName} ${r.contactLastName}`
        : null,
    sentAt: r.sentAt,
  }));
}

export async function getNotificationLogStats(): Promise<{ sent: number; failed: number; pending: number; total: number }> {
  const auth = await requireAuthInAction();
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const rows = await db
    .select({ status: notificationLog.status, c: sql<number>`count(*)::int` })
    .from(notificationLog)
    .where(and(eq(notificationLog.tenantId, auth.tenantId), gte(notificationLog.sentAt, since)))
    .groupBy(notificationLog.status);

  const map = Object.fromEntries(rows.map((r) => [r.status, Number(r.c)]));
  const total = rows.reduce((s, r) => s + Number(r.c), 0);
  return { sent: map["sent"] ?? 0, failed: map["failed"] ?? 0, pending: map["pending"] ?? 0, total };
}

/** Počet notifikací za posledních 7 dní; pro badge u zvonečku v headeru. */
export async function getNotificationBadgeCount(): Promise<number> {
  const auth = await requireAuthInAction();
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.tenantId, auth.tenantId),
        gte(notificationLog.sentAt, since)
      )
    );
  return Number(row?.c ?? 0);
}
