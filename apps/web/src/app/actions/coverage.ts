"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { contactCoverage, opportunityStages } from "db";
import { eq, and, asc } from "db";
import { getContractsByContact } from "./contracts";
import { getPipelineByContact } from "./pipeline";
import { createOpportunity } from "./pipeline";
import { createTask } from "./tasks";
import { resolveCoverageItems } from "@/app/lib/coverage/calculations";
import { getItemInfo, getItemSegmentCode } from "@/app/lib/coverage/item-keys";
import { segmentToCaseType } from "@/app/lib/segment-hierarchy";
import type { ResolvedCoverageItem, CoverageSummary, ContactCoverageRow } from "@/app/lib/coverage/types";

export type GetCoverageResult = {
  resolvedItems: ResolvedCoverageItem[];
  summary: CoverageSummary;
};

function isRecoverableContactCoverageSchemaError(message: string): boolean {
  return (
    /contact_coverage.*does not exist|relation "contact_coverage" does not exist/i.test(message) ||
    /column "fa_analysis_id" does not exist/i.test(message) ||
    /column "fa_item_id" does not exist/i.test(message)
  );
}

export async function getCoverageForContact(contactId: string): Promise<GetCoverageResult> {
  try {
    const auth = await requireAuthInAction();
    if (auth.roleName === "Client") {
      if (auth.contactId !== contactId) throw new Error("Forbidden");
    } else if (!hasPermission(auth.roleName, "contacts:read")) {
      throw new Error("Forbidden");
    }

    const [contractsList, pipelineStages] = await Promise.all([
      getContractsByContact(contactId),
      getPipelineByContact(contactId),
    ]);

    let coverageRows: (typeof contactCoverage.$inferSelect)[] = [];
    try {
      coverageRows = await db
        .select()
        .from(contactCoverage)
        .where(and(eq(contactCoverage.tenantId, auth.tenantId), eq(contactCoverage.contactId, contactId)));
    } catch (coverageErr) {
      const msg = coverageErr instanceof Error ? coverageErr.message : String(coverageErr);
      if (!isRecoverableContactCoverageSchemaError(msg)) throw coverageErr;
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[getCoverageForContact] contact_coverage schema mismatch; using contracts/pipeline only. Run pnpm run db:apply-schema or add missing columns on Supabase.",
          msg
        );
      }
    }

    const contractsForCoverage = contractsList.map((c) => ({ id: c.id, segment: c.segment }));
    const openOpportunities: { id: string; caseType: string }[] = [];
    for (const stage of pipelineStages) {
      for (const opp of stage.opportunities) {
        openOpportunities.push({ id: opp.id, caseType: opp.caseType });
      }
    }

    const storedRows: ContactCoverageRow[] = coverageRows.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      contactId: r.contactId,
      itemKey: r.itemKey,
      segmentCode: r.segmentCode,
      status: r.status,
      linkedContractId: r.linkedContractId,
      linkedOpportunityId: r.linkedOpportunityId,
      notes: r.notes,
      isRelevant: r.isRelevant,
      faItemId: r.faItemId ?? null,
      updatedAt: r.updatedAt,
      updatedBy: r.updatedBy,
    }));

    const { items, summary } = resolveCoverageItems(storedRows, contractsForCoverage, openOpportunities);
    return { resolvedItems: items, summary };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[getCoverageForContact]", contactId, err);
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/contact_coverage.*does not exist|relation "contact_coverage" does not exist/i.test(message)) {
      throw new Error(
        "Tabulka contact_coverage v této databázi chybí. Spusťte v terminálu: pnpm run db:apply-schema (nebo v Supabase SQL Editoru spusťte obsah souboru packages/db/migrations/add-contact-coverage.sql)."
      );
    }
    if (/column "fa_analysis_id" does not exist|column "fa_item_id" does not exist/i.test(message)) {
      throw new Error(
        "Tabulka contact_coverage nemá sloupce fa_analysis_id / fa_item_id. Spusťte pnpm run db:apply-schema nebo v Supabase SQL Editoru přidejte sloupce z packages/db/migrations/add-contact-coverage.sql."
      );
    }
    throw err instanceof Error ? err : new Error("Nepodařilo se načíst pokrytí produktů");
  }
}

