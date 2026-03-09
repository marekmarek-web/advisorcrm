"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import { amlChecklists, consents, processingPurposes } from "db";
import { eq, and, desc } from "db";

// ---------------------------------------------------------------------------
// AML Checklists
// ---------------------------------------------------------------------------

export type AmlChecklistRow = {
  id: string;
  checkDate: Date;
  riskLevel: string | null;
  notes: string | null;
  checkedBy: string | null;
  createdAt: Date;
};

export async function getAmlChecklists(
  contactId: string,
): Promise<AmlChecklistRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read"))
    throw new Error("Forbidden");

  const rows = await db
    .select()
    .from(amlChecklists)
    .where(
      and(
        eq(amlChecklists.tenantId, auth.tenantId),
        eq(amlChecklists.contactId, contactId),
      ),
    )
    .orderBy(desc(amlChecklists.performedAt));

  return rows.map((r) => {
    const result = (r.result ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      checkDate: r.performedAt,
      riskLevel: (result.riskLevel as string) ?? null,
      notes: (result.notes as string) ?? null,
      checkedBy: r.performedBy,
      createdAt: r.createdAt,
    };
  });
}

export async function createAmlChecklist(
  contactId: string,
  data: { checkDate: string; riskLevel: string; notes?: string },
): Promise<string> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write"))
    throw new Error("Forbidden");

  const [row] = await db
    .insert(amlChecklists)
    .values({
      tenantId: auth.tenantId,
      contactId,
      performedBy: auth.userId,
      performedAt: new Date(data.checkDate),
      checklistType: "aml_standard",
      result: { riskLevel: data.riskLevel, notes: data.notes ?? null },
    })
    .returning({ id: amlChecklists.id });

  return row!.id;
}

// ---------------------------------------------------------------------------
// Consent Management
// ---------------------------------------------------------------------------

export type ConsentRow = {
  id: string;
  purposeName: string;
  purposeDescription: string | null;
  grantedAt: Date;
  revokedAt: Date | null;
  source: string | null;
};

export async function getConsents(
  contactId: string,
): Promise<ConsentRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read"))
    throw new Error("Forbidden");

  const rows = await db
    .select({
      id: consents.id,
      purposeName: processingPurposes.name,
      purposeDescription: processingPurposes.legalBasis,
      grantedAt: consents.grantedAt,
      revokedAt: consents.revokedAt,
      source: consents.legalBasis,
    })
    .from(consents)
    .innerJoin(processingPurposes, eq(consents.purposeId, processingPurposes.id))
    .where(
      and(
        eq(consents.tenantId, auth.tenantId),
        eq(consents.contactId, contactId),
      ),
    )
    .orderBy(desc(consents.grantedAt));

  return rows;
}

export async function grantConsent(
  contactId: string,
  purposeId: string,
  source?: string,
): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write"))
    throw new Error("Forbidden");

  await db.insert(consents).values({
    tenantId: auth.tenantId,
    contactId,
    purposeId,
    grantedAt: new Date(),
    legalBasis: source?.trim() || null,
  });
}

export async function revokeConsent(consentId: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write"))
    throw new Error("Forbidden");

  await db
    .update(consents)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(consents.tenantId, auth.tenantId), eq(consents.id, consentId)),
    );
}

// ---------------------------------------------------------------------------
// Processing Purposes
// ---------------------------------------------------------------------------

export type PurposeRow = {
  id: string;
  name: string;
  description: string | null;
};

export async function getProcessingPurposes(): Promise<PurposeRow[]> {
  const auth = await requireAuthInAction();

  const rows = await db
    .select({
      id: processingPurposes.id,
      name: processingPurposes.name,
      description: processingPurposes.legalBasis,
    })
    .from(processingPurposes)
    .where(eq(processingPurposes.tenantId, auth.tenantId))
    .orderBy(processingPurposes.name);

  return rows;
}

export async function createProcessingPurpose(
  name: string,
  description?: string,
): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write"))
    throw new Error("Forbidden");

  await db.insert(processingPurposes).values({
    tenantId: auth.tenantId,
    name: name.trim(),
    legalBasis: description?.trim() || null,
  });
}
