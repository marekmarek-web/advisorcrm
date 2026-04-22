"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { FA_ERROR_NO_READ, FA_ERROR_NO_WRITE } from "@/lib/analyses/financial/financialAnalysisErrors";
import { db } from "db";
import { financialAnalyses, householdMembers, contacts, households } from "db";
import { eq, and, desc, sql } from "db";

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

function financialAnalysisTypeLabel(type: string): string {
  if (type === "company") return "Firemní analýza";
  return "Komplexní finanční analýza";
}

export type FinancialAnalysisListItem = {
  id: string;
  status: string;
  /** ISO string or Date — po přenosu z RSC bývá řetězec. */
  createdAt: Date | string;
  updatedAt: Date | string;
  lastExportedAt: Date | string | null;
  contactId: string | null;
  householdId: string | null;
  clientName?: string | null;
  /** Phase 7: link to company and last refresh from shared facts */
  linkedCompanyId?: string | null;
  lastRefreshedFromSharedAt?: Date | string | null;
  /** 0–100, derived from payload.currentStep for list display */
  progress?: number;
  /** Label for analysis type/focus (e.g. "Komplexní finanční analýza") */
  analysisTypeLabel?: string | null;
};

const financialAnalysisBaseSelection = {
  id: financialAnalyses.id,
  tenantId: financialAnalyses.tenantId,
  contactId: financialAnalyses.contactId,
  householdId: financialAnalyses.householdId,
  type: financialAnalyses.type,
  status: financialAnalyses.status,
  payload: financialAnalyses.payload,
  createdBy: financialAnalyses.createdBy,
  updatedBy: financialAnalyses.updatedBy,
  createdAt: financialAnalyses.createdAt,
  updatedAt: financialAnalyses.updatedAt,
  lastExportedAt: financialAnalyses.lastExportedAt,
  linkedCompanyId: financialAnalyses.linkedCompanyId,
  lastRefreshedFromSharedAt: financialAnalyses.lastRefreshedFromSharedAt,
};

export async function getFinancialAnalysis(id: string): Promise<FinancialAnalysisRow | null> {
  try {
    const auth = await requireAuthInAction();
    const [row] = await db
      .select(financialAnalysisBaseSelection)
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
    if (!hasPermission(auth.roleName, "financial_analyses:read")) throw new Error(FA_ERROR_NO_READ);
    return row as FinancialAnalysisRow;
  } catch (err) {
    console.error("[getFinancialAnalysis] failed for id=" + id, err);
    throw err;
  }
}

/**
 * Lean list — bez celého `payload` JSONu (ten umí být stovky kB na jednu FA).
 * Pro UI list potřebujeme jen `clientName` + `currentStep`, které vyzobneme
 * JSON path selectorem rovnou v Postgresu. Limit 50 brání nekonečnému scrollu
 * při tenantech se stovkami FA (dashboard widget ukazuje jen top-N).
 */
