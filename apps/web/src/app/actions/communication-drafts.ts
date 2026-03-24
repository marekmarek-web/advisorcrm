"use server";

import { db, communicationDrafts, eq, and, desc } from "db";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { logAuditAction } from "@/lib/audit";

export async function createDraft(params: {
  contactId?: string;
  draftType: string;
  subject: string;
  body: string;
  referencedEntityType?: string;
  referencedEntityId?: string;
  metadata?: Record<string, unknown>;
}) {
  const auth = await requireAuthInAction();
  const [row] = await db
    .insert(communicationDrafts)
    .values({
      tenantId: auth.tenantId,
      createdBy: auth.userId,
      contactId: params.contactId,
      draftType: params.draftType,
      subject: params.subject,
      body: params.body,
      referencedEntityType: params.referencedEntityType,
      referencedEntityId: params.referencedEntityId,
      metadata: params.metadata,
    })
    .returning();

  logAuditAction({
    action: "communication_draft_created",
    userId: auth.userId,
    tenantId: auth.tenantId,
    entityId: row.id,
    entityType: "communication_draft",
    meta: { draftType: params.draftType },
  });

  return row;
}

export async function updateDraft(
  draftId: string,
  updates: { subject?: string; body?: string; status?: string },
) {
  const auth = await requireAuthInAction();

  const [existing] = await db
    .select()
    .from(communicationDrafts)
    .where(
      and(
        eq(communicationDrafts.id, draftId),
        eq(communicationDrafts.tenantId, auth.tenantId),
      ),
    )
    .limit(1);

  if (!existing) throw new Error("Draft not found.");

  const [updated] = await db
    .update(communicationDrafts)
    .set({
      ...(updates.subject != null ? { subject: updates.subject } : {}),
      ...(updates.body != null ? { body: updates.body } : {}),
      ...(updates.status != null ? { status: updates.status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(communicationDrafts.id, draftId))
    .returning();

  logAuditAction({
    action: "communication_draft_updated",
    userId: auth.userId,
    tenantId: auth.tenantId,
    entityId: draftId,
    entityType: "communication_draft",
    meta: { status: updates.status },
  });

  return updated;
}

export async function approveDraft(draftId: string) {
  return updateDraft(draftId, { status: "approved" });
}

export async function listDraftsForContact(contactId: string) {
  const auth = await requireAuthInAction();
  return db
    .select()
    .from(communicationDrafts)
    .where(
      and(
        eq(communicationDrafts.tenantId, auth.tenantId),
        eq(communicationDrafts.contactId, contactId),
      ),
    )
    .orderBy(desc(communicationDrafts.createdAt))
    .limit(50);
}
