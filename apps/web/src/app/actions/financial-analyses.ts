"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import { financialAnalyses } from "db";
import { eq, and, desc } from "db";

export type FinancialAnalysisStatus = "draft" | "completed" | "exported" | "archived";

export type FinancialAnalysisRow = {
  id: string;
  tenantId: string;
  contactId: string | null;
  householdId: string | null;
  type: string;
  status: string;
  payload: { data: Record<string, unknown>; currentStep: number };
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastExportedAt: Date | null;
};

export type FinancialAnalysisListItem = {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastExportedAt: Date | null;
};

export async function getFinancialAnalysis(id: string): Promise<FinancialAnalysisRow | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const [row] = await db
    .select()
    .from(financialAnalyses)
    .where(and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.id, id)));
  return row ? (row as FinancialAnalysisRow) : null;
}

export async function getFinancialAnalysesForContact(contactId: string): Promise<FinancialAnalysisListItem[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: financialAnalyses.id,
      status: financialAnalyses.status,
      createdAt: financialAnalyses.createdAt,
      updatedAt: financialAnalyses.updatedAt,
      lastExportedAt: financialAnalyses.lastExportedAt,
    })
    .from(financialAnalyses)
    .where(
      and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.contactId, contactId))
    )
    .orderBy(desc(financialAnalyses.updatedAt));
  return rows as FinancialAnalysisListItem[];
}

export async function getFinancialAnalysesForHousehold(householdId: string): Promise<FinancialAnalysisListItem[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "households:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: financialAnalyses.id,
      status: financialAnalyses.status,
      createdAt: financialAnalyses.createdAt,
      updatedAt: financialAnalyses.updatedAt,
      lastExportedAt: financialAnalyses.lastExportedAt,
    })
    .from(financialAnalyses)
    .where(
      and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.householdId, householdId))
    )
    .orderBy(desc(financialAnalyses.updatedAt));
  return rows as FinancialAnalysisListItem[];
}

export async function saveFinancialAnalysisDraft(params: {
  id?: string;
  contactId?: string;
  householdId?: string;
  payload: { data: Record<string, unknown>; currentStep: number };
}): Promise<string> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const { id, contactId, householdId, payload } = params;
  if (!id && !contactId && !householdId) {
    throw new Error("At least one of contactId or householdId is required when creating an analysis.");
  }
  const now = new Date();
  if (id) {
    await db
      .update(financialAnalyses)
      .set({
        payload: payload as unknown as typeof financialAnalyses.$inferInsert.payload,
        updatedBy: auth.userId,
        updatedAt: now,
      })
      .where(and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.id, id)));
    return id;
  }
  const [row] = await db
    .insert(financialAnalyses)
    .values({
      tenantId: auth.tenantId,
      contactId: contactId ?? null,
      householdId: householdId ?? null,
      type: "financial",
      status: "draft",
      payload: payload as unknown as typeof financialAnalyses.$inferInsert.payload,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    })
    .returning({ id: financialAnalyses.id });
  if (!row?.id) throw new Error("Failed to create analysis");
  return row.id;
}

export async function setFinancialAnalysisStatus(
  id: string,
  status: FinancialAnalysisStatus
): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  await db
    .update(financialAnalyses)
    .set({ status, updatedBy: auth.userId, updatedAt: new Date() })
    .where(and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.id, id)));
}

export async function setFinancialAnalysisLastExportedAt(id: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  await db
    .update(financialAnalyses)
    .set({
      lastExportedAt: new Date(),
      updatedBy: auth.userId,
      updatedAt: new Date(),
    })
    .where(and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.id, id)));
}
