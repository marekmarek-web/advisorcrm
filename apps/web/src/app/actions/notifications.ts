"use server";

import { withAuthContext } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import { contacts, unsubscribeTokens } from "db";
import { eq, and, lte, isNotNull, isNull, or, lt, sql } from "db";
import { db } from "db";
import { sendEmail } from "@/lib/email/send-email";
import { clientServiceDueReminderTemplate } from "@/lib/email/templates";
import { loadAdvisorMailHeadersForCurrentUser } from "@/lib/email/advisor-mail-headers";

/** Kolik dní po odeslání servisní připomínky čekáme, než je možné poslat další. */
const SERVICE_REMINDER_COOLDOWN_DAYS = 30;

function makeUnsubscribeToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function unsubscribeTokenExpiry(): Date {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

function baseAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.aidvisora.cz"
  ).replace(/\/$/, "");
}

/**
 * Process service reminders: find contacts with upcoming/due service,
 * send email to the client if not unsubscribed, and stamp
 * `lastServiceReminderSentAt` to prevent re-sends within the cooldown.
 */
export async function processServiceReminders(): Promise<{
  processed: number;
  sent: number;
  errors: string[];
}> {
  const today = new Date().toISOString().slice(0, 10);
  const cooldownCutoff = new Date(
    Date.now() - SERVICE_REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  );

  const dueContacts = await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
    return tx
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: contacts.email,
        nextServiceDue: contacts.nextServiceDue,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, auth.tenantId),
          isNotNull(contacts.nextServiceDue),
          isNull(contacts.notificationUnsubscribedAt),
          eq(contacts.doNotEmail, false),
          isNotNull(contacts.email),
          sql`trim(${contacts.email}) <> ''`,
          lte(contacts.nextServiceDue, today),
          or(
            isNull(contacts.lastServiceReminderSentAt),
            lt(contacts.lastServiceReminderSentAt, cooldownCutoff),
          ),
        ),
      );
  });

  const errors: string[] = [];
  let sent = 0;

  const headers = await loadAdvisorMailHeadersForCurrentUser();
  const base = baseAppUrl();

  for (const c of dueContacts) {
    const contactName = `${c.firstName} ${c.lastName}`;

    if (!c.email) continue;

    let unsubscribeUrl: string | undefined;
    try {
      const token = makeUnsubscribeToken();
      await db.insert(unsubscribeTokens).values({
        contactId: c.id,
        token,
        expiresAt: unsubscribeTokenExpiry(),
      });
      unsubscribeUrl = `${base}/client/unsubscribe?token=${token}`;
    } catch (e) {
      errors.push(`${contactName}: unsubscribe token mint failed`);
      console.error("[processServiceReminders] unsubscribe token mint failed", {
        contactId: c.id,
        error: e,
      });
      continue;
    }

    const template = clientServiceDueReminderTemplate({
      firstName: c.firstName,
      lastName: c.lastName,
      nextServiceDue: c.nextServiceDue ?? today,
      unsubscribeUrl,
    });

    const result = await sendEmail({
      to: c.email,
      subject: template.subject,
      html: template.html,
      from: headers.from,
      replyTo: headers.replyTo,
    });
    if (result.ok) {
      try {
        await db
          .update(contacts)
          .set({ lastServiceReminderSentAt: new Date(), updatedAt: new Date() })
          .where(eq(contacts.id, c.id));
        sent++;
      } catch (e) {
        errors.push(`${contactName}: stamp failed`);
        console.error("[processServiceReminders] stamp failed", { contactId: c.id, error: e });
      }
    } else {
      errors.push(`${contactName}: ${result.error}`);
    }
  }

  return { processed: dueContacts.length, sent, errors };
}
