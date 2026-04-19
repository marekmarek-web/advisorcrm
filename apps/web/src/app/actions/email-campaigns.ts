"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  db,
  emailCampaigns,
  emailCampaignRecipients,
  contacts,
  eq,
  and,
  isNull,
  isNotNull,
  desc,
  sql,
} from "db";
import { sendEmail, logNotification } from "@/lib/email/send-email";
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function personalizeHtml(html: string, firstName: string, lastName: string): string {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim() || "kliente";
  return html
    .replace(/\{\{jmeno\}\}/gi, escapeHtml(firstName.trim() || name))
    .replace(/\{\{cele_jmeno\}\}/gi, escapeHtml(name));
}

export async function listEmailCampaigns(): Promise<EmailCampaignRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Nemáte oprávnění.");
  }
  const rows = await db
    .select({
      id: emailCampaigns.id,
      name: emailCampaigns.name,
      subject: emailCampaigns.subject,
      status: emailCampaigns.status,
      createdAt: emailCampaigns.createdAt,
      sentAt: emailCampaigns.sentAt,
    })
    .from(emailCampaigns)
    .where(eq(emailCampaigns.tenantId, auth.tenantId))
    .orderBy(desc(emailCampaigns.createdAt))
    .limit(50);
  return rows;
}

/** Rozšířené data pro novou UI (historie + pokračování draftu). */
export async function listEmailCampaignsFull(): Promise<CampaignListRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Nemáte oprávnění.");
  }
  const rows = await db
    .select({
      id: emailCampaigns.id,
      name: emailCampaigns.name,
      subject: emailCampaigns.subject,
      status: emailCampaigns.status,
      createdAt: emailCampaigns.createdAt,
      sentAt: emailCampaigns.sentAt,
      bodyHtml: emailCampaigns.bodyHtml,
    })
    .from(emailCampaigns)
    .where(eq(emailCampaigns.tenantId, auth.tenantId))
    .orderBy(desc(emailCampaigns.createdAt))
    .limit(50);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const stats = await db
    .select({
      campaignId: emailCampaignRecipients.campaignId,
      status: emailCampaignRecipients.status,
      count: sql<number>`count(*)::int`,
    })
    .from(emailCampaignRecipients)
    .where(
      and(
        eq(emailCampaignRecipients.tenantId, auth.tenantId),
        sql`${emailCampaignRecipients.campaignId} = ANY(${ids}::uuid[])`
      )
    )
    .groupBy(emailCampaignRecipients.campaignId, emailCampaignRecipients.status);

  const sentMap = new Map<string, number>();
  const failedMap = new Map<string, number>();
  for (const s of stats) {
    if (s.status === "sent") sentMap.set(s.campaignId, s.count);
    if (s.status === "failed") failedMap.set(s.campaignId, s.count);
  }

  return rows.map((r) => ({
    ...r,
    sentCount: sentMap.get(r.id) ?? 0,
    failedCount: failedMap.get(r.id) ?? 0,
  }));
}

/** Spočítá počet "eligible" příjemců pro každý segment v aktuálním tenantu. */
export async function getSegmentCounts(): Promise<SegmentCount[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Nemáte oprávnění.");
  }
  const baseEligible = and(
    eq(contacts.tenantId, auth.tenantId),
    isNull(contacts.archivedAt),
    eq(contacts.doNotEmail, false),
    isNull(contacts.notificationUnsubscribedAt),
    isNotNull(contacts.email),
    sql`trim(${contacts.email}) <> ''`
  );

  const results: SegmentCount[] = [];
  for (const seg of CAMPAIGN_SEGMENTS) {
    if (seg.id === "test") {
      results.push({ id: seg.id, label: seg.label, count: 1 });
      continue;
    }
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(and(baseEligible, tagFilterSql(seg.tags)));
    results.push({ id: seg.id, label: seg.label, count: row?.count ?? 0 });
  }
  return results;
}

