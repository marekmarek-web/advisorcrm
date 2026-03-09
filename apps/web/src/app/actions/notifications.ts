"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import { contacts } from "db";
import { eq, and, lte, isNotNull, isNull } from "db";
import { sendEmail } from "@/lib/email/send-email";
import { serviceReminderTemplate } from "@/lib/email/templates";

/**
 * Process service reminders: find contacts with upcoming/due service,
 * send email to advisor (and optionally client), log the result.
 * Returns count of emails attempted.
 */
export async function processServiceReminders(): Promise<{
  processed: number;
  sent: number;
  errors: string[];
}> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");

  const today = new Date().toISOString().slice(0, 10);

  const dueContacts = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      nextServiceDue: contacts.nextServiceDue,
      unsubscribed: contacts.notificationUnsubscribedAt,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.tenantId, auth.tenantId),
        isNotNull(contacts.nextServiceDue),
        lte(contacts.nextServiceDue, today)
      )
    );

  const errors: string[] = [];
  let sent = 0;

  for (const c of dueContacts) {
    const contactName = `${c.firstName} ${c.lastName}`;

    if (c.unsubscribed) continue;

    if (c.email) {
      const template = serviceReminderTemplate({
        contactName,
        nextServiceDue: c.nextServiceDue ?? today,
      });
      const result = await sendEmail({
        to: c.email,
        subject: template.subject,
        html: template.html,
      });
      if (result.ok) {
        sent++;
      } else {
        errors.push(`${contactName}: ${result.error}`);
      }
    }
  }

  return { processed: dueContacts.length, sent, errors };
}
