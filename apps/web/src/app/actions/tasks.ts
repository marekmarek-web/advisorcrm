"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db, tasks, contacts, eq, and, asc, desc, isNull, isNotNull, gte, lt, lte } from "db";
import { logActivity } from "./activity";

export type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  contactId: string | null;
  contactName: string | null;
  dueDate: string | null;
  completedAt: Date | null;
  createdAt: Date;
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
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
    })
    .from(tasks)
    .leftJoin(contacts, eq(tasks.contactId, contacts.id))
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
        : null,
    dueDate: r.dueDate,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  }));
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
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
    })
    .from(tasks)
    .leftJoin(contacts, eq(tasks.contactId, contacts.id))
    .where(and(...conditions))
    .orderBy(asc(tasks.createdAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    contactId: r.contactId,
    contactName: r.contactFirstName && r.contactLastName ? `${r.contactFirstName} ${r.contactLastName}` : null,
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
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
    })
    .from(tasks)
    .leftJoin(contacts, eq(tasks.contactId, contacts.id))
    .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.contactId, contactId)))
    .orderBy(asc(tasks.dueDate), asc(tasks.createdAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    contactId: r.contactId,
    contactName: r.contactFirstName && r.contactLastName ? `${r.contactFirstName} ${r.contactLastName}` : null,
    dueDate: r.dueDate,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  }));
}

export async function getTasksByOpportunityId(opportunityId: string): Promise<TaskRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      contactId: tasks.contactId,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
    })
    .from(tasks)
    .leftJoin(contacts, eq(tasks.contactId, contacts.id))
    .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.opportunityId, opportunityId)))
    .orderBy(asc(tasks.dueDate), asc(tasks.createdAt));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    contactId: r.contactId,
    contactName: r.contactFirstName && r.contactLastName ? `${r.contactFirstName} ${r.contactLastName}` : null,
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
}): Promise<string | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  const [row] = await db
    .insert(tasks)
    .values({
      tenantId: auth.tenantId,
      title: data.title.trim(),
      description: data.description?.trim() || null,
      contactId: data.contactId || null,
      dueDate: data.dueDate || null,
      assignedTo: auth.userId,
      createdBy: auth.userId,
    })
    .returning({ id: tasks.id });
  const newId = row?.id ?? null;
  if (newId) {
    try { await logActivity("task", newId, "create", { title: data.title, contactId: data.contactId }); } catch {}
  }
  return newId;
}

export async function updateTask(
  id: string,
  data: {
    title?: string;
    description?: string;
    contactId?: string;
    dueDate?: string;
  }
): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  await db
    .update(tasks)
    .set({
      ...(data.title != null && { title: data.title.trim() }),
      ...(data.description != null && { description: data.description.trim() || null }),
      ...(data.contactId != null && { contactId: data.contactId || null }),
      ...(data.dueDate != null && { dueDate: data.dueDate || null }),
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id)));
}

export async function deleteTask(id: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  await db
    .delete(tasks)
    .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id)));
  try { await logActivity("task", id, "delete"); } catch {}
}

export async function completeTask(id: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  await db
    .update(tasks)
    .set({ completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id)));
  try { await logActivity("task", id, "complete"); } catch {}
}

export async function reopenTask(id: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  await db
    .update(tasks)
    .set({ completedAt: null, updatedAt: new Date() })
    .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id)));
}
