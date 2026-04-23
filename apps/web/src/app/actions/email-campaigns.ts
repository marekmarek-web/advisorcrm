"use server";

import { requireAuthInAction, type AuthContext } from "@/lib/auth/require-auth";
import { withAuthContext, withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  emailCampaigns,
  emailCampaignRecipients,
  contacts,
  unsubscribeTokens,
  eq,
  and,
  isNull,
  isNotNull,
  desc,
  lt,
  sql,
} from "db";
import { sendEmail, logNotification } from "@/lib/email/send-email";
import { resolveFromHeader } from "@/lib/email/resolve-from-header";
import { personalizeMessage } from "@/lib/email/personalization";
import { buildListUnsubscribeHeaders } from "@/lib/email/list-unsubscribe";
import { enqueueCampaignForSending } from "@/lib/email/queue-enqueue";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";
import {
  CAMPAIGN_SEGMENTS,
  type CampaignSegment,
  type CampaignSegmentId,
  type EmailCampaignRow,
  type CampaignListRow,
  type SegmentCount,
  type SendEmailCampaignResult,
} from "@/lib/email/campaign-shared";

const CAMPAIGN_TEMPLATE_LOG = "email_campaign";
/** Ochrana proti timeoutu serverless — zbytek pošlete druhou kampaní nebo rozšiřte limit. */
const MAX_RECIPIENTS_PER_SEND = 80;

function getSegment(id?: string | null): CampaignSegment {
  const found = CAMPAIGN_SEGMENTS.find((s) => s.id === id);
  return found ?? CAMPAIGN_SEGMENTS[0]!;
}

function tagFilterSql(tags: string[]) {
  if (tags.length === 0) return sql`true`;
  const lowered = tags.map((t) => t.toLowerCase());
  return sql`EXISTS (
    SELECT 1 FROM unnest(coalesce(${contacts.tags}, ARRAY[]::text[])) AS t(tag)
    WHERE lower(t.tag) = ANY(${lowered}::text[])
  )`;
}

function makeUnsubscribeToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function unsubscribeTokenExpiry(): Date {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.aidvisora.cz"
  ).replace(/\/$/, "");
}

async function mintUnsubscribeUrlForContact(
  auth: AuthContext,
  contactId: string,
): Promise<{ url: string; token: string } | null> {
  try {
    const token = makeUnsubscribeToken();
    await withTenantContextFromAuth(auth, (tx) =>
      tx.insert(unsubscribeTokens).values({
        contactId,
        token,
        expiresAt: unsubscribeTokenExpiry(),
      }),
    );
    return { url: `${appBaseUrl()}/client/unsubscribe?token=${token}`, token };
  } catch (e) {
    console.error("[email-campaigns] unsubscribe token mint failed", { contactId, error: e });
    return null;
  }
}

export async function listEmailCampaigns(): Promise<EmailCampaignRow[]> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) {
      throw new Error("Nemáte oprávnění.");
    }
    return tx
      .select({
        id: emailCampaigns.id,
        name: emailCampaigns.name,
        subject: emailCampaigns.subject,
        preheader: emailCampaigns.preheader,
        status: emailCampaigns.status,
        scheduledAt: emailCampaigns.scheduledAt,
        createdAt: emailCampaigns.createdAt,
        sentAt: emailCampaigns.sentAt,
      })
      .from(emailCampaigns)
      .where(eq(emailCampaigns.tenantId, auth.tenantId))
      .orderBy(desc(emailCampaigns.createdAt))
      .limit(50);
  });
}