export type UpsertCoverageItemResult = { ok: true } | { ok: false; message: string };

/**
 * Upsert jedné položky pokrytí (unikát tenant + contact + itemKey).
 * Vhodné pro volání z AI asistenta — vrací výsledek místo výjimky.
 */
export async function upsertCoverageItem(
  contactId: string,
  itemKey: string,
  payload: {
    status: string;
    linkedContractId?: string | null;
    linkedOpportunityId?: string | null;
    notes?: string | null;
    isRelevant?: boolean;
  },
): Promise<UpsertCoverageItemResult> {
  try {
    await setCoverageStatus(contactId, itemKey, payload);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Forbidden") {
      return { ok: false, message: "Nemáte oprávnění upravovat pokrytí klienta." };
    }
    return { ok: false, message: msg };
  }
}

export async function setCoverageStatus(
  contactId: string,
  itemKey: string,
  payload: {
    status?: string;
    linkedContractId?: string | null;
    linkedOpportunityId?: string | null;
    notes?: string | null;
    isRelevant?: boolean;
  }
): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  const info = getItemInfo(itemKey);
  if (!info) throw new Error("Unknown coverage item key");

  const existing = await db
    .select()
    .from(contactCoverage)
    .where(
      and(
        eq(contactCoverage.tenantId, auth.tenantId),
        eq(contactCoverage.contactId, contactId),
        eq(contactCoverage.itemKey, itemKey)
      )
    )
    .limit(1);

  const status = payload.status ?? "none";
  const values = {
    tenantId: auth.tenantId,
    contactId,
    itemKey,
    segmentCode: info.segmentCode,
    status,
    linkedContractId: payload.linkedContractId ?? null,
    linkedOpportunityId: payload.linkedOpportunityId ?? null,
    notes: payload.notes ?? null,
    isRelevant: payload.isRelevant ?? true,
    updatedAt: new Date(),
    updatedBy: auth.userId,
  };

  if (existing.length > 0) {
    await db
      .update(contactCoverage)
      .set({
        status: values.status,
        linkedContractId: values.linkedContractId,
        linkedOpportunityId: values.linkedOpportunityId,
        notes: values.notes,
        isRelevant: values.isRelevant,
        updatedAt: values.updatedAt,
        updatedBy: values.updatedBy,
      })
      .where(eq(contactCoverage.id, existing[0].id));
  } else {
    await db.insert(contactCoverage).values(values);
  }
}

export async function linkCoverageToContract(
  contactId: string,
  itemKey: string,
  contractId: string
): Promise<void> {
  await setCoverageStatus(contactId, itemKey, {
    status: "done",
    linkedContractId: contractId,
  });
}

export async function linkCoverageToOpportunity(
  contactId: string,
  itemKey: string,
  opportunityId: string
): Promise<void> {
  await setCoverageStatus(contactId, itemKey, {
    status: "in_progress",
    linkedOpportunityId: opportunityId,
  });
}

export async function createOpportunityFromCoverageItem(
  contactId: string,
  itemKey: string
): Promise<string | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:write")) throw new Error("Forbidden");

  const segmentCode = getItemSegmentCode(itemKey);
  const info = getItemInfo(itemKey);
  if (!segmentCode || !info) throw new Error("Unknown coverage item");

  const stages = await db
    .select({ id: opportunityStages.id })
    .from(opportunityStages)
    .where(eq(opportunityStages.tenantId, auth.tenantId))
    .orderBy(asc(opportunityStages.sortOrder))
    .limit(1);
  const firstStageId = stages[0]?.id;
  if (!firstStageId) throw new Error("No pipeline stages configured");

  const caseType = segmentToCaseType(segmentCode);
  const title = `${info.category} – ${info.label}`;
  const newId = await createOpportunity({
    title,
    caseType,
    contactId,
    stageId: firstStageId,
  });
  if (newId) await linkCoverageToOpportunity(contactId, itemKey, newId);
  return newId;
}

