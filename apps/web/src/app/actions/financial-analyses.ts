"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import { financialAnalyses, householdMembers, contacts, households } from "db";
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
  linkedCompanyId: string | null;
  lastRefreshedFromSharedAt: Date | null;
};

const FINANCIAL_WIZARD_TOTAL_STEPS = 8;

export type FinancialAnalysisListItem = {
  id: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastExportedAt: Date | null;
  contactId: string | null;
  householdId: string | null;
  clientName?: string | null;
  /** Phase 7: link to company and last refresh from shared facts */
  linkedCompanyId?: string | null;
  lastRefreshedFromSharedAt?: Date | null;
  /** 0–100, derived from payload.currentStep for list display */
  progress?: number;
  /** Label for analysis type/focus (e.g. "Komplexní finanční analýza") */
  analysisTypeLabel?: string | null;
};

export async function getFinancialAnalysis(id: string): Promise<FinancialAnalysisRow | null> {
  const auth = await requireAuthInAction();
  const [row] = await db
    .select()
    .from(financialAnalyses)
    .where(and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.id, id)));
  if (!row) return null;
  if (auth.roleName === "Client") {
    if (row.contactId === auth.contactId) return row as FinancialAnalysisRow;
    if (row.householdId && auth.contactId) {
      const [member] = await db
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, row.householdId),
            eq(householdMembers.contactId, auth.contactId)
          )
        )
        .limit(1);
      if (member) return row as FinancialAnalysisRow;
    }
    return null;
  }
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  return row as FinancialAnalysisRow;
}

export async function listFinancialAnalyses(): Promise<FinancialAnalysisListItem[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: financialAnalyses.id,
      status: financialAnalyses.status,
      createdAt: financialAnalyses.createdAt,
      updatedAt: financialAnalyses.updatedAt,
      lastExportedAt: financialAnalyses.lastExportedAt,
      contactId: financialAnalyses.contactId,
      householdId: financialAnalyses.householdId,
      payload: financialAnalyses.payload,
      linkedCompanyId: financialAnalyses.linkedCompanyId,
      lastRefreshedFromSharedAt: financialAnalyses.lastRefreshedFromSharedAt,
    })
    .from(financialAnalyses)
    .where(eq(financialAnalyses.tenantId, auth.tenantId))
    .orderBy(desc(financialAnalyses.updatedAt));
  return rows.map((r) => {
    const payload = r.payload as {
      data?: { client?: { name?: string }; [k: string]: unknown };
      currentStep?: number;
    } | null;
    const clientName = payload?.data?.client?.name ?? null;
    const currentStep = payload?.currentStep ?? 0;
    const progress =
      r.status === "draft" || r.status === "archived"
        ? Math.min(100, Math.round((currentStep / FINANCIAL_WIZARD_TOTAL_STEPS) * 100))
        : r.status === "completed" || r.status === "exported"
          ? 100
          : Math.min(100, Math.round((currentStep / FINANCIAL_WIZARD_TOTAL_STEPS) * 100));
    const analysisTypeLabel = "Komplexní finanční analýza";
    return {
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      lastExportedAt: r.lastExportedAt,
      contactId: r.contactId,
      householdId: r.householdId,
      clientName: clientName ?? null,
      linkedCompanyId: r.linkedCompanyId ?? null,
      lastRefreshedFromSharedAt: r.lastRefreshedFromSharedAt ?? null,
      progress,
      analysisTypeLabel,
    } as FinancialAnalysisListItem;
  });
}