/** Rozšířená data pro novou UI (historie + pokračování draftu + analytics). */
export async function listEmailCampaignsFull(): Promise<CampaignListRow[]> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) {
      throw new Error("Nemáte oprávnění.");
    }
    const rows = await tx
      .select({
        id: emailCampaigns.id,
        name: emailCampaigns.name,
        subject: emailCampaigns.subject,
        preheader: emailCampaigns.preheader,
        status: emailCampaigns.status,
        scheduledAt: emailCampaigns.scheduledAt,
        createdAt: emailCampaigns.createdAt,
        sentAt: emailCampaigns.sentAt,
        bodyHtml: emailCampaigns.bodyHtml,
        recipientCount: emailCampaigns.recipientCount,
      })
      .from(emailCampaigns)
      .where(eq(emailCampaigns.tenantId, auth.tenantId))
      .orderBy(desc(emailCampaigns.createdAt))
      .limit(50);

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const stats = await tx
      .select({
        campaignId: emailCampaignRecipients.campaignId,
        sent: sql<number>`count(*) filter (where ${emailCampaignRecipients.status} in ('sent','delivered','opened','clicked'))::int`,
        failed: sql<number>`count(*) filter (where ${emailCampaignRecipients.status} = 'failed')::int`,
        opens: sql<number>`count(*) filter (where ${emailCampaignRecipients.openedAt} is not null)::int`,
        clicks: sql<number>`count(*) filter (where ${emailCampaignRecipients.firstClickAt} is not null)::int`,
        bounces: sql<number>`count(*) filter (where ${emailCampaignRecipients.bouncedAt} is not null)::int`,
        unsubscribes: sql<number>`count(*) filter (where ${emailCampaignRecipients.unsubscribedAt} is not null)::int`,
      })
      .from(emailCampaignRecipients)
      .where(
        and(
          eq(emailCampaignRecipients.tenantId, auth.tenantId),
          sql`${emailCampaignRecipients.campaignId} = ANY(${ids}::uuid[])`,
        ),
      )
      .groupBy(emailCampaignRecipients.campaignId);

    const byId = new Map(stats.map((s) => [s.campaignId, s]));

    return rows.map((r) => {
      const s = byId.get(r.id);
      return {
        ...r,
        sentCount: s?.sent ?? 0,
        failedCount: s?.failed ?? 0,
        openCount: s?.opens ?? 0,
        clickCount: s?.clicks ?? 0,
        bounceCount: s?.bounces ?? 0,
        unsubscribeCount: s?.unsubscribes ?? 0,
      };
    });
  });
}

export async function getSegmentCounts(): Promise<SegmentCount[]> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) {
      throw new Error("Nemáte oprávnění.");
    }
    const baseEligible = and(
      eq(contacts.tenantId, auth.tenantId),
      isNull(contacts.archivedAt),
      eq(contacts.doNotEmail, false),
      isNull(contacts.notificationUnsubscribedAt),
      isNotNull(contacts.email),
      sql`trim(${contacts.email}) <> ''`,
    );

    const results: SegmentCount[] = [];
    for (const seg of CAMPAIGN_SEGMENTS) {
      if (seg.id === "test") {
        results.push({ id: seg.id, label: seg.label, count: 1 });
        continue;
      }
      const [row] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(contacts)
        .where(and(baseEligible, tagFilterSql(seg.tags)));
      results.push({ id: seg.id, label: seg.label, count: row?.count ?? 0 });
    }
    return results;
  });
}

export async function createEmailCampaignDraft(input: {
  name: string;
  subject: string;
  preheader?: string | null;
  bodyHtml: string;
  templateId?: string | null;
  fromNameOverride?: string | null;
  trackingEnabled?: boolean;
  segmentId?: string | null;
  segmentFilter?: Record<string, unknown> | null;
}): Promise<{ id: string }> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) {
      throw new Error("Nemáte oprávnění vytvářet kampaň.");
    }
    const name = input.name?.trim();
    const subject = input.subject?.trim();
    const bodyHtml = input.bodyHtml?.trim();
    if (!name || !subject || !bodyHtml) {
      throw new Error("Vyplňte název, předmět a tělo zprávy.");
    }
    const [row] = await tx
      .insert(emailCampaigns)
      .values({
        tenantId: auth.tenantId,
        createdByUserId: auth.userId,
        name,
        subject,
        preheader: input.preheader?.trim() || null,
        bodyHtml,
        status: "draft",
        templateId: input.templateId ?? null,
        fromNameOverride: input.fromNameOverride?.trim() || null,
        trackingEnabled: input.trackingEnabled ?? true,
        segmentId: input.segmentId ?? null,
        segmentFilter: (input.segmentFilter ?? null) as unknown as
          | Record<string, unknown>
          | null,
      })
      .returning({ id: emailCampaigns.id });
    if (!row) throw new Error("Kampaň se nepodařilo vytvořit.");
    return { id: row.id };
  });
}

