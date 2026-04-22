"use server";

import { withAuthContext } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import { financialAnalyses, analysisVersions } from "db";
import { eq, and, desc } from "db";
import type { CompanyFaPayload, CompanyAnalysisRow } from "@/lib/analyses/company-fa/types";

export type CompanyAnalysisStatus = "draft" | "completed" | "exported" | "archived";

export type CompanyAnalysisListItem = {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastExportedAt: Date | null;
  companyId: string | null;
  primaryContactId: string | null;
  companyName?: string | null;
};

const companyAnalysisBaseSelection = {
  id: financialAnalyses.id,
  tenantId: financialAnalyses.tenantId,
  contactId: financialAnalyses.contactId,
  householdId: financialAnalyses.householdId,
  companyId: financialAnalyses.companyId,
  primaryContactId: financialAnalyses.primaryContactId,
  type: financialAnalyses.type,
  status: financialAnalyses.status,
  sourceType: financialAnalyses.sourceType,
  version: financialAnalyses.version,
  payload: financialAnalyses.payload,
  createdBy: financialAnalyses.createdBy,
  updatedBy: financialAnalyses.updatedBy,
  createdAt: financialAnalyses.createdAt,
  updatedAt: financialAnalyses.updatedAt,
  lastExportedAt: financialAnalyses.lastExportedAt,
  linkedCompanyId: financialAnalyses.linkedCompanyId,
  lastRefreshedFromSharedAt: financialAnalyses.lastRefreshedFromSharedAt,
};

export async function createCompanyAnalysis(params: {
  companyId: string;
  primaryContactId?: string | null;
  contactId?: string | null;
  payload: CompanyFaPayload;
  sourceType?: "native" | "imported_json";
}): Promise<string> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
    const [row] = await tx
      .insert(financialAnalyses)
      .values({
        tenantId: auth.tenantId,
        contactId: params.contactId ?? null,
        householdId: null,
        companyId: params.companyId,
        primaryContactId: params.primaryContactId ?? null,
        type: "company",
        status: "draft",
        sourceType: params.sourceType ?? "native",
        version: 1,
        payload: params.payload as unknown as typeof financialAnalyses.$inferInsert.payload,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      })
      .returning({ id: financialAnalyses.id });
    if (!row?.id) throw new Error("Failed to create company analysis");
    return row.id;
  });
}

export async function getCompanyAnalysis(id: string): Promise<CompanyAnalysisRow | null> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
    const [row] = await tx
      .select(companyAnalysisBaseSelection)
      .from(financialAnalyses)
      .where(
        and(
          eq(financialAnalyses.tenantId, auth.tenantId),
          eq(financialAnalyses.id, id),
          eq(financialAnalyses.type, "company")
        )
      );
    return row ? (row as CompanyAnalysisRow) : null;
  });
}

export async function saveCompanyAnalysisDraft(id: string, payload: CompanyFaPayload): Promise<void> {
  const existingCompanyId = await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
    const now = new Date();
    const [existing] = await tx
      .select({ companyId: financialAnalyses.companyId })
      .from(financialAnalyses)
      .where(
        and(
          eq(financialAnalyses.tenantId, auth.tenantId),
          eq(financialAnalyses.id, id),
          eq(financialAnalyses.type, "company")
        )
      );
    await tx
      .update(financialAnalyses)
      .set({
        payload: payload as unknown as typeof financialAnalyses.$inferInsert.payload,
        updatedBy: auth.userId,
        updatedAt: now,
      })
      .where(
        and(
          eq(financialAnalyses.tenantId, auth.tenantId),
          eq(financialAnalyses.id, id),
          eq(financialAnalyses.type, "company")
        )
      );
    return existing?.companyId ?? null;
  });

  if (existingCompanyId) {
    const { extractAndUpsertSharedFactsFromCompany } = await import("./shared-facts");
    await extractAndUpsertSharedFactsFromCompany(
      existingCompanyId,
      payload,
      id,
      "company_fa"
    );
  }
}

export async function setCompanyAnalysisStatus(id: string, status: CompanyAnalysisStatus): Promise<void> {
  await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
    await tx
      .update(financialAnalyses)
      .set({ status, updatedBy: auth.userId, updatedAt: new Date() })
      .where(
        and(
          eq(financialAnalyses.tenantId, auth.tenantId),
          eq(financialAnalyses.id, id),
          eq(financialAnalyses.type, "company")
        )
      );
  });
}

export async function setCompanyAnalysisLastExportedAt(id: string): Promise<void> {
  await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
    await tx
      .update(financialAnalyses)
      .set({
        lastExportedAt: new Date(),
        updatedBy: auth.userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(financialAnalyses.tenantId, auth.tenantId),
          eq(financialAnalyses.id, id),
          eq(financialAnalyses.type, "company")
        )
      );
  });
}

