"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import { companyPersonLinks } from "db";
import { eq, and } from "db";
import type { CompanyPersonLink, CompanyPersonRoleType } from "@/lib/analyses/company-fa/types";

export type CompanyPersonLinkUpsert = {
  contactId: string | null;
  roleType: CompanyPersonRoleType;
  ownershipPercent?: number | null;
  salaryFromCompanyMonthly?: number | null;
  dividendRelation?: string | null;
  guaranteesCompanyLiabilities?: boolean;
};

export async function upsertCompanyPersonLinks(
  companyId: string,
  links: CompanyPersonLinkUpsert[]
): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const now = new Date();

  await db
    .delete(companyPersonLinks)
    .where(and(eq(companyPersonLinks.tenantId, auth.tenantId), eq(companyPersonLinks.companyId, companyId)));

  for (const link of links) {
    await db.insert(companyPersonLinks).values({
      tenantId: auth.tenantId,
      companyId,
      contactId: link.contactId ?? null,
      roleType: link.roleType,
      ownershipPercent: link.ownershipPercent ?? null,
      salaryFromCompanyMonthly: link.salaryFromCompanyMonthly ?? null,
      dividendRelation: link.dividendRelation ?? null,
      guaranteesCompanyLiabilities: link.guaranteesCompanyLiabilities ?? false,
      updatedAt: now,
    });
  }
}

export async function getCompanyPersonLinks(companyId: string): Promise<CompanyPersonLink[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select()
    .from(companyPersonLinks)
    .where(and(eq(companyPersonLinks.tenantId, auth.tenantId), eq(companyPersonLinks.companyId, companyId)));
  return rows as CompanyPersonLink[];
}

export type CompanyWithLink = CompanyPersonLink & { companyName?: string };

export async function getCompaniesForContact(contactId: string): Promise<CompanyWithLink[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select()
    .from(companyPersonLinks)
    .where(and(eq(companyPersonLinks.tenantId, auth.tenantId), eq(companyPersonLinks.contactId, contactId)));
  return rows as CompanyWithLink[];
}
