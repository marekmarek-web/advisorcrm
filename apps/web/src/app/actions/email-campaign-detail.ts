"use server";

import { withAuthContext } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import {
  emailCampaigns,
  emailCampaignRecipients,
  emailCampaignEvents,
  emailSendQueue,
  contacts,
  eq,
  and,
  desc,
  sql,
} from "db";

export type CampaignDetailKpis = {
  recipientCount: number;
  queuedCount: number;
  pendingCount: number;
  sentCount: number;
  deliveredCount: number;
  openCount: number;
  clickCount: number;
  bounceCount: number;
  complaintCount: number;
  unsubscribeCount: number;
  failedCount: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
};

export type CampaignRecipientRow = {
  id: string;
  contactId: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  sentAt: Date | null;
  deliveredAt: Date | null;
  openedAt: Date | null;
  firstClickAt: Date | null;
  clickCount: number;
  bouncedAt: Date | null;
  bounceType: string | null;
  complaintAt: Date | null;
  unsubscribedAt: Date | null;
  errorMessage: string | null;
};

export type AbVariantStats = {
  campaignId: string;
  subject: string;
  sentCount: number;
  openCount: number;
  clickCount: number;
  openRate: number;
  clickRate: number;
};

export type AbTestInfo = {
  splitPercent: number;
  finalizeAt: string;
  finalizedAt: string | null;
  pickedWinnerVariant: "a" | "b" | null;
  holdoutPendingCount: number;
  variantA: AbVariantStats;
  variantB: AbVariantStats;
};

export type CampaignDetailPayload = {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  status: string;
  scheduledAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
  kpis: CampaignDetailKpis;
  recipients: CampaignRecipientRow[];
  /** daily buckets of 'opened'/'clicked' eventů za posledních 14 dní. */
  sparkline: { date: string; opens: number; clicks: number }[];
  /** Pokud je kampaň součástí A/B testu (parent A), tady jsou data B varianty i metadata. */
  abTest: AbTestInfo | null;
};

