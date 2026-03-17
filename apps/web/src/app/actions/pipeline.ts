"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import {
  opportunityStages,
  opportunities,
  contacts,
} from "db";
import { eq, and, asc, isNull, lte, gte, sql } from "db";
import { logActivity } from "./activity";

export type OpportunityCard = {
  id: string;
  title: string;
  caseType: string;
  contactId: string | null;
  contactName: string;
  expectedValue: string | null;
  expectedCloseDate: string | null;
};

export type OpportunityStageInfo = {
  id: string;
  name: string;
  sortOrder: number;
  probability: number | null;
};

export type OpportunityDetail = {
  id: string;
  title: string;
  caseType: string;
  contactId: string | null;
  contactName: string;
  stageId: string;
  stageName: string;
  stageProbability: number | null;
  probability: number | null;
  expectedValue: string | null;
  expectedCloseDate: string | null;
  assignedTo: string | null;
  closedAt: Date | null;
  closedAs: string | null;
  customFields: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  opportunityNumber: string;
  stages: OpportunityStageInfo[];
};

export type StageWithOpportunities = {
  id: string;
  name: string;
  sortOrder: number;
  opportunities: OpportunityCard[];
};

export async function getPipeline(): Promise<StageWithOpportunities[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:read")) throw new Error("Forbidden");

  const stages = await db
    .select()
    .from(opportunityStages)
    .where(eq(opportunityStages.tenantId, auth.tenantId))
    .orderBy(asc(opportunityStages.sortOrder));

  const oppsWithContact = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      caseType: opportunities.caseType,
      stageId: opportunities.stageId,
      contactId: opportunities.contactId,
      expectedValue: opportunities.expectedValue,
      expectedCloseDate: opportunities.expectedCloseDate,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(opportunities)
    .leftJoin(contacts, eq(opportunities.contactId, contacts.id))
    .where(
      and(
        eq(opportunities.tenantId, auth.tenantId),
        isNull(opportunities.closedAt)
      )
    );

  return stages.map((st) => ({
    id: st.id,
    name: st.name,
    sortOrder: st.sortOrder,
    opportunities: oppsWithContact
      .filter((o) => o.stageId === st.id)
      .map((o) => ({
        id: o.id,
        title: o.title,
        caseType: o.caseType ?? "",
        contactId: o.contactId ?? null,
        contactName: [o.firstName, o.lastName].filter(Boolean).join(" ") || "—",
        expectedValue: o.expectedValue ?? null,
        expectedCloseDate: o.expectedCloseDate ?? null,
      })),
  }));
}

/** Open opportunities for a contact with updatedAt (for AI opportunity engine). */
export async function getOpenOpportunitiesByContactWithMeta(
  contactId: string
): Promise<Array<{ id: string; caseType: string; updatedAt: Date }>> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: opportunities.id,
      caseType: opportunities.caseType,
      updatedAt: opportunities.updatedAt,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenantId, auth.tenantId),
        eq(opportunities.contactId, contactId),
        isNull(opportunities.closedAt)
      )
    );
  return rows.map((r) => ({
    id: r.id,
    caseType: r.caseType ?? "",
    updatedAt: r.updatedAt,
  }));
}

export async function getPipelineByContact(contactId: string): Promise<StageWithOpportunities[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:read")) throw new Error("Forbidden");

  const stages = await db
    .select()
    .from(opportunityStages)
    .where(eq(opportunityStages.tenantId, auth.tenantId))
    .orderBy(asc(opportunityStages.sortOrder));

  const oppsWithContact = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      caseType: opportunities.caseType,
      stageId: opportunities.stageId,
      contactId: opportunities.contactId,
      expectedValue: opportunities.expectedValue,
      expectedCloseDate: opportunities.expectedCloseDate,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(opportunities)
    .leftJoin(contacts, eq(opportunities.contactId, contacts.id))
    .where(
      and(
        eq(opportunities.tenantId, auth.tenantId),
        eq(opportunities.contactId, contactId),
        isNull(opportunities.closedAt)
      )
    );

  return stages.map((st) => ({
    id: st.id,
    name: st.name,
    sortOrder: st.sortOrder,
    opportunities: oppsWithContact
      .filter((o) => o.stageId === st.id)
      .map((o) => ({
        id: o.id,
        title: o.title,
        caseType: o.caseType ?? "",
        contactId: o.contactId ?? null,
        contactName: [o.firstName, o.lastName].filter(Boolean).join(" ") || "—",
        expectedValue: o.expectedValue ?? null,
        expectedCloseDate: o.expectedCloseDate ?? null,
      })),
  }));
}

