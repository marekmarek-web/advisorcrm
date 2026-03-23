"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import {
  opportunityStages,
  opportunities,
  contacts,
  timelineItems,
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
  assignedTo?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
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
  faSourceId: string | null;
  stages: OpportunityStageInfo[];
};

export type StageWithOpportunities = {
  id: string;
  name: string;
  sortOrder: number;
  opportunities: OpportunityCard[];
};

async function ensureStageBelongsToTenant(tenantId: string, stageId: string): Promise<void> {
  const [stage] = await db
    .select({ id: opportunityStages.id })
    .from(opportunityStages)
    .where(and(eq(opportunityStages.tenantId, tenantId), eq(opportunityStages.id, stageId)))
    .limit(1);
  if (!stage) {
    throw new Error("Vybraný stupeň pipeline neexistuje.");
  }
}

async function ensureContactBelongsToTenant(tenantId: string, contactId: string): Promise<void> {
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)))
    .limit(1);
  if (!row) {
    throw new Error("Vybraný kontakt neexistuje.");
  }
}

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
      assignedTo: opportunities.assignedTo,
      createdAt: opportunities.createdAt,
      updatedAt: opportunities.updatedAt,
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
        assignedTo: o.assignedTo ?? null,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
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
      assignedTo: opportunities.assignedTo,
      createdAt: opportunities.createdAt,
      updatedAt: opportunities.updatedAt,
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
        assignedTo: o.assignedTo ?? null,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      })),
  }));
}

export async function updateOpportunityStage(
  opportunityId: string,
  stageId: string
) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:write")) throw new Error("Forbidden");
  await ensureStageBelongsToTenant(auth.tenantId, stageId);

  const [stageRow] = await db
    .select({ name: opportunityStages.name })
    .from(opportunityStages)
    .where(
      and(
        eq(opportunityStages.tenantId, auth.tenantId),
        eq(opportunityStages.id, stageId)
      )
    )
    .limit(1);
  const newStageName = stageRow?.name ?? "—";

  const updated = await db
    .update(opportunities)
    .set({ stageId, updatedAt: new Date() })
    .where(
      and(
        eq(opportunities.tenantId, auth.tenantId),
        eq(opportunities.id, opportunityId)
      )
    )
    .returning({ id: opportunities.id, contactId: opportunities.contactId });
  if (updated.length === 0) {
    throw new Error("Příležitost nebyla nalezena.");
  }
  const contactId = updated[0]?.contactId ?? null;
  await db
    .insert(timelineItems)
    .values({
      tenantId: auth.tenantId,
      contactId,
      opportunityId: opportunityId,
      type: "stage_change",
      subject: `Obchod přesunut do fáze: ${newStageName}`,
      createdBy: auth.userId,
    })
    .catch(() => {});
  try { await logActivity("opportunity", opportunityId, "status_change", { stageId }); } catch {}
}

const DEFAULT_STAGES = [
  { name: "Zahájeno", sortOrder: 0, probability: 0 },
  { name: "Analýza potřeb", sortOrder: 1, probability: 20 },
  { name: "Nabídka", sortOrder: 2, probability: 40 },
  { name: "Před uzavřením", sortOrder: 3, probability: 60 },
  { name: "Realizace", sortOrder: 4, probability: 80 },
  { name: "Péče a servis", sortOrder: 5, probability: 100 },
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
      probability: stage.probability,
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
      faSourceId: opportunities.faSourceId,
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
    faSourceId: row.faSourceId ?? null,
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
  const title = data.title.trim();
  if (!title) {
    throw new Error("Název případu je povinný.");
  }
  await ensureStageBelongsToTenant(auth.tenantId, data.stageId);
  if (data.contactId) {
    await ensureContactBelongsToTenant(auth.tenantId, data.contactId);
  }
  const [row] = await db
    .insert(opportunities)
    .values({
      tenantId: auth.tenantId,
      title,
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
  if (data.stageId != null) {
    await ensureStageBelongsToTenant(auth.tenantId, data.stageId);
  }
  if (data.contactId) {
    await ensureContactBelongsToTenant(auth.tenantId, data.contactId);
  }
  if (data.title != null && !data.title.trim()) {
    throw new Error("Název případu je povinný.");
  }
  const updated = await db
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
    )
    .returning({ id: opportunities.id });
  if (updated.length === 0) {
    throw new Error("Příležitost nebyla nalezena.");
  }
  try { await logActivity("opportunity", id, "update", { fields: Object.keys(data) }); } catch {}
}

export async function closeOpportunity(opportunityId: string, won: boolean) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:write")) throw new Error("Forbidden");
  const closedAt = new Date();
  const closedAs = won ? "won" : "lost";
  const rows = await db
    .update(opportunities)
    .set({
      closedAt,
      closedAs,
      updatedAt: closedAt,
    })
    .where(
      and(
        eq(opportunities.tenantId, auth.tenantId),
        eq(opportunities.id, opportunityId)
      )
    )
    .returning({ id: opportunities.id });
  if (rows.length === 0) {
    throw new Error("Příležitost nebyla nalezena.");
  }
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

export async function getOpenOpportunitiesForSelect(): Promise<Array<{ id: string; title: string }>> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "opportunities:read")) return [];
  const rows = await db
    .select({ id: opportunities.id, title: opportunities.title })
    .from(opportunities)
    .where(and(eq(opportunities.tenantId, auth.tenantId), isNull(opportunities.closedAt)))
    .orderBy(asc(opportunities.title));
  return rows.map((r) => ({ id: r.id, title: r.title }));
}
