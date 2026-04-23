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
  isNull,
  isNotNull,
  sql,
  inArray,
} from "db";
import {
  isValidSegmentFilter,
  buildSegmentFilterSql,
  type SegmentFilter,
} from "@/lib/email/segment-filter";
import { mintTrackingToken } from "@/lib/email/queue-enqueue";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";

/**
 * Metadata A/B testu uložená v `segment_filter` (jsonb) parent kampaně.
 * Obalujeme do struktury `{ __filter, _ab }` aby nerozbila existující
 * isValidSegmentFilter checker v ostatním kódu.
 */
type AbMetadata = {
  splitPercent: number;
  finalizeAt: string;
  pickedWinnerVariant: "a" | "b" | null;
  finalizedAt: string | null;
  holdoutContactIds: string[];
};

function readAbMetadata(
  segmentFilter: unknown,
): { filter: SegmentFilter | null; ab: AbMetadata | null } {
  if (!segmentFilter || typeof segmentFilter !== "object") {
    return { filter: null, ab: null };
  }
  const obj = segmentFilter as Record<string, unknown>;
  if (obj._ab && typeof obj._ab === "object") {
    const ab = obj._ab as AbMetadata;
    const filter = isValidSegmentFilter(obj.__filter) ? (obj.__filter as SegmentFilter) : null;
    return { filter, ab };
  }
  return {
    filter: isValidSegmentFilter(segmentFilter) ? (segmentFilter as SegmentFilter) : null,
    ab: null,
  };
}

function writeAbMetadata(
  filter: SegmentFilter | null,
  ab: AbMetadata,
): Record<string, unknown> {
  return { __filter: filter, _ab: ab };
}

export async function createAbVariant(input: {
  parentCampaignId: string;
  subjectB: string;
  preheaderB?: string | null;
}): Promise<{ variantBId: string }> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) {
      throw new Error("Nemáte oprávnění.");
    }
    if (!isFeatureEnabled("email_campaigns_v2_ab", auth.tenantId)) {
      throw new Error("A/B testing e-mailů není aktivní.");
    }
    const subjectB = input.subjectB.trim();
    if (!subjectB) throw new Error("Zadejte subject pro variantu B.");

    const [parent] = await tx
      .select()
      .from(emailCampaigns)
      .where(
        and(
          eq(emailCampaigns.id, input.parentCampaignId),
          eq(emailCampaigns.tenantId, auth.tenantId),
        ),
      )
      .limit(1);
    if (!parent) throw new Error("Kampaň nebyla nalezena.");
    if (parent.status !== "draft") {
      throw new Error("A/B variantu lze vytvořit jen u konceptu.");
    }
    if (parent.parentCampaignId) {
      throw new Error("Kampaň je sama variantou; A/B musí vycházet z hlavní kampaně.");
    }

    const [variant] = await tx
      .insert(emailCampaigns)
      .values({
        tenantId: auth.tenantId,
        createdByUserId: auth.userId,
        name: `${parent.name} — varianta B`,
        subject: subjectB,
        preheader: input.preheaderB?.trim() || parent.preheader,
        bodyHtml: parent.bodyHtml,
        status: "draft",
        segmentId: parent.segmentId,
        segmentFilter: parent.segmentFilter as Record<string, unknown> | null,
        templateId: parent.templateId,
        fromNameOverride: parent.fromNameOverride,
        trackingEnabled: parent.trackingEnabled,
        parentCampaignId: parent.id,
        abVariant: "b",
      })
      .returning({ id: emailCampaigns.id });
    if (!variant) throw new Error("Variantu B se nepodařilo vytvořit.");

    await tx
      .update(emailCampaigns)
      .set({ abVariant: "a", updatedAt: new Date() })
      .where(eq(emailCampaigns.id, parent.id));

    return { variantBId: variant.id };
  });
}