export async function getCampaignDetail(campaignId: string): Promise<CampaignDetailPayload> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) {
      throw new Error("Nemáte oprávnění.");
    }

    const [campaign] = await tx
      .select({
        id: emailCampaigns.id,
        name: emailCampaigns.name,
        subject: emailCampaigns.subject,
        preheader: emailCampaigns.preheader,
        status: emailCampaigns.status,
        scheduledAt: emailCampaigns.scheduledAt,
        sentAt: emailCampaigns.sentAt,
        createdAt: emailCampaigns.createdAt,
        recipientCount: emailCampaigns.recipientCount,
        parentCampaignId: emailCampaigns.parentCampaignId,
        abVariant: emailCampaigns.abVariant,
        segmentFilter: emailCampaigns.segmentFilter,
      })
      .from(emailCampaigns)
      .where(and(eq(emailCampaigns.id, campaignId), eq(emailCampaigns.tenantId, auth.tenantId)))
      .limit(1);
    if (!campaign) throw new Error("Kampaň nebyla nalezena.");

    const [stats] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        sent: sql<number>`count(*) filter (where ${emailCampaignRecipients.status} in ('sent','delivered','opened','clicked'))::int`,
        delivered: sql<number>`count(*) filter (where ${emailCampaignRecipients.deliveredAt} is not null)::int`,
        opened: sql<number>`count(*) filter (where ${emailCampaignRecipients.openedAt} is not null)::int`,
        clicked: sql<number>`count(*) filter (where ${emailCampaignRecipients.firstClickAt} is not null)::int`,
        bounced: sql<number>`count(*) filter (where ${emailCampaignRecipients.bouncedAt} is not null)::int`,
        complained: sql<number>`count(*) filter (where ${emailCampaignRecipients.complaintAt} is not null)::int`,
        unsubscribed: sql<number>`count(*) filter (where ${emailCampaignRecipients.unsubscribedAt} is not null)::int`,
        failed: sql<number>`count(*) filter (where ${emailCampaignRecipients.status} = 'failed')::int`,
      })
      .from(emailCampaignRecipients)
      .where(
        and(
          eq(emailCampaignRecipients.tenantId, auth.tenantId),
          eq(emailCampaignRecipients.campaignId, campaignId),
        ),
      );

    const [queueStats] = await tx
      .select({
        pending: sql<number>`count(*) filter (where ${emailSendQueue.status} = 'pending')::int`,
        processing: sql<number>`count(*) filter (where ${emailSendQueue.status} = 'processing')::int`,
      })
      .from(emailSendQueue)
      .where(
        and(
          eq(emailSendQueue.tenantId, auth.tenantId),
          eq(emailSendQueue.campaignId, campaignId),
        ),
      );

    const total = stats?.total ?? 0;
    const opened = stats?.opened ?? 0;
    const clicked = stats?.clicked ?? 0;
    const bounced = stats?.bounced ?? 0;
    const kpis: CampaignDetailKpis = {
      recipientCount: Math.max(campaign.recipientCount, total),
      queuedCount: (queueStats?.pending ?? 0) + (queueStats?.processing ?? 0),
      pendingCount: queueStats?.pending ?? 0,
      sentCount: stats?.sent ?? 0,
      deliveredCount: stats?.delivered ?? 0,
      openCount: opened,
      clickCount: clicked,
      bounceCount: bounced,
      complaintCount: stats?.complained ?? 0,
      unsubscribeCount: stats?.unsubscribed ?? 0,
      failedCount: stats?.failed ?? 0,
      openRate: total > 0 ? opened / total : 0,
      clickRate: total > 0 ? clicked / total : 0,
      bounceRate: total > 0 ? bounced / total : 0,
    };

    const recipients = await tx
      .select({
        id: emailCampaignRecipients.id,
        contactId: emailCampaignRecipients.contactId,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        email: emailCampaignRecipients.email,
        status: emailCampaignRecipients.status,
        sentAt: emailCampaignRecipients.sentAt,
        deliveredAt: emailCampaignRecipients.deliveredAt,
        openedAt: emailCampaignRecipients.openedAt,
        firstClickAt: emailCampaignRecipients.firstClickAt,
        clickCount: emailCampaignRecipients.clickCount,
        bouncedAt: emailCampaignRecipients.bouncedAt,
        bounceType: emailCampaignRecipients.bounceType,
        complaintAt: emailCampaignRecipients.complaintAt,
        unsubscribedAt: emailCampaignRecipients.unsubscribedAt,
        errorMessage: emailCampaignRecipients.errorMessage,
      })
      .from(emailCampaignRecipients)
      .innerJoin(contacts, eq(contacts.id, emailCampaignRecipients.contactId))
      .where(
        and(
          eq(emailCampaignRecipients.tenantId, auth.tenantId),
          eq(emailCampaignRecipients.campaignId, campaignId),
        ),
      )
      .orderBy(desc(emailCampaignRecipients.sentAt))
      .limit(500);

    const sparklineRows = await tx.execute(sql`
      SELECT
        to_char(date_trunc('day', occurred_at), 'YYYY-MM-DD') AS day,
        count(*) filter (where event_type = 'opened')::int AS opens,
        count(*) filter (where event_type = 'clicked')::int AS clicks
      FROM email_campaign_events
      WHERE tenant_id = ${auth.tenantId}::uuid
        AND campaign_id = ${campaignId}::uuid
        AND occurred_at >= now() - interval '14 days'
      GROUP BY 1
      ORDER BY 1 ASC
    `);
    const sparkline = (
      sparklineRows as unknown as Array<{ day: string; opens: number; clicks: number }>
    ).map((r) => ({ date: r.day, opens: r.opens, clicks: r.clicks }));

    let abTest: AbTestInfo | null = null;
    if (campaign.parentCampaignId === null) {
      const abMeta = extractAbMetadata(campaign.segmentFilter);
      if (abMeta) {
        const [variantB] = await tx
          .select({
            id: emailCampaigns.id,
            subject: emailCampaigns.subject,
            recipientCount: emailCampaigns.recipientCount,
          })
          .from(emailCampaigns)
          .where(
            and(
              eq(emailCampaigns.parentCampaignId, campaign.id),
              eq(emailCampaigns.abVariant, "b"),
              eq(emailCampaigns.tenantId, auth.tenantId),
            ),
          )
          .limit(1);
        if (variantB) {
          const [bStats] = await tx
            .select({
              total: sql<number>`count(*)::int`,
              sent: sql<number>`count(*) filter (where ${emailCampaignRecipients.status} in ('sent','delivered','opened','clicked'))::int`,
              opened: sql<number>`count(*) filter (where ${emailCampaignRecipients.openedAt} is not null)::int`,
              clicked: sql<number>`count(*) filter (where ${emailCampaignRecipients.firstClickAt} is not null)::int`,
            })
            .from(emailCampaignRecipients)
            .where(
              and(
                eq(emailCampaignRecipients.tenantId, auth.tenantId),
                eq(emailCampaignRecipients.campaignId, variantB.id),
              ),
            );
          const aSent = kpis.sentCount;
          const aOpen = kpis.openCount;
          const aClick = kpis.clickCount;
          const bTotal = bStats?.total ?? 0;
          const bSent = bStats?.sent ?? 0;
          const bOpen = bStats?.opened ?? 0;
          const bClick = bStats?.clicked ?? 0;
          abTest = {
            splitPercent: abMeta.splitPercent,
            finalizeAt: abMeta.finalizeAt,
            finalizedAt: abMeta.finalizedAt,
            pickedWinnerVariant: abMeta.pickedWinnerVariant,
            holdoutPendingCount: abMeta.finalizedAt ? 0 : (abMeta.holdoutContactIds?.length ?? 0),
            variantA: {
              campaignId: campaign.id,
              subject: campaign.subject,
              sentCount: aSent,
              openCount: aOpen,
              clickCount: aClick,
              openRate: aSent > 0 ? aOpen / aSent : 0,
              clickRate: aSent > 0 ? aClick / aSent : 0,
            },
            variantB: {
              campaignId: variantB.id,
              subject: variantB.subject,
              sentCount: bSent,
              openCount: bOpen,
              clickCount: bClick,
              openRate: bSent > 0 ? bOpen / bSent : 0,
              clickRate: bSent > 0 ? bClick / bSent : 0,
            },
          };
          void bTotal;
        }
      }
    }

    const {
      parentCampaignId: _parentCampaignId,
      abVariant: _abVariant,
      segmentFilter: _segmentFilter,
      ...campaignPublic
    } = campaign;
    void _parentCampaignId;
    void _abVariant;
    void _segmentFilter;

    return { ...campaignPublic, kpis, recipients, sparkline, abTest };
  });
}