export async function createTaskFromCoverageItem(
  contactId: string,
  itemKey: string,
  title?: string
): Promise<string | null> {
  const info = getItemInfo(itemKey);
  const taskTitle = title?.trim() || (info ? `${info.label} – sjednat` : "Úkol z pokrytí");
  return createTask({
    title: taskTitle,
    contactId,
  });
}

const FA_STATUS_TO_COVERAGE: Record<string, string> = {
  recommended: "opportunity",
  in_progress: "in_progress",
  waiting_signature: "waiting_signature",
  sold: "done",
  not_relevant: "not_relevant",
  cancelled: "none",
};

export async function importFaItemsToCoverage(
  analysisId: string,
  itemIds: string[]
): Promise<number> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  const { faPlanItems, financialAnalyses } = await import("db");
  const { inArray } = await import("db");

  const [fa] = await db
    .select({ contactId: financialAnalyses.contactId })
    .from(financialAnalyses)
    .where(and(eq(financialAnalyses.tenantId, auth.tenantId), eq(financialAnalyses.id, analysisId)))
    .limit(1);
  if (!fa?.contactId) throw new Error("FA nemá napojený kontakt.");

  const items = await db
    .select()
    .from(faPlanItems)
    .where(and(eq(faPlanItems.tenantId, auth.tenantId), inArray(faPlanItems.id, itemIds)));

  let count = 0;
  for (const item of items) {
    if (!item.itemKey || !item.segmentCode) continue;
    const coverageStatus = FA_STATUS_TO_COVERAGE[item.status] ?? "opportunity";
    const existing = await db
      .select({ id: contactCoverage.id })
      .from(contactCoverage)
      .where(
        and(
          eq(contactCoverage.tenantId, auth.tenantId),
          eq(contactCoverage.contactId, fa.contactId!),
          eq(contactCoverage.itemKey, item.itemKey)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(contactCoverage)
        .set({
          status: coverageStatus,
          faAnalysisId: analysisId,
          faItemId: item.id,
          updatedAt: new Date(),
          updatedBy: auth.userId,
        })
        .where(eq(contactCoverage.id, existing[0].id));
    } else {
      await db.insert(contactCoverage).values({
        tenantId: auth.tenantId,
        contactId: fa.contactId!,
        itemKey: item.itemKey,
        segmentCode: item.segmentCode,
        status: coverageStatus,
        faAnalysisId: analysisId,
        faItemId: item.id,
        updatedBy: auth.userId,
      });
    }
    count++;
  }
  return count;
}

export async function createOpportunityFromFaItem(
  faItemId: string,
  stageId?: string
): Promise<string | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:write")) throw new Error("Forbidden");

  const { faPlanItems, financialAnalyses, opportunities } = await import("db");

  const [item] = await db
    .select()
    .from(faPlanItems)
    .where(and(eq(faPlanItems.tenantId, auth.tenantId), eq(faPlanItems.id, faItemId)))
    .limit(1);
  if (!item) throw new Error("Plan item nenalezen.");

  const [fa] = await db
    .select({ contactId: financialAnalyses.contactId })
    .from(financialAnalyses)
    .where(eq(financialAnalyses.id, item.analysisId))
    .limit(1);

  let targetStageId = stageId;
  if (!targetStageId) {
    const stages = await db
      .select({ id: opportunityStages.id })
      .from(opportunityStages)
      .where(eq(opportunityStages.tenantId, auth.tenantId))
      .orderBy(asc(opportunityStages.sortOrder))
      .limit(3);
    targetStageId = stages[2]?.id ?? stages[0]?.id;
  }
  if (!targetStageId) throw new Error("Žádné pipeline stages.");

  const caseType = item.segmentCode ? segmentToCaseType(item.segmentCode) : "Ostatní";
  const title = item.label ?? `${item.itemType} z FA`;

  const newId = await createOpportunity({
    title,
    caseType,
    contactId: fa?.contactId ?? undefined,
    stageId: targetStageId,
  });

  if (newId) {
    await db
      .update(faPlanItems)
      .set({ opportunityId: newId, status: "in_progress", updatedAt: new Date() })
      .where(eq(faPlanItems.id, faItemId));

    await db
      .update(opportunities)
      .set({ faSourceId: item.analysisId })
      .where(eq(opportunities.id, newId));
  }
  return newId;
}