export async function updateOpportunityStage(
  opportunityId: string,
  stageId: string
) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:write")) throw new Error("Forbidden");
  await db
    .update(opportunities)
    .set({ stageId, updatedAt: new Date() })
    .where(
      and(
        eq(opportunities.tenantId, auth.tenantId),
        eq(opportunities.id, opportunityId)
      )
    );
  try { await logActivity("opportunity", opportunityId, "status_change", { stageId }); } catch {}
}

const DEFAULT_STAGES = [
  { name: "Začínáme", sortOrder: 0 },
  { name: "Analýza potřeb", sortOrder: 1 },
  { name: "Šla nabídka", sortOrder: 2 },
  { name: "Před uzavřením", sortOrder: 3 },
  { name: "Realizace", sortOrder: 4 },
  { name: "Péče & Servis", sortOrder: 5 },
];

export async function ensureDefaultStages(): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:write")) return;
  const existing = await db
    .select({ sortOrder: opportunityStages.sortOrder })
    .from(opportunityStages)
    .where(eq(opportunityStages.tenantId, auth.tenantId));
  const existingOrders = new Set(existing.map((r) => r.sortOrder));
  for (const stage of DEFAULT_STAGES) {
    if (existingOrders.has(stage.sortOrder)) continue;
    await db.insert(opportunityStages).values({
      tenantId: auth.tenantId,
      name: stage.name,
      sortOrder: stage.sortOrder,
    });
    existingOrders.add(stage.sortOrder);
  }
}

export type OpenOpportunityOption = { id: string; title: string; contactId: string | null };

export async function getOpenOpportunitiesList(): Promise<OpenOpportunityOption[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      contactId: opportunities.contactId,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenantId, auth.tenantId),
        isNull(opportunities.closedAt)
      )
    )
    .orderBy(asc(opportunities.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    contactId: r.contactId ?? null,
  }));
}

export async function getOpportunityStages(): Promise<OpportunityStageInfo[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: opportunityStages.id,
      name: opportunityStages.name,
      sortOrder: opportunityStages.sortOrder,
      probability: opportunityStages.probability,
    })
    .from(opportunityStages)
    .where(eq(opportunityStages.tenantId, auth.tenantId))
    .orderBy(asc(opportunityStages.sortOrder));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sortOrder: r.sortOrder,
    probability: r.probability ?? null,
  }));
}

export type OpportunityByHouseholdRow = {
  id: string;
  title: string;
  stageName: string | null;
  contactName: string;
};

export async function getOpportunitiesByHousehold(householdId: string): Promise<OpportunityByHouseholdRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:read")) return [];
  const rows = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      stageName: opportunityStages.name,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(opportunities)
    .leftJoin(opportunityStages, eq(opportunities.stageId, opportunityStages.id))
    .leftJoin(contacts, eq(opportunities.contactId, contacts.id))
    .where(
      and(
        eq(opportunities.tenantId, auth.tenantId),
        eq(opportunities.householdId, householdId),
        isNull(opportunities.closedAt)
      )
    )
    .orderBy(asc(opportunityStages.sortOrder));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    stageName: r.stageName ?? null,
    contactName: [r.firstName, r.lastName].filter(Boolean).join(" ") || "—",
  }));
}

