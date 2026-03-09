"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import { events, contacts, tasks } from "db";
import { eq, and, gte, lt, asc, desc, sql } from "db";
import { logActivity } from "./activity";

export type EventRow = {
  id: string;
  tenantId: string;
  contactId: string | null;
  opportunityId: string | null;
  title: string;
  eventType: string | null;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean | null;
  location: string | null;
  reminderAt: Date | null;
  assignedTo: string | null;
  contactName?: string | null;
  createdAt: Date;
};

export async function listEvents(filters?: {
  start?: string;
  end?: string;
  contactId?: string;
  opportunityId?: string;
}): Promise<EventRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");

  const conditions = [eq(events.tenantId, auth.tenantId)];

  if (filters?.start) {
    conditions.push(gte(events.startAt, new Date(filters.start)));
  }
  if (filters?.end) {
    conditions.push(lt(events.startAt, new Date(filters.end)));
  }
  if (filters?.contactId) {
    conditions.push(eq(events.contactId, filters.contactId));
  }
  if (filters?.opportunityId) {
    conditions.push(eq(events.opportunityId, filters.opportunityId));
  }

  const rows = await db
    .select({
      id: events.id,
      tenantId: events.tenantId,
      contactId: events.contactId,
      opportunityId: events.opportunityId,
      title: events.title,
      eventType: events.eventType,
      startAt: events.startAt,
      endAt: events.endAt,
      allDay: events.allDay,
      location: events.location,
      reminderAt: events.reminderAt,
      assignedTo: events.assignedTo,
      createdAt: events.createdAt,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
    })
    .from(events)
    .leftJoin(contacts, eq(events.contactId, contacts.id))
    .where(and(...conditions))
    .orderBy(asc(events.startAt));

  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    contactId: r.contactId,
    opportunityId: r.opportunityId,
    title: r.title,
    eventType: r.eventType,
    startAt: r.startAt,
    endAt: r.endAt,
    allDay: r.allDay,
    location: r.location,
    reminderAt: r.reminderAt,
    assignedTo: r.assignedTo,
    createdAt: r.createdAt,
    contactName: r.contactFirstName && r.contactLastName
      ? `${r.contactFirstName} ${r.contactLastName}`
      : null,
  }));
}

export type CallsReportRow = {
  id: string;
  startAt: Date;
  title: string;
  contactId: string | null;
  contactName: string | null;
  leadSource: string | null;
};

export async function getCallsReport(): Promise<CallsReportRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: events.id,
      startAt: events.startAt,
      title: events.title,
      contactId: events.contactId,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
      leadSource: contacts.leadSource,
    })
    .from(events)
    .leftJoin(contacts, eq(events.contactId, contacts.id))
    .where(
      and(
        eq(events.tenantId, auth.tenantId),
        eq(events.eventType, "telefonat")
      )
    )
    .orderBy(desc(events.startAt));
  return rows.map((r) => ({
    id: r.id,
    startAt: r.startAt,
    title: r.title,
    contactId: r.contactId,
    contactName: r.contactFirstName && r.contactLastName
      ? `${r.contactFirstName} ${r.contactLastName}`
      : null,
    leadSource: r.leadSource ?? null,
  }));
}

export async function createEvent(form: {
  title: string;
  eventType?: string;
  startAt: string;
  endAt?: string;
  allDay?: boolean;
  location?: string;
  reminderAt?: string;
  contactId?: string;
  opportunityId?: string;
}): Promise<string | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const [row] = await db
    .insert(events)
    .values({
      tenantId: auth.tenantId,
      title: form.title.trim(),
      eventType: form.eventType || "schuzka",
      startAt: new Date(form.startAt),
      endAt: form.endAt ? new Date(form.endAt) : null,
      allDay: form.allDay ?? false,
      location: form.location?.trim() || null,
      reminderAt: form.reminderAt ? new Date(form.reminderAt) : null,
      contactId: form.contactId || null,
      opportunityId: form.opportunityId || null,
      assignedTo: auth.userId,
    })
    .returning({ id: events.id });
  const newId = row?.id ?? null;
  if (newId) {
    try { await logActivity("event", newId, "create", { title: form.title, contactId: form.contactId }); } catch {}
  }
  return newId;
}

export async function updateEvent(
  id: string,
  form: {
    title?: string;
    eventType?: string;
    startAt?: string;
    endAt?: string;
    allDay?: boolean;
    location?: string;
    reminderAt?: string;
    contactId?: string;
    opportunityId?: string;
  }
): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  await db
    .update(events)
    .set({
      ...(form.title != null && { title: form.title.trim() }),
      ...(form.eventType != null && { eventType: form.eventType }),
      ...(form.startAt != null && { startAt: new Date(form.startAt) }),
      ...(form.endAt != null && { endAt: new Date(form.endAt) }),
      ...(form.allDay != null && { allDay: form.allDay }),
      ...(form.location != null && { location: form.location.trim() || null }),
      ...(form.contactId != null && { contactId: form.contactId || null }),
      ...(form.opportunityId != null && { opportunityId: form.opportunityId || null }),
      ...(form.reminderAt != null && { reminderAt: form.reminderAt ? new Date(form.reminderAt) : null }),
      updatedAt: new Date(),
    })
    .where(and(eq(events.tenantId, auth.tenantId), eq(events.id, id)));
  try { await logActivity("event", id, "update", { fields: Object.keys(form) }); } catch {}
}

export async function deleteEvent(id: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  await db
    .delete(events)
    .where(and(eq(events.tenantId, auth.tenantId), eq(events.id, id)));
  try { await logActivity("event", id, "delete"); } catch {}
}

export async function createFollowUp(
  sourceEventId: string,
  type: "event" | "task",
  form: { title: string; startAt?: string; dueDate?: string; contactId?: string }
): Promise<string | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

  if (type === "event") {
    const [row] = await db
      .insert(events)
      .values({
        tenantId: auth.tenantId,
        title: form.title.trim(),
        startAt: form.startAt ? new Date(form.startAt) : new Date(),
        contactId: form.contactId || null,
        assignedTo: auth.userId,
      })
      .returning({ id: events.id });
    return row?.id ?? null;
  }

  const [row] = await db
    .insert(tasks)
    .values({
      tenantId: auth.tenantId,
      title: form.title.trim(),
      dueDate: form.dueDate || null,
      contactId: form.contactId || null,
      assignedTo: auth.userId,
      createdBy: auth.userId,
    })
    .returning({ id: tasks.id });
  return row?.id ?? null;
}