function extractAbMetadata(
  segmentFilter: unknown,
): {
  splitPercent: number;
  finalizeAt: string;
  pickedWinnerVariant: "a" | "b" | null;
  finalizedAt: string | null;
  holdoutContactIds: string[];
} | null {
  if (!segmentFilter || typeof segmentFilter !== "object") return null;
  const obj = segmentFilter as Record<string, unknown>;
  const ab = obj._ab;
  if (!ab || typeof ab !== "object") return null;
  const a = ab as Record<string, unknown>;
  const splitPercent = typeof a.splitPercent === "number" ? a.splitPercent : 20;
  const finalizeAt = typeof a.finalizeAt === "string" ? a.finalizeAt : new Date().toISOString();
  const pickedWinnerVariant =
    a.pickedWinnerVariant === "a" || a.pickedWinnerVariant === "b"
      ? (a.pickedWinnerVariant as "a" | "b")
      : null;
  const finalizedAt = typeof a.finalizedAt === "string" ? a.finalizedAt : null;
  const holdoutContactIds = Array.isArray(a.holdoutContactIds)
    ? (a.holdoutContactIds.filter((x) => typeof x === "string") as string[])
    : [];
  return { splitPercent, finalizeAt, pickedWinnerVariant, finalizedAt, holdoutContactIds };
}

export async function cancelScheduledCampaign(campaignId: string): Promise<{ ok: true }> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) {
      throw new Error("Nemáte oprávnění.");
    }
    // Kampaň zůstává jako 'draft' — pokud neexistují žádné sent recipients, smažou se i queue entries.
    await tx
      .update(emailSendQueue)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(emailSendQueue.campaignId, campaignId),
          eq(emailSendQueue.tenantId, auth.tenantId),
          eq(emailSendQueue.status, "pending"),
        ),
      );
    await tx
      .update(emailCampaigns)
      .set({ status: "draft", scheduledAt: null, queuedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(emailCampaigns.id, campaignId),
          eq(emailCampaigns.tenantId, auth.tenantId),
          sql`${emailCampaigns.status} IN ('scheduled','queued')`,
        ),
      );
    return { ok: true };
  });
}