export async function getFinancialAnalysesForContact(contactId: string): Promise<FinancialAnalysisListItem[]> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client" && auth.contactId !== contactId) throw new Error("Forbidden");
  if (auth.roleName !== "Client" && !hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: financialAnalyses.id,
      status: financialAnalyses.status,
      createdAt: financialAnalyses.createdAt,
      updatedAt: financialAnalyses.updatedAt,
      lastExportedAt: financialAnalyses.lastExportedAt,
      linkedCompanyId: financialAnalyses.linkedCompanyId,
      lastRefreshedFromSharedAt: financialAnalyses.lastRefreshedFromSharedAt,
    })
    .from(financialAnalyses)
    .where(
      and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.contactId, contactId))
    )
    .orderBy(desc(financialAnalyses.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    lastExportedAt: r.lastExportedAt,
    contactId,
    householdId: null,
    linkedCompanyId: r.linkedCompanyId ?? undefined,
    lastRefreshedFromSharedAt: r.lastRefreshedFromSharedAt ?? undefined,
  })) as FinancialAnalysisListItem[];
}

export async function getFinancialAnalysesForHousehold(householdId: string): Promise<FinancialAnalysisListItem[]> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client" && auth.contactId) {
    const [member] = await db
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .innerJoin(households, eq(householdMembers.householdId, households.id))
      .where(
        and(
          eq(householdMembers.householdId, householdId),
          eq(householdMembers.contactId, auth.contactId),
          eq(households.tenantId, auth.tenantId)
        )
      )
      .limit(1);
    if (!member) throw new Error("Forbidden");
  } else if (!hasPermission(auth.roleName, "households:read")) {
    throw new Error("Forbidden");
  }
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

  if (contactId) {
    const [c] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, auth.tenantId)))
      .limit(1);
    if (!c) throw new Error("Kontakt nenalezen.");
  }
  if (householdId) {
    const [h] = await db
      .select({ id: households.id })
      .from(households)
      .where(and(eq(households.id, householdId), eq(households.tenantId, auth.tenantId)))
      .limit(1);
    if (!h) throw new Error("Domácnost nenalezena.");
  }

  const now = new Date();
  if (id) {
    const updateSet: Record<string, unknown> = {
      payload: payload as unknown as typeof financialAnalyses.$inferInsert.payload,
      updatedBy: auth.userId,
      updatedAt: now,
    };
    if (contactId !== undefined) updateSet.contactId = contactId ?? null;
    if (householdId !== undefined) updateSet.householdId = householdId ?? null;
    await db
      .update(financialAnalyses)
      .set(updateSet as typeof financialAnalyses.$inferInsert)
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

  if (status === "completed") {
    try {
      const { extractFaPlanItems, getFaPlanItems } = await import("./fa-plan-items");
      await extractFaPlanItems(id);
      const planItems = await getFaPlanItems(id);
      if (planItems.length > 0) {
        const { importFaItemsToCoverage } = await import("./coverage");
        await importFaItemsToCoverage(id, planItems.map((i) => i.id));
      }
    } catch {
      // non-critical: plan items extraction failure should not block status update
    }
  }
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

/** Phase 7: set link metadata (linked company, last refreshed from shared facts). */
export async function setFinancialAnalysisLinkMetadata(
  id: string,
  params: { linkedCompanyId?: string | null; lastRefreshedFromSharedAt?: Date | null }
): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  await db
    .update(financialAnalyses)
    .set({
      ...params,
      updatedBy: auth.userId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financialAnalyses.tenantId, auth.tenantId),
        eq(financialAnalyses.id, id),
        eq(financialAnalyses.type, "financial")
      )
    );
}

/** Phase 7: list personal analyses linked to a company. */
export async function getPersonalAnalysesLinkedToCompany(companyId: string): Promise<FinancialAnalysisListItem[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: financialAnalyses.id,
      status: financialAnalyses.status,
      createdAt: financialAnalyses.createdAt,
      updatedAt: financialAnalyses.updatedAt,
      lastExportedAt: financialAnalyses.lastExportedAt,
      contactId: financialAnalyses.contactId,
      householdId: financialAnalyses.householdId,
      payload: financialAnalyses.payload,
      lastRefreshedFromSharedAt: financialAnalyses.lastRefreshedFromSharedAt,
    })
    .from(financialAnalyses)
    .where(
      and(
        eq(financialAnalyses.tenantId, auth.tenantId),
        eq(financialAnalyses.type, "financial"),
        eq(financialAnalyses.linkedCompanyId, companyId)
      )
    )
    .orderBy(desc(financialAnalyses.updatedAt));
  return rows.map((r) => {
    const payload = r.payload as { data?: { client?: { name?: string } } } | null;
    const clientName = payload?.data?.client?.name ?? null;
    return {
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      lastExportedAt: r.lastExportedAt,
      contactId: r.contactId,
      householdId: r.householdId,
      clientName: clientName ?? null,
      lastRefreshedFromSharedAt: r.lastRefreshedFromSharedAt ?? undefined,
    } as FinancialAnalysisListItem & { lastRefreshedFromSharedAt?: Date | null };
  });
}

