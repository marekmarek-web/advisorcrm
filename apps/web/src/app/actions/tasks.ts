"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { getMembership } from "@/lib/auth/get-membership";
import { hasPermission } from "@/lib/auth/permissions";
import { db, tasks, contacts, opportunities, eq, and, asc, desc, isNull, isNotNull, gte, lt, lte, sql } from "db";
import { logActivity } from "./activity";

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  contactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  opportunityId: string | null;
  opportunityTitle: string | null;
  dueDate: string | null;
  completedAt: Date | null;
  createdAt: Date;
};

export type TaskCounts = {
  all: number;
  today: number;
  week: number;
  overdue: number;
  completed: number;
};

export async function getTasksList(
  filter?: "all" | "overdue" | "today" | "week" | "completed"
): Promise<TaskRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");

  const conditions: ReturnType<typeof eq>[] = [eq(tasks.tenantId, auth.tenantId)];
  const today = new Date().toISOString().slice(0, 10);

  switch (filter) {
    case "completed":
      conditions.push(isNotNull(tasks.completedAt));
      break;
    case "overdue":
      conditions.push(isNull(tasks.completedAt));
      conditions.push(lt(tasks.dueDate, today));
      break;
    case "today":
      conditions.push(isNull(tasks.completedAt));
      conditions.push(eq(tasks.dueDate, today));
      break;
    case "week": {
      conditions.push(isNull(tasks.completedAt));
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() + 7);
      conditions.push(gte(tasks.dueDate, today));
      conditions.push(lte(tasks.dueDate, weekEnd.toISOString().slice(0, 10)));
      break;
    }
    default:
      conditions.push(isNull(tasks.completedAt));
      break;
  }

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      contactId: tasks.contactId,
      opportunityId: tasks.opportunityId,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactPhone: contacts.phone,
      contactEmail: contacts.email,
      opportunityTitle: opportunities.title,
    })
    .from(tasks)
    .leftJoin(contacts, eq(tasks.contactId, contacts.id))
    .leftJoin(opportunities, eq(tasks.opportunityId, opportunities.id))
    .where(and(...conditions))
    .orderBy(
      filter === "completed" ? desc(tasks.completedAt) : asc(tasks.dueDate),
      asc(tasks.createdAt)
    );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    contactId: r.contactId,
    contactName:
      r.contactFirstName && r.contactLastName
        ? `${r.contactFirstName} ${r.contactLastName}`
        : r.contactFirstName || r.contactLastName || null,
    contactPhone: r.contactPhone ?? null,
    contactEmail: r.contactEmail ?? null,
    opportunityId: r.opportunityId ?? null,
    opportunityTitle: r.opportunityTitle ?? null,
    dueDate: r.dueDate,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  }));
}

/** Count of open (incomplete) tasks for the current tenant; for sidebar badge. */
export async function getOpenTasksCount(): Promise<number> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.tenantId, auth.tenantId), isNull(tasks.completedAt)));
  return Number(rows[0]?.count ?? 0);
}

export async function getTasksCounts(): Promise<TaskCounts> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) return { all: 0, today: 0, week: 0, overdue: 0, completed: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const rows = await db
    .select({
      all: sql<number>`count(*) filter (where ${tasks.completedAt} is null)::int`,
      today: sql<number>`count(*) filter (where ${tasks.completedAt} is null and ${tasks.dueDate} = ${today})::int`,
      week: sql<number>`count(*) filter (where ${tasks.completedAt} is null and ${tasks.dueDate} >= ${today} and ${tasks.dueDate} <= ${weekEndStr})::int`,
      overdue: sql<number>`count(*) filter (where ${tasks.completedAt} is null and ${tasks.dueDate} < ${today})::int`,
      completed: sql<number>`count(*) filter (where ${tasks.completedAt} is not null)::int`,
    })
    .from(tasks)
    .where(eq(tasks.tenantId, auth.tenantId));

  const r = rows[0];
  return {
    all: Number(r?.all ?? 0),
    today: Number(r?.today ?? 0),
    week: Number(r?.week ?? 0),
    overdue: Number(r?.overdue ?? 0),
    completed: Number(r?.completed ?? 0),
  };
}

export async function getTasksForDate(dateStr: string): Promise<TaskRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const conditions = [
    eq(tasks.tenantId, auth.tenantId),
    eq(tasks.dueDate, dateStr),
  ];
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      contactId: tasks.contactId,
      opportunityId: tasks.opportunityId,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactPhone: contacts.phone,
      contactEmail: contacts.email,
      opportunityTitle: opportunities.title,
    })
    .from(tasks)
    .leftJoin(contacts, eq(tasks.contactId, contacts.id))
    .leftJoin(opportunities, eq(tasks.opportunityId, opportunities.id))
    .where(and(...conditions))
    .orderBy(asc(tasks.createdAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    contactId: r.contactId,
    contactName: r.contactFirstName && r.contactLastName ? `${r.contactFirstName} ${r.contactLastName}` : r.contactFirstName || r.contactLastName || null,
    contactPhone: r.contactPhone ?? null,
    contactEmail: r.contactEmail ?? null,
    opportunityId: r.opportunityId ?? null,
    opportunityTitle: r.opportunityTitle ?? null,
    dueDate: r.dueDate,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  }));
}