/**
 * Odešle draft kampaně způsobilým kontaktům (e-mail, ne do_not_email, ne archiv).
 * Volitelně filtrováno dle segmentu (tagy).
 * Personalizace v subjectu i v body: {{jmeno}}, {{cele_jmeno}}, {{unsubscribe_url}}.
 */
export async function sendEmailCampaign(
  campaignId: string,
  segmentId?: CampaignSegmentId | null,
): Promise<SendEmailCampaignResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    throw new Error("Nemáte oprávnění odesílat kampaň.");
  }

  const segment = getSegment(segmentId);
  if (segment.id === "test") {
    throw new Error("Pro testovací odeslání použijte 'Odeslat test'.");
  }

  // Fáze 1 — čistě DB: ověř kampaň, načti publikum, převeď status na `sending`.
  const { campaign, targets, capped } = await withTenantContextFromAuth(auth, async (tx) => {
    const [campaign] = await tx
      .select()
      .from(emailCampaigns)
      .where(and(eq(emailCampaigns.id, campaignId), eq(emailCampaigns.tenantId, auth.tenantId)))
      .limit(1);
    if (!campaign) throw new Error("Kampaň nebyla nalezena.");
    if (campaign.status !== "draft" && campaign.status !== "scheduled") {
      throw new Error("Odeslat lze jen koncept (draft) nebo naplánovanou kampaň.");
    }

    const audience = await tx
      .select({
        id: contacts.id,
        email: contacts.email,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, auth.tenantId),
          isNull(contacts.archivedAt),
          eq(contacts.doNotEmail, false),
          isNull(contacts.notificationUnsubscribedAt),
          isNotNull(contacts.email),
          sql`trim(${contacts.email}) <> ''`,
          tagFilterSql(segment.tags),
        ),
      )
      .limit(MAX_RECIPIENTS_PER_SEND + 1);

    const capped = audience.length > MAX_RECIPIENTS_PER_SEND;
    const targets = capped ? audience.slice(0, MAX_RECIPIENTS_PER_SEND) : audience;

    await tx
      .update(emailCampaigns)
      .set({
        status: "sending",
        updatedAt: new Date(),
        recipientCount: targets.length,
      })
      .where(eq(emailCampaigns.id, campaignId));

    return { campaign, targets, capped };
  });

  // Pre-resolve from header jednou (nemění se per-recipient)
  const fromHeader = await resolveFromHeader({
    tenantId: auth.tenantId,
    userId: auth.userId,
    override: campaign.fromNameOverride,
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let terminalWritten = false;

  async function writeTerminalStatus() {
    if (terminalWritten) return;
    terminalWritten = true;
    const finalStatus = failed > 0 && sent === 0 ? "failed" : "sent";
    try {
      await withTenantContextFromAuth(auth, (tx) =>
        tx
          .update(emailCampaigns)
          .set({
            status: finalStatus,
            updatedAt: new Date(),
            sentAt: new Date(),
          })
          .where(eq(emailCampaigns.id, campaignId)),
      );
    } catch (e) {
      console.error("[sendEmailCampaign] failed to write terminal status", {
        campaignId,
        error: e,
      });
    }
  }

  try {
    for (const c of targets) {
      const email = c.email!.trim();
      const unsubResult = await mintUnsubscribeUrlForContact(auth, c.id);
      const unsubscribeUrl = unsubResult?.url;

      const { subject, bodyHtml } = personalizeMessage({
        subject: campaign.subject,
        bodyHtml: campaign.bodyHtml,
        preheader: campaign.preheader,
        input: {
          firstName: c.firstName ?? "",
          lastName: c.lastName ?? "",
          unsubscribeUrl,
        },
      });

      const recRow = await withTenantContextFromAuth(auth, async (tx) => {
        const [row] = await tx
          .insert(emailCampaignRecipients)
          .values({
            tenantId: auth.tenantId,
            campaignId,
            contactId: c.id,
            email,
            status: "pending",
          })
          .returning({ id: emailCampaignRecipients.id });
        return row;
      });

      if (!recRow) {
        skipped += 1;
        continue;
      }

      const listUnsubHeaders = buildListUnsubscribeHeaders({
        unsubscribeUrl: unsubscribeUrl ?? null,
      });

      const result = await sendEmail({
        to: email,
        subject,
        html: bodyHtml,
        from: fromHeader,
        headers: listUnsubHeaders,
        tags: [
          { name: "campaign_id", value: campaignId.replace(/-/g, "") },
          { name: "tenant_id", value: auth.tenantId.replace(/-/g, "") },
        ],
      });

      if (result.ok) {
        sent += 1;
        await withTenantContextFromAuth(auth, (tx) =>
          tx
            .update(emailCampaignRecipients)
            .set({
              status: "sent",
              providerMessageId: result.messageId ?? null,
              sentAt: new Date(),
            })
            .where(eq(emailCampaignRecipients.id, recRow.id)),
        );
        await logNotification({
          tenantId: auth.tenantId,
          contactId: c.id,
          template: CAMPAIGN_TEMPLATE_LOG,
          subject,
          recipient: email,
          status: "sent",
          providerMessageId: result.messageId ?? null,
          meta: { campaignId, campaignName: campaign.name },
        });
      } else {
        failed += 1;
        await withTenantContextFromAuth(auth, (tx) =>
          tx
            .update(emailCampaignRecipients)
            .set({
              status: "failed",
              errorMessage: result.error ?? "unknown",
            })
            .where(eq(emailCampaignRecipients.id, recRow.id)),
        );
        await logNotification({
          tenantId: auth.tenantId,
          contactId: c.id,
          template: CAMPAIGN_TEMPLATE_LOG,
          subject,
          recipient: email,
          status: "failed",
          meta: { campaignId, error: result.error },
        });
      }
    }
  } finally {
    await writeTerminalStatus();
  }

  return {
    ok: true,
    sent,
    skipped,
    failed,
    capped,
    cap: MAX_RECIPIENTS_PER_SEND,
  };
}

/**
 * Reclaim campaigns that are stuck in `sending` longer than the watchdog
 * window. Called by a cron or manually from the admin UI. Safe: only flips
 * campaigns whose last update is in the past (beyond cutoff).
 */
const SENDING_WATCHDOG_MINUTES = 15;

export async function reapStuckSendingCampaigns(
  minutes: number = SENDING_WATCHDOG_MINUTES,
): Promise<{ reaped: number }> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) {
      throw new Error("Nemáte oprávnění spustit reclamation kampaní.");
    }
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const stuck = await tx
      .select({
        id: emailCampaigns.id,
        sent: sql<number>`count(*) filter (where ${emailCampaignRecipients.status} = 'sent')::int`,
        failed: sql<number>`count(*) filter (where ${emailCampaignRecipients.status} = 'failed')::int`,
      })
      .from(emailCampaigns)
      .leftJoin(
        emailCampaignRecipients,
        and(
          eq(emailCampaignRecipients.campaignId, emailCampaigns.id),
          eq(emailCampaignRecipients.tenantId, auth.tenantId),
        ),
      )
      .where(
        and(
          eq(emailCampaigns.tenantId, auth.tenantId),
          eq(emailCampaigns.status, "sending"),
          lt(emailCampaigns.updatedAt, cutoff),
        ),
      )
      .groupBy(emailCampaigns.id);

    let reaped = 0;
    for (const s of stuck) {
      const terminal = s.failed > 0 && s.sent === 0 ? "failed" : "sent";
      await tx
        .update(emailCampaigns)
        .set({ status: terminal, updatedAt: new Date(), sentAt: new Date() })
        .where(eq(emailCampaigns.id, s.id));
      reaped += 1;
    }
    return { reaped };
  });
}