/** Phase 7: apply refresh from shared facts into personal analysis (merge patch, set provenance, save, set link metadata). */
export async function applyRefreshFromShared(
  analysisId: string,
  linkedCompanyId: string,
  options?: { paths?: string[] }
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const analysis = await getFinancialAnalysis(analysisId);
  if (!analysis || analysis.type !== "financial" || !analysis.contactId) {
    return { ok: false, error: "Analysis not found or not personal" };
  }
  const { getSharedFactsForContact } = await import("./shared-facts");
  const rows = await getSharedFactsForContact(analysis.contactId);
  const facts = rows.map((r) => ({
    id: r.id,
    factType: r.factType,
    value: r.value,
    contactId: r.contactId,
    companyId: r.companyId!,
  }));
  const currentData = (analysis.payload as { data: Record<string, unknown>; currentStep: number }).data;
  const currentStep = (analysis.payload as { data: Record<string, unknown>; currentStep: number }).currentStep;
  const { sharedFactsToProposedPersonalPatch } = await import("@/lib/analyses/shared-facts/sharedFactsMapper");
  const { mergePatchWithProvenance, getPathsTouchedByPatch } = await import(
    "@/lib/analyses/shared-facts/refreshFromShared"
  );
  const patch = sharedFactsToProposedPersonalPatch(facts, currentData as unknown as import("@/lib/analyses/financial/types").FinancialAnalysisData);
  const pathsToApply = options?.paths?.length ? options.paths : getPathsTouchedByPatch(patch);
  if (pathsToApply.length === 0) {
    await setFinancialAnalysisLinkMetadata(analysisId, { linkedCompanyId, lastRefreshedFromSharedAt: new Date() });
    return { ok: true };
  }
  const { data: mergedData } = mergePatchWithProvenance(
    currentData as unknown as import("@/lib/analyses/financial/types").FinancialAnalysisData,
    patch,
    pathsToApply
  );
  await db
    .update(financialAnalyses)
    .set({
      payload: { data: mergedData as unknown as Record<string, unknown>, currentStep },
      updatedBy: auth.userId,
      updatedAt: new Date(),
    })
    .where(and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.id, analysisId)));
  await setFinancialAnalysisLinkMetadata(analysisId, { linkedCompanyId, lastRefreshedFromSharedAt: new Date() });
  return { ok: true };
}

/** Phase 7: clear link metadata and mark former linked paths as overridden (Odpojit). */
export async function clearFinancialAnalysisLink(analysisId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const analysis = await getFinancialAnalysis(analysisId);
  if (!analysis || analysis.type !== "financial") return { ok: false, error: "Analysis not found" };
  const payload = analysis.payload as { data: Record<string, unknown> & { _provenance?: Record<string, string> }; currentStep: number };
  const data = { ...payload.data };
  const prov = data._provenance ?? {};
  for (const k of Object.keys(prov)) {
    if (prov[k] === "linked") prov[k] = "overridden";
  }
  data._provenance = prov;
  await db
    .update(financialAnalyses)
    .set({
      linkedCompanyId: null,
      lastRefreshedFromSharedAt: null,
      payload: { ...payload, data },
      updatedBy: auth.userId,
      updatedAt: new Date(),
    })
    .where(and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.id, analysisId)));
  return { ok: true };
}
