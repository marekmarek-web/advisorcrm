import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { cronAuthResponse } from "@/lib/cron-auth";
import { dbService, withServiceTenantContext } from "@/lib/db/service-db";
import { sendGracePeriodReminderEmail } from "@/lib/stripe/billing-email-notifier";

/**
 * Denní kontrola grace-period (delta A4). Pro každého tenantu, kterému:
 *   - `grace_period_ends_at` leží v intervalu (dnes+24h, dnes+48h),
 *   - a status subscription je `past_due` nebo `unpaid`,
 *
 * pošleme připomenutí "grace period končí zítra". Idempotence: přes
 * `grace_period_reminder_sent_at` (nastavujeme po odeslání).
 *
 * Spouští se z Vercel Cron:  `vercel.json` → `{ path: "/api/cron/grace-period-check", schedule: "0 9 * * *" }`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = cronAuthResponse(request);
  if (denied) return denied;

  const now = new Date();
  const window24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const window48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  // We rely on subscription dunning fields. The column name in DB is
  // `grace_period_ends_at`. Pokud by schéma mělo jiný název, musí se tu
  // dorovnat — toto je jen shell pro reminder cron; viz billing-audit-log jako
  // jediný zdroj pravdy, pokud subscription schema neuchovává grace_period_ends_at.
  const due = await dbService.execute<{
    tenant_id: string;
    grace_period_ends_at: Date;
  }>(sql`
    SELECT tenant_id, grace_period_ends_at
    FROM subscriptions
    WHERE grace_period_ends_at IS NOT NULL
      AND grace_period_ends_at > ${window24h}
      AND grace_period_ends_at < ${window48h}
      AND status IN ('past_due', 'unpaid')
      AND (grace_period_reminder_sent_at IS NULL OR grace_period_reminder_sent_at < grace_period_ends_at - interval '25 hours')
    LIMIT 200
  `);

  type Row = { tenant_id: string; grace_period_ends_at: Date };
  const rows: Row[] = Array.isArray(due)
    ? (due as Row[])
    : (((due as { rows?: Row[] }).rows) ?? []);

  let sent = 0;
  for (const row of rows) {
    try {
      await sendGracePeriodReminderEmail({
        tenantId: row.tenant_id,
        gracePeriodEndsAt: new Date(row.grace_period_ends_at),
      });
      await withServiceTenantContext({ tenantId: row.tenant_id }, async (tx) => {
        await tx.execute(sql`
          UPDATE subscriptions
          SET grace_period_reminder_sent_at = now()
          WHERE tenant_id = ${row.tenant_id}
        `);
      });
      sent += 1;
    } catch (err) {
      console.error("[grace-period-check] send failed", {
        tenantId: row.tenant_id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, evaluated: rows.length, sent });
}