export async function listCompanyAnalysesForCompany(companyId: string): Promise<CompanyAnalysisListItem[]> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
    const rows = await tx
      .select({
        id: financialAnalyses.id,
        status: financialAnalyses.status,
        createdAt: financialAnalyses.createdAt,
        updatedAt: financialAnalyses.updatedAt,
        lastExportedAt: financialAnalyses.lastExportedAt,
        companyId: financialAnalyses.companyId,
        primaryContactId: financialAnalyses.primaryContactId,
        payload: financialAnalyses.payload,
      })
      .from(financialAnalyses)
      .where(
        and(
          eq(financialAnalyses.tenantId, auth.tenantId),
          eq(financialAnalyses.type, "company"),
          eq(financialAnalyses.companyId, companyId)
        )
      )
      .orderBy(desc(financialAnalyses.updatedAt));
    return rows.map((r) => {
      const payload = r.payload as { company?: { name?: string } } | null;
      return {
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        lastExportedAt: r.lastExportedAt,
        companyId: r.companyId,
        primaryContactId: r.primaryContactId,
        companyName: payload?.company?.name ?? null,
      };
    });
  });
}

export async function listCompanyAnalyses(): Promise<CompanyAnalysisListItem[]> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
    const rows = await tx
      .select({
        id: financialAnalyses.id,
        status: financialAnalyses.status,
        createdAt: financialAnalyses.createdAt,
        updatedAt: financialAnalyses.updatedAt,
        lastExportedAt: financialAnalyses.lastExportedAt,
        companyId: financialAnalyses.companyId,
        primaryContactId: financialAnalyses.primaryContactId,
        payload: financialAnalyses.payload,
      })
      .from(financialAnalyses)
      .where(
        and(
          eq(financialAnalyses.tenantId, auth.tenantId),
          eq(financialAnalyses.type, "company")
        )
      )
      .orderBy(desc(financialAnalyses.updatedAt));
    return rows.map((r) => {
      const payload = r.payload as { company?: { name?: string } } | null;
      return {
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        lastExportedAt: r.lastExportedAt,
        companyId: r.companyId,
        primaryContactId: r.primaryContactId,
        companyName: payload?.company?.name ?? null,
      };
    });
  });
}

export async function listCompanyAnalysesForContact(contactId: string): Promise<CompanyAnalysisListItem[]> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
    const rows = await tx
      .select({
        id: financialAnalyses.id,
        status: financialAnalyses.status,
        createdAt: financialAnalyses.createdAt,
        updatedAt: financialAnalyses.updatedAt,
        lastExportedAt: financialAnalyses.lastExportedAt,
        companyId: financialAnalyses.companyId,
        primaryContactId: financialAnalyses.primaryContactId,
        payload: financialAnalyses.payload,
      })
      .from(financialAnalyses)
      .where(
        and(
          eq(financialAnalyses.tenantId, auth.tenantId),
          eq(financialAnalyses.type, "company"),
          eq(financialAnalyses.primaryContactId, contactId)
        )
      )
      .orderBy(desc(financialAnalyses.updatedAt));
    return rows.map((r) => {
      const payload = r.payload as { company?: { name?: string } } | null;
      return {
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        lastExportedAt: r.lastExportedAt,
        companyId: r.companyId,
        primaryContactId: r.primaryContactId,
        companyName: payload?.company?.name ?? null,
      };
    });
  });
}

export type AnalysisVersionRow = {
  id: string;
  analysisId: string;
  versionNumber: number;
  snapshotPayload: CompanyFaPayload;
  createdAt: Date;
  createdBy: string | null;
};

export async function createAnalysisVersion(analysisId: string, snapshotPayload: CompanyFaPayload): Promise<number> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
    const rows = await tx
      .select({ versionNumber: analysisVersions.versionNumber })
      .from(analysisVersions)
      .where(eq(analysisVersions.analysisId, analysisId));
    const nextVersion = rows.length === 0 ? 1 : Math.max(...rows.map((r) => r.versionNumber)) + 1;
    await tx.insert(analysisVersions).values({
      analysisId,
      versionNumber: nextVersion,
      snapshotPayload: snapshotPayload as unknown as typeof analysisVersions.$inferInsert.snapshotPayload,
      createdBy: auth.userId,
    });
    return nextVersion;
  });
}

export async function getAnalysisVersions(analysisId: string): Promise<AnalysisVersionRow[]> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
    const rows = await tx
      .select()
      .from(analysisVersions)
      .where(eq(analysisVersions.analysisId, analysisId))
      .orderBy(desc(analysisVersions.versionNumber));
    return rows as AnalysisVersionRow[];
  });
}