export async function createEmailCampaignDraft(input: {
  name: string;
  subject: string;
  bodyHtml: string;
}): Promise<{ id: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    throw new Error("Nemáte oprávnění vytvářet kampaň.");
  }
  const name = input.name?.trim();
  const subject = input.subject?.trim();
  const bodyHtml = input.bodyHtml?.trim();
  if (!name || !subject || !bodyHtml) {
    throw new Error("Vyplňte název, předmět a tělo zprávy.");
  }
  const [row] = await db
    .insert(emailCampaigns)
    .values({
      tenantId: auth.tenantId,
      createdByUserId: auth.userId,
      name,
      subject,
      bodyHtml,
      status: "draft",
    })
    .returning({ id: emailCampaigns.id });
  if (!row) throw new Error("Kampaň se nepodařilo vytvořit.");
  return { id: row.id };
}

/**
 * Odešle draft kampaně způsobilým kontaktům (e-mail, ne do_not_email, ne archiv).
 * Volitelně filtrováno dle segmentu (tagy).
 * Placeholdery v HTML: {{jmeno}}, {{cele_jmeno}}, {{unsubscribe_url}}
 *
 * @param segmentId volitelné — pokud není vyplněno, použije se `all`.
 *                  Pro `test` použijte `sendTestCampaign`.
 */
export async function sendEmailCampaign(
  campaignId: string,
  segmentId?: CampaignSegmentId | null
): Promise<SendEmailCampaignResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    throw new Error("Nemáte oprávnění odesílat kampaň.");
  }

  const segment = getSegment(segmentId);
  if (segment.id === "test") {
    throw new Error("Pro testovací odeslání použijte 'Odeslat test'.");
  }

  const [campaign] = await db
    .select()
    .from(emailCampaigns)
    .where(and(eq(emailCampaigns.id, campaignId), eq(emailCampaigns.tenantId, auth.tenantId)))
    .limit(1);
  if (!campaign) throw new Error("Kampaň nebyla nalezena.");
  if (campaign.status !== "draft") {
    throw new Error("Odeslat lze jen koncept (draft).");
  }

  const audience = await db
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
        tagFilterSql(segment.tags)
      )
    )
    .limit(MAX_RECIPIENTS_PER_SEND + 1);

  const capped = audience.length > MAX_RECIPIENTS_PER_SEND;
  const targets = capped ? audience.slice(0, MAX_RECIPIENTS_PER_SEND) : audience;

  await db
    .update(emailCampaigns)
    .set({ status: "sending", updatedAt: new Date() })
    .where(eq(emailCampaigns.id, campaignId));

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const c of targets) {
    const email = c.email!.trim();
    const html = personalizeHtml(campaign.bodyHtml, c.firstName ?? "", c.lastName ?? "");

    const [recRow] = await db
      .insert(emailCampaignRecipients)
      .values({
        tenantId: auth.tenantId,
        campaignId,
        contactId: c.id,
        email,
        status: "pending",
      })
      .returning({ id: emailCampaignRecipients.id });

    if (!recRow) {
      skipped += 1;
      continue;
    }

    const result = await sendEmail({
      to: email,
      subject: campaign.subject,
      html,
    });

    if (result.ok) {
      sent += 1;
      await db
        .update(emailCampaignRecipients)
        .set({
          status: "sent",
          providerMessageId: result.messageId ?? null,
          sentAt: new Date(),
        })
        .where(eq(emailCampaignRecipients.id, recRow.id));
      await logNotification({
        tenantId: auth.tenantId,
        contactId: c.id,
        template: CAMPAIGN_TEMPLATE_LOG,
        subject: campaign.subject,
        recipient: email,
        status: "sent",
        meta: { campaignId, campaignName: campaign.name },
      });
    } else {
      failed += 1;
      await db
        .update(emailCampaignRecipients)
        .set({
          status: "failed",
          errorMessage: result.error ?? "unknown",
        })
        .where(eq(emailCampaignRecipients.id, recRow.id));
      await logNotification({
        tenantId: auth.tenantId,
        contactId: c.id,
        template: CAMPAIGN_TEMPLATE_LOG,
        subject: campaign.subject,
        recipient: email,
        status: "failed",
        meta: { campaignId, error: result.error },
      });
    }
  }

  const finalStatus = failed > 0 && sent === 0 ? "failed" : "sent";
  await db
    .update(emailCampaigns)
    .set({
      status: finalStatus,
      updatedAt: new Date(),
      sentAt: new Date(),
    })
    .where(eq(emailCampaigns.id, campaignId));

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
 * Odešle testovací kampaň pouze na e-mail přihlášeného poradce.
 * Nezapisuje do `email_campaign_recipients` ani nemění status kampaně.
 * Pokud je předáno `input.campaignId`, bere obsah z DB; jinak bere `subject` + `bodyHtml` z parametru (ad-hoc test bez uloženého draftu).
 */