export async function getOpportunityById(id: string): Promise<OpportunityDetail | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:read")) throw new Error("Forbidden");

  const stages = await getOpportunityStages();
  const [row] = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      caseType: opportunities.caseType,
      contactId: opportunities.contactId,
      stageId: opportunities.stageId,
      probability: opportunities.probability,
      expectedValue: opportunities.expectedValue,
      expectedCloseDate: opportunities.expectedCloseDate,
      assignedTo: opportunities.assignedTo,
      closedAt: opportunities.closedAt,
      closedAs: opportunities.closedAs,
      customFields: opportunities.customFields,
      createdAt: opportunities.createdAt,
      updatedAt: opportunities.updatedAt,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      stageName: opportunityStages.name,
      stageProbability: opportunityStages.probability,
    })
    .from(opportunities)
    .leftJoin(contacts, eq(opportunities.contactId, contacts.id))
    .leftJoin(opportunityStages, eq(opportunities.stageId, opportunityStages.id))
    .where(and(eq(opportunities.tenantId, auth.tenantId), eq(opportunities.id, id)));

  if (!row) return null;

  const created = new Date(row.createdAt);
  const year = created.getFullYear();
  const shortYear = String(year).slice(-2);
  const startOfYear = new Date(year, 0, 1);
  const [seqResult] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.tenantId, auth.tenantId),
        gte(opportunities.createdAt, startOfYear),
        lte(opportunities.createdAt, row.createdAt)
      )
    );
  const seq = seqResult?.n ?? 1;
  const opportunityNumber = `OP-${shortYear}-${String(seq).padStart(3, "0")}`;

  return {
    id: row.id,
    title: row.title,
    caseType: row.caseType ?? "",
    contactId: row.contactId ?? null,
    contactName: [row.firstName, row.lastName].filter(Boolean).join(" ") || "—",
    stageId: row.stageId,
    stageName: row.stageName ?? "—",
    stageProbability: row.stageProbability ?? null,
    probability: row.probability ?? null,
    expectedValue: row.expectedValue ?? null,
    expectedCloseDate: row.expectedCloseDate ?? null,
    assignedTo: row.assignedTo ?? null,
    closedAt: row.closedAt ?? null,
    closedAs: row.closedAs ?? null,
    customFields: row.customFields as Record<string, unknown> | null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    opportunityNumber,
    stages,
  };
}

export async function createOpportunity(data: {
  title: string;
  caseType: string;
  contactId?: string;
  stageId: string;
  expectedValue?: string;
  expectedCloseDate?: string;
}) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:write")) throw new Error("Forbidden");
  const [row] = await db
    .insert(opportunities)
    .values({
      tenantId: auth.tenantId,
      title: data.title.trim(),
      caseType: data.caseType,
      contactId: data.contactId || null,
      stageId: data.stageId,
      expectedValue: data.expectedValue || null,
      expectedCloseDate: data.expectedCloseDate || null,
    })
    .returning({ id: opportunities.id });
  const newId = row?.id ?? null;
  if (newId) {
    try { await logActivity("opportunity", newId, "create", { title: data.title, contactId: data.contactId }); } catch {}
  }
  return newId;
}

export async function updateOpportunity(
  id: string,
  data: {
    title?: string;
    caseType?: string;
    contactId?: string | null;
    stageId?: string;
    expectedValue?: string | null;
    expectedCloseDate?: string | null;
    closedAt?: Date | null;
    closedAs?: string | null;
    customFields?: Record<string, unknown> | null;
  }
) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:write")) throw new Error("Forbidden");
  await db
    .update(opportunities)
    .set({
      ...(data.title != null && { title: data.title.trim() }),
      ...(data.caseType != null && { caseType: data.caseType }),
      ...(data.contactId !== undefined && { contactId: data.contactId || null }),
      ...(data.stageId != null && { stageId: data.stageId }),
      ...(data.expectedValue !== undefined && { expectedValue: data.expectedValue || null }),
      ...(data.expectedCloseDate !== undefined && { expectedCloseDate: data.expectedCloseDate || null }),
      ...(data.closedAt !== undefined && { closedAt: data.closedAt || null }),
      ...(data.closedAs !== undefined && { closedAs: data.closedAs || null }),
      ...(data.customFields !== undefined && { customFields: data.customFields ?? null }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(opportunities.tenantId, auth.tenantId),
        eq(opportunities.id, id)
      )
    );
  try { await logActivity("opportunity", id, "update", { fields: Object.keys(data) }); } catch {}
}

export async function closeOpportunity(opportunityId: string, won: boolean) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:write")) throw new Error("Forbidden");
  await db
    .update(opportunities)
    .set({
      closedAt: new Date(),
      closedAs: won ? "won" : "lost",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(opportunities.tenantId, auth.tenantId),
        eq(opportunities.id, opportunityId)
      )
    );
  try { await logActivity("opportunity", opportunityId, won ? "won" : "lost"); } catch {}
}

export async function deleteOpportunity(id: string) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:write")) throw new Error("Forbidden");
  await db
    .delete(opportunities)
    .where(
      and(
        eq(opportunities.tenantId, auth.tenantId),
        eq(opportunities.id, id)
      )
    );
  try { await logActivity("opportunity", id, "delete"); } catch {}
}
