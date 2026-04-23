"use server";

import { withAuthContext } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import {
  referralRequests,
  contacts,
  emailCampaigns,
  emailCampaignRecipients,
  emailSendQueue,
  emailTemplates,
  eq,
  and,
  desc,
  sql,
} from "db";
import { mintTrackingToken } from "@/lib/email/queue-enqueue";

export type ReferralRequestRow = {
  id: string;
  contactId: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  status: string;
  token: string;
  openedAt: Date | null;
  submittedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
};

/**
 * Vytvoří referral token pro kontakt a volitelně zařadí e-mail s odkazem do fronty.
 * Token je opaque 32-hex; landing page se nachází na `/r/<token>`.
 */
export async function createReferralRequest(input: {
  contactId: string;
  /** Pokud true, zařadí do fronty e-mail s odkazem. */
  sendEmail?: boolean;
  /** Override standardní 60denní platnosti. */
  expiresInDays?: number;
}): Promise<{ id: string; token: string; url: string }> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) {
      throw new Error("Nemáte oprávnění.");
    }

    const [contact] = await tx
      .select({
        id: contacts.id,
        email: contacts.email,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        doNotEmail: contacts.doNotEmail,
      })
      .from(contacts)
      .where(and(eq(contacts.id, input.contactId), eq(contacts.tenantId, auth.tenantId)))
      .limit(1);
    if (!contact) throw new Error("Kontakt nebyl nalezen.");

    const token = mintTrackingToken();
    const expiresAt = new Date(Date.now() + (input.expiresInDays ?? 60) * 24 * 60 * 60 * 1000);

    const [created] = await tx
      .insert(referralRequests)
      .values({
        tenantId: auth.tenantId,
        requestedByUserId: auth.userId,
        contactId: contact.id,
        token,
        status: "sent",
        expiresAt,
      })
      .returning({ id: referralRequests.id });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const url = `${appUrl}/r/${token}`;

    if (input.sendEmail && contact.email && !contact.doNotEmail) {
      const [template] = await tx
        .select()
        .from(emailTemplates)
        .where(and(eq(emailTemplates.kind, "referral_ask"), eq(emailTemplates.isArchived, false)))
        .limit(1);

      if (template) {
        const bodyHtml = template.bodyHtml.replaceAll("{{referral_url}}", url);

        const [campaign] = await tx
          .insert(emailCampaigns)
          .values({
            tenantId: auth.tenantId,
            createdByUserId: auth.userId,
            name: `Žádost o doporučení — ${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim(),
            subject: template.subject,
            preheader: template.preheader,
            bodyHtml,
            status: "queued",
            queuedAt: new Date(),
            recipientCount: 1,
          })
          .returning({ id: emailCampaigns.id });

        const recipientToken = mintTrackingToken();
        const now = new Date();
        const [recipientRow] = await tx
          .insert(emailCampaignRecipients)
          .values({
            tenantId: auth.tenantId,
            campaignId: campaign!.id,
            contactId: contact.id,
            email: contact.email,
            trackingToken: recipientToken,
            status: "queued",
          })
          .returning({ id: emailCampaignRecipients.id });
        await tx.insert(emailSendQueue).values({
          tenantId: auth.tenantId,
          campaignId: campaign!.id,
          recipientId: recipientRow!.id,
          scheduledFor: now,
          nextAttemptAt: now,
          status: "pending",
          payload: {
            firstName: contact.firstName ?? "",
            lastName: contact.lastName ?? "",
            email: contact.email.trim(),
          },
        });

        await tx
          .update(referralRequests)
          .set({ campaignId: campaign!.id, updatedAt: new Date() })
          .where(eq(referralRequests.id, created!.id));
      }
    }

    return { id: created!.id, token, url };
  });
}

export async function listReferralRequests(): Promise<ReferralRequestRow[]> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) {
      throw new Error("Nemáte oprávnění.");
    }
    const rows = await tx
      .select({
        id: referralRequests.id,
        contactId: referralRequests.contactId,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        status: referralRequests.status,
        token: referralRequests.token,
        openedAt: referralRequests.openedAt,
        submittedAt: referralRequests.submittedAt,
        expiresAt: referralRequests.expiresAt,
        createdAt: referralRequests.createdAt,
      })
      .from(referralRequests)
      .leftJoin(contacts, eq(contacts.id, referralRequests.contactId))
      .where(eq(referralRequests.tenantId, auth.tenantId))
      .orderBy(desc(referralRequests.createdAt))
      .limit(200);
    return rows;
  });
}

export type ReferralStats = {
  total: number;
  opened: number;
  submitted: number;
  conversionRate: number;
};

export async function getReferralStats(): Promise<ReferralStats> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) {
      return { total: 0, opened: 0, submitted: 0, conversionRate: 0 };
    }
    const [row] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        opened: sql<number>`count(*) filter (where opened_at is not null)::int`,
        submitted: sql<number>`count(*) filter (where submitted_at is not null)::int`,
      })
      .from(referralRequests)
      .where(eq(referralRequests.tenantId, auth.tenantId));
    const total = row?.total ?? 0;
    return {
      total,
      opened: row?.opened ?? 0,
      submitted: row?.submitted ?? 0,
      conversionRate: total > 0 ? (row?.submitted ?? 0) / total : 0,
    };
  });
}
