import { NextResponse } from "next/server";
import { db } from "db";
import { contacts, tenants, unsubscribeTokens } from "db";
import { lte, isNotNull, isNull, and, eq, or, lt, sql } from "db";
import { Resend } from "resend";
import { cronAuthResponse } from "@/lib/cron-auth";
import { resolveResendReplyTo } from "@/lib/email/resend-reply-to";
import { clientServiceDueReminderTemplate } from "@/lib/email/templates";

/** Kolik dní po odeslání servisní připomínky čekáme, než je možné poslat další. */
const SERVICE_REMINDER_COOLDOWN_DAYS = 30;

function replyToForCron(tenantNotificationEmail: string | null): string | undefined {
  const t = tenantNotificationEmail?.trim();
  if (t) return t;
  return resolveResendReplyTo();
}

function unsubscribeTokenExpiry(): Date {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

function makeUnsubscribeToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;

  const today = new Date().toISOString().slice(0, 10);
  const cooldownCutoff = new Date(
    Date.now() - SERVICE_REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  );

  const rows = await db
    .select({
      id: contacts.id,
      tenantId: contacts.tenantId,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      nextServiceDue: contacts.nextServiceDue,
      tenantNotificationEmail: tenants.notificationEmail,
    })
    .from(contacts)
    .innerJoin(tenants, eq(contacts.tenantId, tenants.id))
    .where(
      and(
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

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ sent: 0, error: "RESEND_API_KEY not set" });
  }
  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.aidvisora.cz";

  let sent = 0;
  let failed = 0;

  for (const c of rows) {
    if (!c.email) continue;
    const replyTo = replyToForCron(c.tenantNotificationEmail);

    const unsubToken = makeUnsubscribeToken();
    try {
      await db.insert(unsubscribeTokens).values({
        contactId: c.id,
        token: unsubToken,
        expiresAt: unsubscribeTokenExpiry(),
      });
    } catch (e) {
      console.error("[service-reminders] failed to mint unsubscribe token", { contactId: c.id, error: e });
      failed += 1;
      continue;
    }
    const unsubscribeUrl = `${baseUrl.replace(/\/$/, "")}/client/unsubscribe?token=${unsubToken}`;

    const { subject, html } = clientServiceDueReminderTemplate({
      firstName: c.firstName,
      lastName: c.lastName,
      nextServiceDue: c.nextServiceDue ?? today,
      unsubscribeUrl,
    });

    const { error } = await resend.emails.send({
      from,
      to: c.email,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    });

    if (error) {
      failed += 1;
      console.error("[service-reminders] send failed", { contactId: c.id, error });
      continue;
    }

    try {
      await db
        .update(contacts)
        .set({ lastServiceReminderSentAt: new Date(), updatedAt: new Date() })
        .where(eq(contacts.id, c.id));
      sent += 1;
    } catch (e) {
      console.error("[service-reminders] failed to stamp lastServiceReminderSentAt", { contactId: c.id, error: e });
      failed += 1;
    }
  }

  return NextResponse.json({ sent, failed, eligible: rows.length, cooldownDays: SERVICE_REMINDER_COOLDOWN_DAYS });
}
