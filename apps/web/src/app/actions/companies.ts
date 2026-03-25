"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { companies } from "db";
import { eq, and, desc } from "db";
import type { Company } from "@/lib/analyses/company-fa/types";

export type CompanyInsert = {
  ico?: string | null;
  name: string;
  industry?: string | null;
  employees?: number | null;
  cat3?: number | null;
  avgWage?: number | null;
  topClient?: number | null;
};

export async function createCompany(data: CompanyInsert): Promise<string> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const now = new Date();
  const [row] = await db
    .insert(companies)
    .values({
      tenantId: auth.tenantId,
      ico: data.ico ?? null,
      name: data.name,
      industry: data.industry ?? null,
      employees: data.employees ?? null,
      cat3: data.cat3 ?? null,
      avgWage: data.avgWage ?? null,
      topClient: data.topClient ?? null,
      updatedAt: now,
    })
    .returning({ id: companies.id });
  if (!row?.id) throw new Error("Failed to create company");
  return row.id;
}

export async function getCompanyById(id: string): Promise<Company | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const [row] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.tenantId, auth.tenantId), eq(companies.id, id)));
  return row ? (row as Company) : null;
}

export async function getCompanyByIco(ico: string): Promise<Company | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  if (!ico?.trim()) return null;
  const [row] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.tenantId, auth.tenantId), eq(companies.ico, ico.trim())));
  return row ? (row as Company) : null;
}

export async function listCompanies(): Promise<Company[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select()
    .from(companies)
    .where(eq(companies.tenantId, auth.tenantId))
    .orderBy(desc(companies.updatedAt));
  return rows as Company[];
}

export async function updateCompany(id: string, data: Partial<CompanyInsert>): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (data.ico !== undefined) update.ico = data.ico;
  if (data.name !== undefined) update.name = data.name;
  if (data.industry !== undefined) update.industry = data.industry;
  if (data.employees !== undefined) update.employees = data.employees;
  if (data.cat3 !== undefined) update.cat3 = data.cat3;
  if (data.avgWage !== undefined) update.avgWage = data.avgWage;
  if (data.topClient !== undefined) update.topClient = data.topClient;
  await db
    .update(companies)
    .set(update)
    .where(and(eq(companies.tenantId, auth.tenantId), eq(companies.id, id)));
}