export async function getTasksByContactId(contactId: string): Promise<TaskRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      contactId: tasks.contactId,
      opportunityId: tasks.opportunityId,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactPhone: contacts.phone,
      contactEmail: contacts.email,
      opportunityTitle: opportunities.title,
    })
    .from(tasks)
    .leftJoin(contacts, eq(tasks.contactId, contacts.id))
    .leftJoin(opportunities, eq(tasks.opportunityId, opportunities.id))
    .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.contactId, contactId)))
    .orderBy(asc(tasks.dueDate), asc(tasks.createdAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    contactId: r.contactId,
    contactName: r.contactFirstName && r.contactLastName ? `${r.contactFirstName} ${r.contactLastName}` : r.contactFirstName || r.contactLastName || null,
    contactPhone: r.contactPhone ?? null,
    contactEmail: r.contactEmail ?? null,
    opportunityId: r.opportunityId ?? null,
    opportunityTitle: r.opportunityTitle ?? null,
    dueDate: r.dueDate,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  }));
}

export async function getTasksByOpportunityId(oppId: string): Promise<TaskRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      contactId: tasks.contactId,
      opportunityId: tasks.opportunityId,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      contactPhone: contacts.phone,
      contactEmail: contacts.email,
      opportunityTitle: opportunities.title,
    })
    .from(tasks)
    .leftJoin(contacts, eq(tasks.contactId, contacts.id))
    .leftJoin(opportunities, eq(tasks.opportunityId, opportunities.id))
    .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.opportunityId, oppId)))
    .orderBy(asc(tasks.dueDate), asc(tasks.createdAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    contactId: r.contactId,
    contactName: r.contactFirstName && r.contactLastName ? `${r.contactFirstName} ${r.contactLastName}` : r.contactFirstName || r.contactLastName || null,
    contactPhone: r.contactPhone ?? null,
    contactEmail: r.contactEmail ?? null,
    opportunityId: r.opportunityId ?? null,
    opportunityTitle: r.opportunityTitle ?? null,
    dueDate: r.dueDate,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  }));
}

export async function createTask(data: {
  title: string;
  description?: string;
  contactId?: string;
  dueDate?: string;
  analysisId?: string;
  opportunityId?: string;
  /** For team/manager follow-ups: assign to this user (must be in same tenant; requires team_overview:read). */
  assignedTo?: string;
}): Promise<string | null> {
  try {
    const auth = await requireAuthInAction();
    const canWrite =
      hasPermission(auth.roleName, "contacts:write") || hasPermission(auth.roleName, "tasks:*");
    if (!canWrite) throw new Error("Nemáte oprávnění k vytváření úkolů.");

    let assignee = auth.userId;
    if (data.assignedTo) {
      if (!hasPermission(auth.roleName, "team_overview:read")) throw new Error("Forbidden");
      const member = await getMembership(data.assignedTo);
      if (!member || member.tenantId !== auth.tenantId) throw new Error("Forbidden");
      assignee = data.assignedTo;
    }

    const [row] = await db
      .insert(tasks)
      .values({
        tenantId: auth.tenantId,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        contactId: data.contactId || null,
        dueDate: data.dueDate || null,
        analysisId: data.analysisId || null,
        opportunityId: data.opportunityId || null,
        assignedTo: assignee,
        createdBy: auth.userId,
      })
      .returning({ id: tasks.id });
    const newId = row?.id ?? null;
    if (newId) {
      try {
        await logActivity("task", newId, "create", { title: data.title, contactId: data.contactId });
      } catch {}
    }
    return newId;
  } catch (e) {
    console.error("[createTask]", e);
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Forbidden") || msg.includes("oprávnění")) throw e;
    if (msg.includes("foreign key") || msg.includes("violates foreign key")) {
      throw new Error("Vybraný klient není platný nebo neexistuje. Zkuste vybrat jiného nebo nechat pole prázdné.");
    }
    throw new Error(msg || "Úkol se nepodařilo vytvořit. Zkuste to znovu.");
  }
}

export async function updateTask(
  id: string,
  data: {
    title?: string;
    description?: string;
    contactId?: string;
    dueDate?: string;
    opportunityId?: string;
  }
): Promise<void> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

    await db
      .update(tasks)
      .set({
        ...(data.title != null && { title: data.title.trim() }),
        ...(data.description != null && { description: data.description.trim() || null }),
        ...(data.contactId != null && { contactId: data.contactId || null }),
        ...(data.dueDate != null && { dueDate: data.dueDate || null }),
        ...(data.opportunityId != null && { opportunityId: data.opportunityId || null }),
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id)));
  } catch (e) {
    console.error("[updateTask]", e);
    throw new Error(e instanceof Error ? e.message : "Úkol se nepodařilo upravit.");
  }
}

export async function deleteTask(id: string): Promise<void> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

    await db
      .delete(tasks)
      .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id)));
    try { await logActivity("task", id, "delete"); } catch {}
  } catch (e) {
    console.error("[deleteTask]", e);
    throw new Error(e instanceof Error ? e.message : "Úkol se nepodařilo smazat.");
  }
}

export async function completeTask(id: string): Promise<void> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

    await db
      .update(tasks)
      .set({ completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id)));
    try { await logActivity("task", id, "complete"); } catch {}
  } catch (e) {
    console.error("[completeTask]", e);
    throw new Error(e instanceof Error ? e.message : "Úkol se nepodařilo dokončit.");
  }
}

export async function reopenTask(id: string): Promise<void> {
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

    await db
      .update(tasks)
      .set({ completedAt: null, updatedAt: new Date() })
      .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id)));
  } catch (e) {
    console.error("[reopenTask]", e);
    throw new Error(e instanceof Error ? e.message : "Úkol se nepodařilo znovu otevřít.");
  }
}