/**
 * Odešle testovací kampaň pouze na e-mail přihlášeného poradce.
 * Nezapisuje do `email_campaign_recipients` ani nemění status kampaně.
 * Pokud je předáno `input.campaignId`, bere obsah z DB; jinak bere `subject` + `bodyHtml` z parametru (ad-hoc test bez uloženého draftu).
 */
export async function sendTestCampaign(input: {
  campaignId?: string | null;
  subject?: string;
  preheader?: string | null;
  bodyHtml?: string;
  fromNameOverride?: string | null;
  /** Volitelně přepsaný příjemce – jinak e-mail přihlášeného poradce. */
  to?: string;
}): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    return { ok: false, error: "Nemáte oprávnění odesílat kampaň." };
  }

  let subject = input.subject?.trim() ?? "";
  let bodyHtml = input.bodyHtml?.trim() ?? "";
  let preheader = input.preheader?.trim() ?? null;
  let fromNameOverride = input.fromNameOverride?.trim() ?? null;

  if (input.campaignId) {
    const row = await withTenantContextFromAuth(auth, async (tx) => {
      const [found] = await tx
        .select({
          subject: emailCampaigns.subject,
          bodyHtml: emailCampaigns.bodyHtml,
          preheader: emailCampaigns.preheader,
          fromNameOverride: emailCampaigns.fromNameOverride,
        })
        .from(emailCampaigns)
        .where(
          and(
            eq(emailCampaigns.id, input.campaignId!),
            eq(emailCampaigns.tenantId, auth.tenantId),
          ),
        )
        .limit(1);
      return found;
    });
    if (!row) return { ok: false, error: "Kampaň nebyla nalezena." };
    if (!subject) subject = row.subject;
    if (!bodyHtml) bodyHtml = row.bodyHtml;
    if (!preheader) preheader = row.preheader ?? null;
    if (!fromNameOverride) fromNameOverride = row.fromNameOverride ?? null;
  }

  if (!subject || !bodyHtml) {
    return { ok: false, error: "Vyplňte předmět a obsah zprávy." };
  }

  let to = input.to?.trim() ?? "";
  if (!to) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      to = user?.email?.trim() ?? "";
    } catch {
      to = "";
    }
  }
  if (!to) {
    return { ok: false, error: "Nepodařilo se zjistit váš e-mail. Vyplňte ho ručně." };
  }

  const fromHeader = await resolveFromHeader({
    tenantId: auth.tenantId,
    userId: auth.userId,
    override: fromNameOverride,
  });

  const previewUnsubscribeUrl = `${appBaseUrl()}/client/unsubscribe`;
  const { subject: finalSubject, bodyHtml: finalBody } = personalizeMessage({
    subject,
    bodyHtml,
    preheader,
    input: {
      firstName: "Jan",
      lastName: "Novák",
      unsubscribeUrl: previewUnsubscribeUrl,
    },
  });

  const result = await sendEmail({
    to,
    subject: `[TEST] ${finalSubject}`,
    html: finalBody,
    from: fromHeader,
    headers: buildListUnsubscribeHeaders({ unsubscribeUrl: previewUnsubscribeUrl }),
  });

  await logNotification({
    tenantId: auth.tenantId,
    template: CAMPAIGN_TEMPLATE_LOG,
    subject: `[TEST] ${finalSubject}`,
    recipient: to,
    status: result.ok ? "sent" : "failed",
    meta: {
      campaignId: input.campaignId ?? null,
      testSend: true,
      error: result.ok ? undefined : result.error,
    },
  });

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Nepodařilo se odeslat test." };
  }
  return { ok: true, to };
}

