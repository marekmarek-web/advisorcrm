"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db, notificationLog, contacts, eq, desc, sql } from "db";

export type NotificationRow = {
  id: string;
  channel: string;
  template: string | null;
  subject: string | null;
  recipient: string | null;
  status: string;
  contactName: string | null;
  sentAt: Date;
};

export async function getNotificationLog(limit = 50): Promise<NotificationRow[]> {
  const auth = await requireAuthInAction();

  const rows = await db
    .select({
      id: notificationLog.id,
      channel: notificationLog.channel,
      template: notificationLog.template,
      subject: notificationLog.subject,
      recipient: notificationLog.recipient,
      status: notificationLog.status,
      sentAt: notificationLog.sentAt,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
    })
    .from(notificationLog)
    .leftJoin(contacts, eq(notificationLog.contactId, contacts.id))
    .where(eq(notificationLog.tenantId, auth.tenantId))
    .orderBy(desc(notificationLog.sentAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    template: r.template,
    subject: r.subject,
    recipient: r.recipient,
    status: r.status,
    contactName:
      r.contactFirstName && r.contactLastName
        ? `${r.contactFirstName} ${r.contactLastName}`
        : null,
    sentAt: r.sentAt,
  }));
}
