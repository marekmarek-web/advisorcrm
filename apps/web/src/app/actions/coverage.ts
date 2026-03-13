"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
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

export async function getCoverageForContact(contactId: string): Promise<GetCoverageResult> {
  try {
    const auth = await requireAuthInAction();
    if (auth.roleName === "Client") {
      if (auth.contactId !== contactId) throw new Error("Forbidden");
    } else if (!hasPermission(auth.roleName, "contacts:read")) {
      throw new Error("Forbidden");
    }

    const [contractsList, pipelineStages, coverageRows] = await Promise.all([
      getContractsByContact(contactId),
      getPipelineByContact(contactId),
      db
        .select()
        .from(contactCoverage)
        .where(and(eq(contactCoverage.tenantId, auth.tenantId), eq(contactCoverage.contactId, contactId))),
    ]);

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
      updatedAt: r.updatedAt,
      updatedBy: r.updatedBy,
    }));

    const { items, summary } = resolveCoverageItems(storedRows, contractsForCoverage, openOpportunities);
    return { resolvedItems: items, summary };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[getCoverageForContact]", contactId, err);
    }
    throw err instanceof Error ? err : new Error("Nepodařilo se načíst pokrytí produktů");
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