/**
 * Aktualizuje existující draft (např. když uživatel pokračuje v práci na konceptu).
 */
export async function updateEmailCampaignDraft(input: {
  id: string;
  name: string;
  subject: string;
  preheader?: string | null;
  bodyHtml: string;
  templateId?: string | null;
  fromNameOverride?: string | null;
  trackingEnabled?: boolean;
  segmentId?: string | null;
  segmentFilter?: Record<string, unknown> | null;
  scheduledAt?: Date | null;
}): Promise<{ ok: true }> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) {
      throw new Error("Nemáte oprávnění upravovat kampaň.");
    }
    const name = input.name?.trim();
    const subject = input.subject?.trim();
    const bodyHtml = input.bodyHtml?.trim();
    if (!name || !subject || !bodyHtml) {
      throw new Error("Vyplňte název, předmět a tělo zprávy.");
    }
    const [existing] = await tx
      .select({ status: emailCampaigns.status })
      .from(emailCampaigns)
      .where(and(eq(emailCampaigns.id, input.id), eq(emailCampaigns.tenantId, auth.tenantId)))
      .limit(1);
    if (!existing) throw new Error("Kampaň nebyla nalezena.");
    if (existing.status !== "draft" && existing.status !== "scheduled") {
      throw new Error("Upravovat lze jen koncept (draft) nebo naplánovanou kampaň.");
    }
    const nextStatus = input.scheduledAt ? "scheduled" : "draft";
    await tx
      .update(emailCampaigns)
      .set({
        name,
        subject,
        preheader: input.preheader?.trim() || null,
        bodyHtml,
        templateId: input.templateId ?? null,
        fromNameOverride: input.fromNameOverride?.trim() || null,
        trackingEnabled: input.trackingEnabled ?? true,
        segmentId: input.segmentId ?? null,
        segmentFilter: (input.segmentFilter ?? null) as unknown as
          | Record<string, unknown>
          | null,
        scheduledAt: input.scheduledAt ?? null,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(emailCampaigns.id, input.id));
    return { ok: true };
  });
}