export async function listFinancialAnalyses(): Promise<FinancialAnalysisListItem[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "financial_analyses:read")) throw new Error(FA_ERROR_NO_READ);
  try {
    const rows = await db
      .select({
        id: financialAnalyses.id,
        type: financialAnalyses.type,
        status: financialAnalyses.status,
        contactId: financialAnalyses.contactId,
        householdId: financialAnalyses.householdId,
        createdAt: financialAnalyses.createdAt,
        updatedAt: financialAnalyses.updatedAt,
        lastExportedAt: financialAnalyses.lastExportedAt,
        linkedCompanyId: financialAnalyses.linkedCompanyId,
        lastRefreshedFromSharedAt: financialAnalyses.lastRefreshedFromSharedAt,
        clientNameRaw: sql<string | null>`${financialAnalyses.payload}->'data'->'client'->>'name'`,
        companyNameRaw: sql<string | null>`${financialAnalyses.payload}->'company'->>'name'`,
        notesRaw: sql<string | null>`${financialAnalyses.payload}->'data'->>'notes'`,
        currentStepRaw: sql<number>`coalesce((${financialAnalyses.payload}->>'currentStep')::int, 0)`,
      })
      .from(financialAnalyses)
      .where(eq(financialAnalyses.tenantId, auth.tenantId))
      .orderBy(desc(financialAnalyses.updatedAt))
      .limit(50);
    return rows.map((r) => {
      const personal = (r.clientNameRaw ?? "").trim();
      let clientName = personal;
      if (!clientName && r.type === "company") {
        clientName = (r.companyNameRaw ?? "").trim();
      }
      if (!clientName) {
        const notes = (r.notesRaw ?? "").trim();
        clientName = notes ? (notes.length > 72 ? `${notes.slice(0, 69)}…` : notes) : "Analýza bez názvu";
      }
      const currentStep = Number(r.currentStepRaw) || 0;
      const progress =
        r.status === "draft" || r.status === "archived"
          ? Math.min(100, Math.round((currentStep / FINANCIAL_WIZARD_TOTAL_STEPS) * 100))
          : r.status === "completed" || r.status === "exported"
            ? 100
            : Math.min(100, Math.round((currentStep / FINANCIAL_WIZARD_TOTAL_STEPS) * 100));
      return {
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        lastExportedAt: r.lastExportedAt,
        contactId: r.contactId,
        householdId: r.householdId,
        clientName,
        linkedCompanyId: r.linkedCompanyId ?? null,
        lastRefreshedFromSharedAt: r.lastRefreshedFromSharedAt ?? null,
        progress,
        analysisTypeLabel: financialAnalysisTypeLabel(r.type),
      } as FinancialAnalysisListItem;
    });
  } catch (err) {
    console.error("[listFinancialAnalyses] DB query failed:", err);
    throw err;
  }
}

export async function getFinancialAnalysesForContact(contactId: string): Promise<FinancialAnalysisListItem[]> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client" && auth.contactId !== contactId) throw new Error("Forbidden");
  if (auth.roleName !== "Client" && !hasPermission(auth.roleName, "financial_analyses:read")) throw new Error(FA_ERROR_NO_READ);
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
  if (!hasPermission(auth.roleName, "financial_analyses:write")) throw new Error(FA_ERROR_NO_WRITE);
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
    const [updated] = await db
      .update(financialAnalyses)
      .set(updateSet as typeof financialAnalyses.$inferInsert)
      .where(
        and(
          eq(financialAnalyses.tenantId, auth.tenantId),
          eq(financialAnalyses.id, id),
          eq(financialAnalyses.type, "financial")
        )
      )
      .returning({ id: financialAnalyses.id });
    if (!updated?.id) throw new Error("Analýzu se nepodařilo uložit.");
    return updated.id;
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

/** Odstraní záznam z databáze (včetně navázaných řádků dle FK cascade / set null). */
export async function deleteFinancialAnalysisPermanently(id: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "financial_analyses:write")) throw new Error(FA_ERROR_NO_WRITE);
  const [row] = await db
    .select({ id: financialAnalyses.id })
    .from(financialAnalyses)
    .where(and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.id, id)))
    .limit(1);
  if (!row) throw new Error("Analýza nenalezena.");
  await db
    .delete(financialAnalyses)
    .where(and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.id, id)));
}

export async function setFinancialAnalysisStatus(
  id: string,
  status: FinancialAnalysisStatus
): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "financial_analyses:write")) throw new Error(FA_ERROR_NO_WRITE);
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
  if (!hasPermission(auth.roleName, "financial_analyses:write")) throw new Error(FA_ERROR_NO_WRITE);
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
  if (!hasPermission(auth.roleName, "financial_analyses:write")) throw new Error(FA_ERROR_NO_WRITE);
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
  if (!hasPermission(auth.roleName, "financial_analyses:read")) throw new Error(FA_ERROR_NO_READ);
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
  if (!hasPermission(auth.roleName, "financial_analyses:write")) throw new Error(FA_ERROR_NO_WRITE);
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
  if (!hasPermission(auth.roleName, "financial_analyses:write")) throw new Error(FA_ERROR_NO_WRITE);
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
