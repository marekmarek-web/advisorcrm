import { NextResponse } from "next/server";
import { db } from "db";
import { contacts, tenants } from "db";
import { lte, isNotNull, isNull, and, eq } from "db";
import { Resend } from "resend";
import { cronAuthResponse } from "@/lib/cron-auth";
import { resolveResendReplyTo } from "@/lib/email/resend-reply-to";
import { clientServiceDueReminderTemplate } from "@/lib/email/templates";

function replyToForCron(tenantNotificationEmail: string | null): string | undefined {
  const t = tenantNotificationEmail?.trim();
  if (t) return t;
  return resolveResendReplyTo();
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;

  const today = new Date().toISOString().slice(0, 10);
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
        lte(contacts.nextServiceDue, today)
      )
    );
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ sent: 0, error: "RESEND_API_KEY not set" });
  }
  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  let sent = 0;
  for (const c of rows) {
    if (!c.email) continue;
    const replyTo = replyToForCron(c.tenantNotificationEmail);
    const { subject, html } = clientServiceDueReminderTemplate({
      firstName: c.firstName,
      lastName: c.lastName,
      nextServiceDue: c.nextServiceDue ?? today,
    });
    const { error } = await resend.emails.send({
      from,
      to: c.email,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    });
    if (!error) sent++;
  }
  return NextResponse.json({ sent, total: rows.length });
}
