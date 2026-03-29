import { NextResponse } from "next/server";
import { cronAuthResponse } from "@/lib/cron-auth";
import { resolveResendReplyTo } from "@/lib/email/resend-reply-to";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Jak daleko zpět (minuty) bereme neodeslaná připomenutí po `reminderAt`, aby po výpadku cronu
 * nenaskákaly roky staré záznamy. Na Vercelu Hobby (cron 1× denně) nech výchozí 24 h nebo vyšší.
 * Na Pro s častým cronem můžeš zúžit, např. `EVENT_REMINDER_GRACE_PAST_MIN=120`.
 */
function reminderGracePastMinutes(): number {
  const raw = process.env.EVENT_REMINDER_GRACE_PAST_MIN?.trim();
  if (!raw) return 24 * 60;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 24 * 60;
  return Math.min(Math.floor(n), 7 * 24 * 60);
}

/**
 * Kalendářní připomenutí: in-app (advisor_notifications) + push (FCM) + volitelně e-mail (Resend).
 * `reminder_notified_at` se nastaví jen po úspěchu alespoň jednoho kanálu — jinak se připomenutí zkusí znovu.
 *
 * Globálně vypnout e-mail: `EVENT_REMINDER_EMAIL=0`.
 * Per uživatel: `user_profiles.calendar_reminder_*_enabled` (po migraci).
 */
export async function GET(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;

  const { db, events, userProfiles, tenants, eq, and, isNull, lte, gte, gt, or, ne, isNotNull } =
    await import("db");
  const { sendPushToUser } = await import("@/lib/push/send");
  const { emitNotification } = await import("@/lib/execution/notification-center");

  const now = new Date();
  const graceMin = reminderGracePastMinutes();
  const notBefore = new Date(now.getTime() - graceMin * 60_000);

  const rows = await db
    .select({
      id: events.id,
      tenantId: events.tenantId,
      title: events.title,
      startAt: events.startAt,
      assignedTo: events.assignedTo,
      advisorEmail: userProfiles.email,
      tenantNotificationEmail: tenants.notificationEmail,
      reminderPushEnabled: userProfiles.calendarReminderPushEnabled,
      reminderEmailEnabled: userProfiles.calendarReminderEmailEnabled,
    })
    .from(events)
    .innerJoin(tenants, eq(events.tenantId, tenants.id))
    .leftJoin(userProfiles, eq(events.assignedTo, userProfiles.userId))
    .where(
      and(
        isNotNull(events.reminderAt),
        isNull(events.reminderNotifiedAt),
        lte(events.reminderAt, now),
        gte(events.reminderAt, notBefore),
        gt(events.startAt, now),
        isNotNull(events.assignedTo),
        or(isNull(events.status), and(ne(events.status, "cancelled"), ne(events.status, "done"))),
      ),
    )
    .limit(200);

  const globalEmailOff = process.env.EVENT_REMINDER_EMAIL?.trim() === "0";
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );

  let scanned = rows.length;
  let markedNotified = 0;
  let skippedNoChannel = 0;
  let inAppEmitted = 0;
  let pushSent = 0;
  let emailsSent = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const startLabel = new Date(row.startAt).toLocaleString("cs-CZ", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const titleShort = row.title.length > 80 ? `${row.title.slice(0, 77)}…` : row.title;
    const uid = row.assignedTo!;

    const userWantsPush = row.reminderPushEnabled !== false;
    const userWantsEmail = row.reminderEmailEnabled !== false;
    const allowEmail = !globalEmailOff && userWantsEmail;

    let inAppOk = false;
    try {
      const notif = await emitNotification({
        tenantId: row.tenantId,
        type: "reminder_due",
        title: `Připomenutí: ${titleShort}`,
        body: `Začátek: ${startLabel}`,
        severity: "info",
        targetUserId: uid,
        channels: ["in_app"],
        relatedEntityType: "calendar_event",
        relatedEntityId: row.id,
        groupKey: `calendar_reminder:${row.id}`,
      });
      if (notif) {
        inAppOk = true;
        inAppEmitted += 1;
      }
    } catch (e) {
      errors.push(`in_app ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }

    let pushDelivered = false;
    if (userWantsPush) {
      try {
        const pushResult = await sendPushToUser({
          type: "REMINDER_DUE",
          title: `Připomenutí: ${titleShort}`,
          body: `Začátek: ${startLabel}`,
          tenantId: row.tenantId,
          userId: uid,
          data: { eventId: row.id, surface: "calendar" },
        });
        if (pushResult.sent > 0) {
          pushDelivered = true;
          pushSent += pushResult.sent;
        }
      } catch (e) {
        errors.push(`push ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    let emailDelivered = false;
    if (allowEmail && resendKey && row.advisorEmail?.trim()) {
      const replyTo = row.tenantNotificationEmail?.trim() || resolveResendReplyTo();
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(resendKey);
        const { error } = await resend.emails.send({
          from,
          to: row.advisorEmail.trim(),
          subject: `Připomenutí: ${titleShort}`,
          html: `<p>Blíží se vaše aktivita v kalendáři.</p><p><strong>${escapeHtml(row.title)}</strong></p><p>Začátek: ${escapeHtml(startLabel)}</p><p><a href="${baseUrl}/portal/calendar">Otevřít kalendář</a></p>`,
          ...(replyTo ? { replyTo } : {}),
        });
        if (!error) {
          emailDelivered = true;
          emailsSent += 1;
        }
      } catch (e) {
        errors.push(`email ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const delivered = inAppOk || pushDelivered || emailDelivered;
    if (delivered) {
      await db
        .update(events)
        .set({ reminderNotifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(events.id, row.id));
      markedNotified += 1;
    } else {
      skippedNoChannel += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    scanned,
    markedNotified,
    skippedNoChannel,
    inAppEmitted,
    pushSent,
    emailsSent,
    ...(errors.length ? { errors: errors.slice(0, 20) } : {}),
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
