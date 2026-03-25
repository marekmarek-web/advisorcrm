"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { financialSharedFacts } from "db";
import { eq, and } from "db";
import type { SharedFactRecord } from "@/lib/analyses/shared-facts/sharedFactsMapper";
import { companyPayloadAndLinksToSharedFacts } from "@/lib/analyses/shared-facts/sharedFactsMapper";
import type { CompanyFaPayload } from "@/lib/analyses/company-fa/types";
import { getCompanyPersonLinks } from "./company-person-links";

export type SharedFactRow = {
  id: string;
  tenantId: string;
  contactId: string | null;
  companyId: string | null;
  companyPersonLinkId: string | null;
  factType: string;
  value: Record<string, unknown>;
  source: string;
  sourceAnalysisId: string | null;
  sourcePayloadPath: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function getSharedFactsForContact(contactId: string): Promise<SharedFactRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select()
    .from(financialSharedFacts)
    .where(
      and(
        eq(financialSharedFacts.tenantId, auth.tenantId),
        eq(financialSharedFacts.contactId, contactId)
      )
    );
  return rows as SharedFactRow[];
}

export async function getSharedFactsForCompany(companyId: string): Promise<SharedFactRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select()
    .from(financialSharedFacts)
    .where(
      and(
        eq(financialSharedFacts.tenantId, auth.tenantId),
        eq(financialSharedFacts.companyId, companyId)
      )
    );
  return rows as SharedFactRow[];
}

export async function upsertSharedFact(fact: {
  id?: string;
  contactId?: string | null;
  companyId: string;
  companyPersonLinkId?: string | null;
  factType: string;
  value: Record<string, unknown>;
  source: string;
  sourceAnalysisId?: string | null;
  sourcePayloadPath?: string | null;
  createdBy?: string | null;
}): Promise<string> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const now = new Date();
  const row = await db
    .insert(financialSharedFacts)
    .values({
      tenantId: auth.tenantId,
      contactId: fact.contactId ?? null,
      companyId: fact.companyId,
      companyPersonLinkId: fact.companyPersonLinkId ?? null,
      factType: fact.factType,
      value: fact.value,
      source: fact.source,
      sourceAnalysisId: fact.sourceAnalysisId ?? null,
      sourcePayloadPath: fact.sourcePayloadPath ?? null,
      updatedAt: now,
      createdBy: fact.createdBy ?? auth.userId,
    })
    .returning({ id: financialSharedFacts.id });
  return row[0]!.id;
}

export async function deleteSharedFact(id: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  await db
    .delete(financialSharedFacts)
    .where(
      and(
        eq(financialSharedFacts.tenantId, auth.tenantId),
        eq(financialSharedFacts.id, id)
      )
    );
}

/** Delete all shared facts for a company (e.g. before re-extracting from company FA). */
export async function deleteSharedFactsForCompany(companyId: string): Promise<number> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const deleted = await db
    .delete(financialSharedFacts)
    .where(
      and(
        eq(financialSharedFacts.tenantId, auth.tenantId),
        eq(financialSharedFacts.companyId, companyId)
      )
    )
    .returning({ id: financialSharedFacts.id });
  return deleted.length;
}

/**
 * Extract shared facts from company FA payload and links, then upsert for the company.
 * Removes existing facts for this company first, then inserts new ones.
 * Call after company analysis save or company JSON import.
 */
export async function extractAndUpsertSharedFactsFromCompany(
  companyId: string,
  companyPayload: CompanyFaPayload,
  sourceAnalysisId: string | null,
  source: "company_fa" | "json_import"
): Promise<number> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const links = await getCompanyPersonLinks(companyId);
  const linkRows = links.map((l) => ({
    id: l.id,
    contactId: l.contactId,
    roleType: l.roleType,
    ownershipPercent: l.ownershipPercent,
    salaryFromCompanyMonthly: l.salaryFromCompanyMonthly,
    dividendRelation: l.dividendRelation,
    guaranteesCompanyLiabilities: l.guaranteesCompanyLiabilities,
  }));
  const records = companyPayloadAndLinksToSharedFacts(
    companyPayload,
    linkRows,
    companyId,
    sourceAnalysisId,
    source
  );
  await deleteSharedFactsForCompany(companyId);
  const now = new Date();
  for (const r of records) {
    await db.insert(financialSharedFacts).values({
      tenantId: auth.tenantId,
      contactId: r.contactId ?? null,
      companyId: r.companyId,
      companyPersonLinkId: r.companyPersonLinkId ?? null,
      factType: r.factType,
      value: r.value as Record<string, unknown>,
      source: r.source,
      sourceAnalysisId: r.sourceAnalysisId ?? null,
      sourcePayloadPath: r.sourcePayloadPath ?? null,
      updatedAt: now,
      createdBy: auth.userId,
    });
  }
  return records.length;
}
