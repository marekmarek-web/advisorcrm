import "server-only";

import { dbService, withServiceTenantContext } from "@/lib/db/service-db";
import {
  emailSendQueue,
  emailCampaignRecipients,
  emailCampaigns,
  emailCampaignEvents,
  contacts,
  unsubscribeTokens,
  eq,
  sql,
  and,
} from "db";
import { sendEmail } from "@/lib/email/send-email";
import { resolveFromHeader } from "@/lib/email/resolve-from-header";
import { personalizeMessage } from "@/lib/email/personalization";
import { buildListUnsubscribeHeaders } from "@/lib/email/list-unsubscribe";
import { rewriteHtmlForTracking, injectOpenPixel } from "@/lib/email/tracking";

const DEFAULT_BATCH_SIZE = 40;
const MAX_ATTEMPTS = 3;

export type ProcessResult = {
  processed: number;
  sent: number;
  failed: number;
  deferred: number;
  killed: boolean;
};

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.aidvisora.cz"
  ).replace(/\/$/, "");
}

function unsubscribeTokenExpiry(): Date {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

function mintUnsubToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function backoffMs(attempts: number): number {
  // 2min → 10min → 30min
  if (attempts <= 1) return 2 * 60 * 1000;
  if (attempts <= 2) return 10 * 60 * 1000;
  return 30 * 60 * 1000;
}

/**
 * Kontrola remote kill-switche (`EMAIL_SENDING_DISABLED`).
 * Stejný gate, který používá `sendEmail` — ale vyhodnotíme ho v batchi, abychom
 * nepálili do fronty, když je kill-switch aktivní.
 */
async function isKillSwitchActive(): Promise<boolean> {
  try {
    const { getKillSwitch } = await import("@/lib/ops/kill-switch");
    return await getKillSwitch("EMAIL_SENDING_DISABLED", false);
  } catch {
    return false;
  }
}

/**
 * Jedno zpracování batchu z `email_send_queue`.
 *
 * Atomicky se:
 *  1) SELECT FOR UPDATE SKIP LOCKED jobs kde next_attempt_at <= now()
 *  2) UPDATE status='processing', locked_at=now(), locked_by=worker_id
 *  3) pro každý job zavoláme sendEmail
 *  4) dle výsledku UPDATE status/next_attempt_at, emailCampaignRecipients + event
 *
 * Po zpracování se přepne `email_campaigns.status` na 'sent' nebo 'failed',
 * jakmile v queue pro kampaň nezbývá žádný `pending` job.
 */
export async function processEmailQueueBatch(options?: {
  batchSize?: number;
  workerId?: string;
}): Promise<ProcessResult> {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
  const workerId = options?.workerId ?? `worker-${process.pid}-${Date.now()}`;

  if (await isKillSwitchActive()) {
    return { processed: 0, sent: 0, failed: 0, deferred: 0, killed: true };
  }

  // ─── 1) Claim jobs (FOR UPDATE SKIP LOCKED v CTE) ────────────────────────
  const claimed = await dbService.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      WITH claimed AS (
        SELECT id
        FROM email_send_queue
        WHERE status = 'pending'
          AND next_attempt_at <= now()
        ORDER BY next_attempt_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE email_send_queue q
      SET status = 'processing',
          locked_at = now(),
          locked_by = ${workerId},
          attempts = q.attempts + 1,
          updated_at = now()
      FROM claimed
      WHERE q.id = claimed.id
      RETURNING
        q.id,
        q.tenant_id  AS "tenantId",
        q.campaign_id AS "campaignId",
        q.recipient_id AS "recipientId",
        q.attempts,
        q.max_attempts AS "maxAttempts",
        q.payload
    `);
    return rows as unknown as Array<{
      id: string;
      tenantId: string;
      campaignId: string;
      recipientId: string;
      attempts: number;
      maxAttempts: number;
      payload: Record<string, unknown>;
    }>;
  });

  const result: ProcessResult = {
    processed: claimed.length,
    sent: 0,
    failed: 0,
    deferred: 0,
    killed: false,
  };

  for (const job of claimed) {
    try {
      const outcome = await processOne(job, workerId);
      if (outcome === "sent") result.sent++;
      else if (outcome === "failed") result.failed++;
      else result.deferred++;
    } catch (e) {
      // Neočekávaná chyba — označit jako failed, aby se neopakovala donekonečna.
      console.error("[queue-worker] unexpected error", { jobId: job.id, error: e });
      await dbService
        .update(emailSendQueue)
        .set({
          status: "failed",
          lastError: String(e).slice(0, 1000),
          updatedAt: new Date(),
        })
        .where(eq(emailSendQueue.id, job.id));
      result.failed++;
    }
  }

  // Po batchi: zkus uzavřít dokončené kampaně.
  await finalizeCompletedCampaigns();

  return result;
}

async function processOne(
  job: {
    id: string;
    tenantId: string;
    campaignId: string;
    recipientId: string;
    attempts: number;
    maxAttempts: number;
    payload: Record<string, unknown>;
  },
  workerId: string,
): Promise<"sent" | "failed" | "deferred"> {
  return withServiceTenantContext({ tenantId: job.tenantId }, async (tx) => {
    const [campaign] = await tx
      .select()
      .from(emailCampaigns)
      .where(eq(emailCampaigns.id, job.campaignId))
      .limit(1);
    if (!campaign || campaign.status === "cancelled") {
      await tx
        .update(emailSendQueue)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(emailSendQueue.id, job.id));
      return "failed";
    }

    const [recipient] = await tx
      .select()
      .from(emailCampaignRecipients)
      .where(eq(emailCampaignRecipients.id, job.recipientId))
      .limit(1);
    if (!recipient) {
      await tx
        .update(emailSendQueue)
        .set({ status: "failed", lastError: "recipient missing", updatedAt: new Date() })
        .where(eq(emailSendQueue.id, job.id));
      return "failed";
    }

    // Compliance recheck (contact mohl mezi tím opt-outnout)
    const [contact] = await tx
      .select({
        doNotEmail: contacts.doNotEmail,
        unsubscribedAt: contacts.notificationUnsubscribedAt,
        archivedAt: contacts.archivedAt,
      })
      .from(contacts)
      .where(eq(contacts.id, recipient.contactId))
      .limit(1);
    if (!contact || contact.doNotEmail || contact.unsubscribedAt || contact.archivedAt) {
      await tx
        .update(emailCampaignRecipients)
        .set({
          status: "skipped",
          errorMessage: "opted_out",
        })
        .where(eq(emailCampaignRecipients.id, job.recipientId));
      await tx
        .update(emailSendQueue)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(emailSendQueue.id, job.id));
      return "deferred";
    }

    // Unsub token
    const unsubToken = mintUnsubToken();
    await tx.insert(unsubscribeTokens).values({
      contactId: recipient.contactId,
      token: unsubToken,
      expiresAt: unsubscribeTokenExpiry(),
    });
    const unsubscribeUrl = `${appBaseUrl()}/client/unsubscribe?token=${unsubToken}`;

    const payload = job.payload as { firstName?: string; lastName?: string };
    const { subject, bodyHtml } = personalizeMessage({
      subject: campaign.subject,
      bodyHtml: campaign.bodyHtml,
      preheader: campaign.preheader,
      input: {
        firstName: payload.firstName ?? "",
        lastName: payload.lastName ?? "",
        unsubscribeUrl,
      },
    });

    // Tracking: rewrite <a href> do /api/t/c/<token>?u=<url>, inject open pixel.
    const trackedHtml = campaign.trackingEnabled
      ? injectOpenPixel(
          rewriteHtmlForTracking(bodyHtml, {
            token: recipient.trackingToken ?? null,
            baseUrl: appBaseUrl(),
          }),
          { token: recipient.trackingToken ?? null, baseUrl: appBaseUrl() },
        )
      : bodyHtml;

    const from = await resolveFromHeader({
      tenantId: job.tenantId,
      userId: campaign.createdByUserId,
      override: campaign.fromNameOverride,
    });

    const sendResult = await sendEmail({
      to: recipient.email,
      subject,
      html: trackedHtml,
      from,
      headers: buildListUnsubscribeHeaders({ unsubscribeUrl }),
      tags: [
        { name: "campaign_id", value: job.campaignId.replace(/-/g, "") },
        { name: "tenant_id", value: job.tenantId.replace(/-/g, "") },
      ],
    });

    if (sendResult.ok) {
      await tx
        .update(emailCampaignRecipients)
        .set({
          status: "sent",
          providerMessageId: sendResult.messageId ?? null,
          sentAt: new Date(),
          errorMessage: null,
        })
        .where(eq(emailCampaignRecipients.id, job.recipientId));

      await tx.insert(emailCampaignEvents).values({
        tenantId: job.tenantId,
        campaignId: job.campaignId,
        recipientId: job.recipientId,
        eventType: "sent",
        metadata: { providerMessageId: sendResult.messageId },
      });

      await tx
        .update(emailSendQueue)
        .set({ status: "sent", lastError: null, updatedAt: new Date() })
        .where(eq(emailSendQueue.id, job.id));

      return "sent";
    }

    // Selhání — retry or final fail.
    const attempts = job.attempts;
    if (attempts < (job.maxAttempts ?? MAX_ATTEMPTS)) {
      const nextAttemptAt = new Date(Date.now() + backoffMs(attempts));
      await tx
        .update(emailSendQueue)
        .set({
          status: "pending",
          nextAttemptAt,
          lastError: sendResult.error?.slice(0, 1000) ?? "unknown",
          lockedAt: null,
          lockedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(emailSendQueue.id, job.id));
      return "deferred";
    }

    // Final failure
    await tx
      .update(emailCampaignRecipients)
      .set({
        status: "failed",
        errorMessage: sendResult.error?.slice(0, 500) ?? "unknown",
      })
      .where(eq(emailCampaignRecipients.id, job.recipientId));

    await tx.insert(emailCampaignEvents).values({
      tenantId: job.tenantId,
      campaignId: job.campaignId,
      recipientId: job.recipientId,
      eventType: "failed",
      metadata: { error: sendResult.error },
    });

    await tx
      .update(emailSendQueue)
      .set({
        status: "failed",
        lastError: sendResult.error?.slice(0, 1000) ?? "unknown",
        updatedAt: new Date(),
      })
      .where(eq(emailSendQueue.id, job.id));

    return "failed";
  });
}

/**
 * Uzavře kampaně, u kterých už ve frontě není žádný pending/processing job.
 * Stav 'sent' = alespoň 1 úspěch, jinak 'failed'.
 */
export async function finalizeCompletedCampaigns(): Promise<number> {
  const rows = await dbService.execute(sql`
    SELECT c.id, c.tenant_id AS "tenantId",
           count(*) filter (where r.status = 'sent') ::int  AS sent,
           count(*) filter (where r.status = 'failed') ::int AS failed
    FROM email_campaigns c
    JOIN email_campaign_recipients r ON r.campaign_id = c.id
    WHERE c.status IN ('queued', 'sending')
      AND NOT EXISTS (
        SELECT 1 FROM email_send_queue q
        WHERE q.campaign_id = c.id
          AND q.status IN ('pending', 'processing')
      )
    GROUP BY c.id, c.tenant_id
  `);

  let count = 0;
  for (const r of rows as unknown as Array<{
    id: string;
    tenantId: string;
    sent: number;
    failed: number;
  }>) {
    const terminal = r.sent > 0 ? "sent" : "failed";
    await withServiceTenantContext({ tenantId: r.tenantId }, (tx) =>
      tx
        .update(emailCampaigns)
        .set({ status: terminal, sentAt: new Date(), updatedAt: new Date() })
        .where(and(eq(emailCampaigns.id, r.id), eq(emailCampaigns.tenantId, r.tenantId))),
    );
    count++;
  }
  return count;
}

/**
 * Aktivuje naplánované kampaně, jejichž `scheduled_at` nastal — přehodí je
 * do `queued` a rozloží jobs do `next_attempt_at = now()`.
 */
export async function activateDueScheduledCampaigns(): Promise<number> {
  // Najdi kampaně s status='scheduled' a scheduled_at <= now()
  const rows = await dbService.execute(sql`
    UPDATE email_campaigns
    SET status = 'queued', updated_at = now()
    WHERE status = 'scheduled' AND scheduled_at <= now()
    RETURNING id, tenant_id AS "tenantId"
  `);
  const updated = rows as unknown as Array<{ id: string; tenantId: string }>;
  for (const c of updated) {
    await withServiceTenantContext({ tenantId: c.tenantId }, async (tx) => {
      await tx
        .update(emailSendQueue)
        .set({ nextAttemptAt: new Date(), updatedAt: new Date() })
        .where(and(eq(emailSendQueue.campaignId, c.id), eq(emailSendQueue.status, "pending")));
    });
  }
  return updated.length;
}

/** Reap 'processing' jobs, které už dlouho nedoběhly (crash/timeout). */
export async function reapStuckQueueJobs(olderThanMinutes = 10): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  const res = await dbService.execute(sql`
    UPDATE email_send_queue
    SET status = 'pending',
        locked_at = NULL,
        locked_by = NULL,
        next_attempt_at = now(),
        updated_at = now()
    WHERE status = 'processing'
      AND locked_at IS NOT NULL
      AND locked_at < ${cutoff}
    RETURNING id
  `);
  return (res as unknown as Array<{ id: string }>).length;
}