/**
 * F2 — rozsype kampaň do fronty (`email_send_queue`). Odeslání pak zajišťuje cron worker
 * `/api/cron/email-queue-worker`. Vrací počet příjemců a čas, kdy se začne posílat.
 */
export async function queueEmailCampaign(input: {
  campaignId: string;
  segmentId?: CampaignSegmentId | null;
  /** ISO 8601 string nebo Date; null/undefined = ihned. */
  scheduledFor?: string | Date | null;
}): Promise<{ ok: true; recipientCount: number; scheduledFor: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    throw new Error("Nemáte oprávnění odesílat kampaň.");
  }
  if (!isFeatureEnabled("email_campaigns_v2_queue", auth.tenantId)) {
    throw new Error(
      "Fronta e-mailových kampaní (v2) není pro váš tenant aktivní. Obraťte se na admina.",
    );
  }
  const scheduledFor = input.scheduledFor
    ? new Date(input.scheduledFor as string | Date)
    : null;
  if (scheduledFor && Number.isNaN(scheduledFor.getTime())) {
    throw new Error("Neplatné datum naplánování.");
  }
  const { recipientCount, scheduledFor: effective } = await enqueueCampaignForSending(auth, {
    campaignId: input.campaignId,
    segmentId: input.segmentId ?? null,
    scheduledFor,
  });
  return { ok: true, recipientCount, scheduledFor: effective.toISOString() };
}

/** Smaže koncept kampaně. */
export async function deleteEmailCampaignDraft(id: string): Promise<{ ok: true }> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) {
      throw new Error("Nemáte oprávnění mazat kampaň.");
    }
    const [existing] = await tx
      .select({ status: emailCampaigns.status })
      .from(emailCampaigns)
      .where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.tenantId, auth.tenantId)))
      .limit(1);
    if (!existing) throw new Error("Kampaň nebyla nalezena.");
    if (existing.status !== "draft" && existing.status !== "scheduled") {
      throw new Error("Smazat lze jen koncept (draft) nebo naplánovanou kampaň.");
    }
    await tx.delete(emailCampaigns).where(eq(emailCampaigns.id, id));
    return { ok: true };
  });
}
