import "server-only";

import {
  emailCampaigns,
  emailCampaignRecipients,
  emailCampaignEvents,
  emailSendQueue,
  contacts,
  eq,
  and,
  isNull,
  isNotNull,
  sql,
  inArray,
  desc,
} from "db";
import { dbService, withServiceTenantContext } from "@/lib/db/service-db";
import { mintTrackingToken } from "@/lib/email/queue-enqueue";

type AbMetadata = {
  splitPercent: number;
  finalizeAt: string;
  pickedWinnerVariant: "a" | "b" | null;
  finalizedAt: string | null;
  holdoutContactIds: string[];
};

function readAbMetadata(
  segmentFilter: unknown,
): { filter: unknown; ab: AbMetadata | null } {
  if (!segmentFilter || typeof segmentFilter !== "object") {
    return { filter: null, ab: null };
  }
  const obj = segmentFilter as Record<string, unknown>;
  if (obj._ab && typeof obj._ab === "object") {
    return { filter: obj.__filter ?? null, ab: obj._ab as AbMetadata };
  }
  return { filter: segmentFilter, ab: null };
}

function writeAbMetadata(filter: unknown, ab: AbMetadata): Record<string, unknown> {
  return { __filter: filter, _ab: ab };
}

type TxLike = Parameters<Parameters<typeof withServiceTenantContext<unknown>>[1]>[0];

async function computeStats(
  tx: TxLike,
  campaignId: string,
): Promise<{ sent: number; opened: number }> {
  const rows = await tx
    .select({
      status: emailCampaignRecipients.status,
      openedAt: emailCampaignRecipients.openedAt,
    })
    .from(emailCampaignRecipients)
    .where(eq(emailCampaignRecipients.campaignId, campaignId));
  let sent = 0;
  let opened = 0;
  for (const r of rows as Array<{ status: string; openedAt: Date | null }>) {
    if (["sent", "delivered", "opened", "clicked"].includes(r.status)) sent += 1;
    if (r.openedAt) opened += 1;
  }
  return { sent, opened };
}

async function insertRecipientsAndQueue(
  tx: TxLike,
  tenantId: string,
  campaignId: string,
  audience: Array<{
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  }>,
  scheduledFor: Date,
): Promise<void> {
  if (audience.length === 0) return;
  const recipientValues = audience.map((c) => ({
    tenantId,
    campaignId,
    contactId: c.id,
    email: (c.email ?? "").trim(),
    status: "queued" as const,
    trackingToken: mintTrackingToken(),
  }));
  const recipients = await tx
    .insert(emailCampaignRecipients)
    .values(recipientValues)
    .returning({
      id: emailCampaignRecipients.id,
      contactId: emailCampaignRecipients.contactId,
    });
  const byContact = new Map(audience.map((c) => [c.id, c]));
  const queueRows = recipients.flatMap((r: { id: string; contactId: string }) => {
    const c = byContact.get(r.contactId);
    if (!c) return [];
    return [
      {
        tenantId,
        campaignId,
        recipientId: r.id,
        scheduledFor,
        nextAttemptAt: scheduledFor,
        status: "pending" as const,
        payload: {
          firstName: c.firstName ?? "",
          lastName: c.lastName ?? "",
          email: (c.email ?? "").trim(),
        },
      },
    ];
  });
  if (queueRows.length > 0) {
    await tx.insert(emailSendQueue).values(queueRows);
  }
  await tx.insert(emailCampaignEvents).values(
    recipients.map((r: { id: string }) => ({
      tenantId,
      campaignId,
      recipientId: r.id,
      eventType: "queued",
    })),
  );
}

/**
 * Projde parent kampaně s `_ab.finalizeAt <= now()` a u nich spustí finalizaci
 * A/B testu (vybrat vítěze dle open-rate, odeslat holdout zbytek).
 */
export async function finalizeDueAbTests(): Promise<number> {
  const candidates = await dbService
    .select({
      id: emailCampaigns.id,
      tenantId: emailCampaigns.tenantId,
      segmentFilter: emailCampaigns.segmentFilter,
    })
    .from(emailCampaigns)
    .where(
      and(
        isNull(emailCampaigns.parentCampaignId),
        isNull(emailCampaigns.abWinnerAt),
        sql`${emailCampaigns.segmentFilter}::jsonb ? '_ab'`,
      ),
    )
    .orderBy(desc(emailCampaigns.createdAt))
    .limit(50);

  let finalized = 0;
  for (const c of candidates) {
    const { ab, filter } = readAbMetadata(c.segmentFilter);
    if (!ab || ab.finalizedAt) continue;
    if (new Date(ab.finalizeAt) > new Date()) continue;
    try {
      await withServiceTenantContext({ tenantId: c.tenantId }, async (tx) => {
        const [parent] = await tx
          .select()
          .from(emailCampaigns)
          .where(eq(emailCampaigns.id, c.id))
          .limit(1);
        if (!parent) return;
        const { ab: parsed } = readAbMetadata(parent.segmentFilter);
        if (!parsed || parsed.finalizedAt) return;

        const [variantB] = await tx
          .select()
          .from(emailCampaigns)
          .where(
            and(
              eq(emailCampaigns.parentCampaignId, parent.id),
              eq(emailCampaigns.abVariant, "b"),
            ),
          )
          .limit(1);
        if (!variantB) return;

        const aStats = await computeStats(tx, parent.id);
        const bStats = await computeStats(tx, variantB.id);
        const aRate = aStats.sent > 0 ? aStats.opened / aStats.sent : 0;
        const bRate = bStats.sent > 0 ? bStats.opened / bStats.sent : 0;
        const winner: "a" | "b" = bRate > aRate ? "b" : "a";
        const winnerCampaignId = winner === "a" ? parent.id : variantB.id;

        const holdoutIds = parsed.holdoutContactIds ?? [];
        if (holdoutIds.length > 0) {
          const holdoutContacts = await tx
            .select({
              id: contacts.id,
              email: contacts.email,
              firstName: contacts.firstName,
              lastName: contacts.lastName,
            })
            .from(contacts)
            .where(
              and(
                eq(contacts.tenantId, c.tenantId),
                inArray(contacts.id, holdoutIds),
                isNull(contacts.archivedAt),
                eq(contacts.doNotEmail, false),
                isNull(contacts.notificationUnsubscribedAt),
                isNotNull(contacts.email),
                sql`trim(${contacts.email}) <> ''`,
              ),
            );
          if (holdoutContacts.length > 0) {
            await insertRecipientsAndQueue(
              tx,
              c.tenantId,
              winnerCampaignId,
              holdoutContacts,
              new Date(),
            );
            await tx
              .update(emailCampaigns)
              .set({
                recipientCount: sql`${emailCampaigns.recipientCount} + ${holdoutContacts.length}`,
                updatedAt: new Date(),
              })
              .where(eq(emailCampaigns.id, winnerCampaignId));
          }
        }

        const finalizedMeta: AbMetadata = {
          ...parsed,
          pickedWinnerVariant: winner,
          finalizedAt: new Date().toISOString(),
          holdoutContactIds: [],
        };
        await tx
          .update(emailCampaigns)
          .set({
            abWinnerAt: new Date(),
            segmentFilter: writeAbMetadata(filter, finalizedMeta),
            updatedAt: new Date(),
          })
          .where(eq(emailCampaigns.id, parent.id));
      });
      finalized += 1;
    } catch (e) {
      console.error("[ab] finalize failed", c.id, e);
    }
  }
  return finalized;
}