export async function sendTestCampaign(input: {
  campaignId?: string | null;
  subject?: string;
  bodyHtml?: string;
  /** Volitelně přepsaný příjemce – jinak e-mail přihlášeného poradce. */
  to?: string;
}): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    return { ok: false, error: "Nemáte oprávnění odesílat kampaň." };
  }

  let subject = input.subject?.trim() ?? "";
  let bodyHtml = input.bodyHtml?.trim() ?? "";

  if (input.campaignId) {
    const [row] = await db
      .select({ subject: emailCampaigns.subject, bodyHtml: emailCampaigns.bodyHtml })
      .from(emailCampaigns)
      .where(and(eq(emailCampaigns.id, input.campaignId), eq(emailCampaigns.tenantId, auth.tenantId)))
      .limit(1);
    if (!row) return { ok: false, error: "Kampaň nebyla nalezena." };
    if (!subject) subject = row.subject;
    if (!bodyHtml) bodyHtml = row.bodyHtml;
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

  const html = personalizeHtml(bodyHtml, "Jan", "Jan Novák");
  const previewSubject = personalizeHtml(subject, "Jan", "Jan Novák");

  const result = await sendEmail({
    to,
    subject: `[TEST] ${previewSubject}`,
    html,
  });

  await logNotification({
    tenantId: auth.tenantId,
    template: CAMPAIGN_TEMPLATE_LOG,
    subject: `[TEST] ${previewSubject}`,
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
  bodyHtml: string;
}): Promise<{ ok: true }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    throw new Error("Nemáte oprávnění upravovat kampaň.");
  }
  const name = input.name?.trim();
  const subject = input.subject?.trim();
  const bodyHtml = input.bodyHtml?.trim();
  if (!name || !subject || !bodyHtml) {
    throw new Error("Vyplňte název, předmět a tělo zprávy.");
  }
  const [existing] = await db
    .select({ status: emailCampaigns.status })
    .from(emailCampaigns)
    .where(and(eq(emailCampaigns.id, input.id), eq(emailCampaigns.tenantId, auth.tenantId)))
    .limit(1);
  if (!existing) throw new Error("Kampaň nebyla nalezena.");
  if (existing.status !== "draft") {
    throw new Error("Upravovat lze jen koncept (draft).");
  }
  await db
    .update(emailCampaigns)
    .set({ name, subject, bodyHtml, updatedAt: new Date() })
    .where(eq(emailCampaigns.id, input.id));
  return { ok: true };
}

/** Smaže koncept kampaně. */
export async function deleteEmailCampaignDraft(id: string): Promise<{ ok: true }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) {
    throw new Error("Nemáte oprávnění mazat kampaň.");
  }
  const [existing] = await db
    .select({ status: emailCampaigns.status })
    .from(emailCampaigns)
    .where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.tenantId, auth.tenantId)))
    .limit(1);
  if (!existing) throw new Error("Kampaň nebyla nalezena.");
  if (existing.status !== "draft") {
    throw new Error("Smazat lze jen koncept (draft).");
  }
  await db.delete(emailCampaigns).where(eq(emailCampaigns.id, id));
  return { ok: true };
}