export async function launchAbTest(input: {
  parentCampaignId: string;
  splitPercent?: number;
  pickWinnerAfterMinutes?: number;
}): Promise<{
  variantAQueued: number;
  variantBQueued: number;
  holdoutCount: number;
  finalizeAt: string;
}> {
  const splitPercent = Math.max(10, Math.min(40, input.splitPercent ?? 20));
  const pickAfterMin = Math.max(30, Math.min(60 * 24, input.pickWinnerAfterMinutes ?? 240));
  const finalizeAt = new Date(Date.now() + pickAfterMin * 60 * 1000);

  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) {
      throw new Error("Nemáte oprávnění.");
    }
    if (!isFeatureEnabled("email_campaigns_v2_ab", auth.tenantId)) {
      throw new Error("A/B testing e-mailů není aktivní.");
    }
    const [parent] = await tx
      .select()
      .from(emailCampaigns)
      .where(
        and(
          eq(emailCampaigns.id, input.parentCampaignId),
          eq(emailCampaigns.tenantId, auth.tenantId),
          isNull(emailCampaigns.parentCampaignId),
        ),
      )
      .limit(1);
    if (!parent) throw new Error("Hlavní kampaň (A) nebyla nalezena.");
    if (parent.status !== "draft") {
      throw new Error("A/B lze spustit jen z konceptu.");
    }

    const [variantB] = await tx
      .select()
      .from(emailCampaigns)
      .where(
        and(
          eq(emailCampaigns.parentCampaignId, parent.id),
          eq(emailCampaigns.abVariant, "b"),
          eq(emailCampaigns.tenantId, auth.tenantId),
        ),
      )
      .limit(1);
    if (!variantB) {
      throw new Error("Varianta B neexistuje. Nejprve ji vytvořte přes createAbVariant.");
    }

    const { filter } = readAbMetadata(parent.segmentFilter);
    const customFilter =
      filter && isValidSegmentFilter(filter) ? buildSegmentFilterSql(filter) : sql`true`;

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
          customFilter,
        ),
      );

    if (audience.length < 10) {
      throw new Error("Pro A/B test doporučujeme alespoň 10 příjemců.");
    }

    const shuffled = [...audience].sort(() => Math.random() - 0.5);
    const aCount = Math.max(1, Math.floor((audience.length * splitPercent) / 100));
    const bCount = Math.max(1, Math.floor((audience.length * splitPercent) / 100));
    const aSlice = shuffled.slice(0, aCount);
    const bSlice = shuffled.slice(aCount, aCount + bCount);
    const holdout = shuffled.slice(aCount + bCount);

    await insertRecipientsAndQueue(tx, auth.tenantId, parent.id, aSlice, new Date());
    await insertRecipientsAndQueue(tx, auth.tenantId, variantB.id, bSlice, new Date());

    const abMeta: AbMetadata = {
      splitPercent,
      finalizeAt: finalizeAt.toISOString(),
      pickedWinnerVariant: null,
      finalizedAt: null,
      holdoutContactIds: holdout.map((c) => c.id),
    };

    await tx
      .update(emailCampaigns)
      .set({
        status: "queued",
        queuedAt: new Date(),
        recipientCount: aSlice.length,
        segmentFilter: writeAbMetadata(filter, abMeta),
        updatedAt: new Date(),
      })
      .where(eq(emailCampaigns.id, parent.id));

    await tx
      .update(emailCampaigns)
      .set({
        status: "queued",
        queuedAt: new Date(),
        recipientCount: bSlice.length,
        updatedAt: new Date(),
      })
      .where(eq(emailCampaigns.id, variantB.id));

    return {
      variantAQueued: aSlice.length,
      variantBQueued: bSlice.length,
      holdoutCount: holdout.length,
      finalizeAt: finalizeAt.toISOString(),
    };
  });
}

export async function finalizeAbTestWinner(
  parentCampaignId: string,
): Promise<{ winner: "a" | "b" | null; holdoutQueued: number; aOpenRate: number; bOpenRate: number }> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) {
      throw new Error("Nemáte oprávnění.");
    }
    const [parent] = await tx
      .select()
      .from(emailCampaigns)
      .where(
        and(
          eq(emailCampaigns.id, parentCampaignId),
          eq(emailCampaigns.tenantId, auth.tenantId),
          isNull(emailCampaigns.parentCampaignId),
        ),
      )
      .limit(1);
    if (!parent) throw new Error("A kampaň nebyla nalezena.");

    const { filter, ab } = readAbMetadata(parent.segmentFilter);
    if (!ab) throw new Error("Tato kampaň není součástí A/B testu.");
    if (ab.finalizedAt) {
      return {
        winner: ab.pickedWinnerVariant,
        holdoutQueued: 0,
        aOpenRate: 0,
        bOpenRate: 0,
      };
    }

    const [variantB] = await tx
      .select()
      .from(emailCampaigns)
      .where(
        and(
          eq(emailCampaigns.parentCampaignId, parent.id),
          eq(emailCampaigns.abVariant, "b"),
          eq(emailCampaigns.tenantId, auth.tenantId),
        ),
      )
      .limit(1);
    if (!variantB) throw new Error("Varianta B neexistuje.");

    const aStats = await computeStats(tx, parent.id);
    const bStats = await computeStats(tx, variantB.id);
    const aRate = aStats.sent > 0 ? aStats.opened / aStats.sent : 0;
    const bRate = bStats.sent > 0 ? bStats.opened / bStats.sent : 0;

    const winner: "a" | "b" = bRate > aRate ? "b" : "a";
    const winnerCampaignId = winner === "a" ? parent.id : variantB.id;

    const holdoutIds = ab.holdoutContactIds ?? [];
    let holdoutQueued = 0;
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
            eq(contacts.tenantId, auth.tenantId),
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
          auth.tenantId,
          winnerCampaignId,
          holdoutContacts,
          new Date(),
        );
        holdoutQueued = holdoutContacts.length;

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
      ...ab,
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

    return { winner, holdoutQueued, aOpenRate: aRate, bOpenRate: bRate };
  });
}

type TxLike = Parameters<Parameters<typeof withAuthContext<unknown>>[0]>[1];

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

async function computeStats(
  tx: TxLike,
  campaignId: string,
): Promise<{ sent: number; opened: number; clicked: number }> {
  const rows = await tx
    .select({
      status: emailCampaignRecipients.status,
      openedAt: emailCampaignRecipients.openedAt,
      clickCount: emailCampaignRecipients.clickCount,
    })
    .from(emailCampaignRecipients)
    .where(eq(emailCampaignRecipients.campaignId, campaignId));

  let sent = 0;
  let opened = 0;
  let clicked = 0;
  for (const r of rows as Array<{
    status: string;
    openedAt: Date | null;
    clickCount: number | null;
  }>) {
    if (["sent", "delivered", "opened", "clicked"].includes(r.status)) sent += 1;
    if (r.openedAt) opened += 1;
    if ((r.clickCount ?? 0) > 0) clicked += 1;
  }
  return { sent, opened, clicked };
}

