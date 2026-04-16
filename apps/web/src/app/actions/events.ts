"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { getMembership } from "@/lib/auth/get-membership";
import { hasPermission } from "@/lib/auth/permissions";
import { getValidAccessToken } from "@/lib/integrations/google-calendar-integration-service";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "@/lib/integrations/google-calendar";
import { db } from "db";
import { events, contacts, tasks } from "db";
import { eq, and, gte, lt, asc, desc, sql } from "db";
import { logActivity } from "./activity";
import {
  DEFAULT_EVENT_DURATION_MS,
  addOneCalendarDayYmd,
  hasExplicitIsoOffset,
} from "@/app/portal/calendar/date-utils";
import { defaultTaskDueDateYmd } from "@/lib/date/date-only";

function parseInstantRequired(fieldLabel: string, s: string): Date {
  if (!hasExplicitIsoOffset(s)) {
    throw new Error(
      `${fieldLabel}: očekává se ISO 8601 s časovou zónou (např. koncovka Z).`,
    );
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${fieldLabel}: neplatné datum.`);
  }
  return d;
}

function instantMs(v: string | Date | null | undefined): number | null {
  if (v == null || v === "") return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Reset odeslání připomenutí jen při změně času nebo připomenutí (ne při úpravě názvu). */
function scheduleTimesOrReminderChanged(
  existing:
    | { startAt: Date; endAt: Date | null; reminderAt: Date | null }
    | undefined,
  form: { startAt?: string; endAt?: string; reminderAt?: string | null },
): boolean {
  if (!existing) {
    return form.startAt != null || form.endAt != null || form.reminderAt !== undefined;
  }
  if (form.startAt != null && instantMs(form.startAt) !== instantMs(existing.startAt)) return true;
  if (form.endAt != null && instantMs(form.endAt) !== instantMs(existing.endAt)) return true;
  if (form.reminderAt !== undefined) {
    const next = form.reminderAt ? instantMs(form.reminderAt) : null;
    const prev = instantMs(existing.reminderAt);
    if (next !== prev) return true;
  }
  return false;
}

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
  status: string | null;
  notes: string | null;
  meetingLink: string | null;
  taskId: string | null;
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
      status: events.status,
      notes: events.notes,
      meetingLink: events.meetingLink,
      taskId: events.taskId,
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
    status: r.status ?? null,
    notes: r.notes ?? null,
    meetingLink: r.meetingLink ?? null,
    taskId: r.taskId ?? null,
    createdAt: r.createdAt,
    contactName: r.contactFirstName && r.contactLastName
      ? `${r.contactFirstName} ${r.contactLastName}`
      : null,
  }));
}

/** Get a single event by id; enforces tenant and returns contact name. */
export async function getEvent(id: string): Promise<EventRow | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
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
      status: events.status,
      notes: events.notes,
      meetingLink: events.meetingLink,
      taskId: events.taskId,
      createdAt: events.createdAt,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
    })
    .from(events)
    .leftJoin(contacts, eq(events.contactId, contacts.id))
    .where(and(eq(events.tenantId, auth.tenantId), eq(events.id, id)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
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
    status: r.status ?? null,
    notes: r.notes ?? null,
    meetingLink: r.meetingLink ?? null,
    taskId: r.taskId ?? null,
    createdAt: r.createdAt,
    contactName: r.contactFirstName && r.contactLastName
      ? `${r.contactFirstName} ${r.contactLastName}`
      : null,
  };
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
  /** Inclusive calendar YYYY-MM-DD when allDay (user’s chosen days); drives Google `date` fields. */
  allDayStartYmd?: string;
  allDayEndYmd?: string;
  location?: string;
  reminderAt?: string;
  contactId?: string;
  opportunityId?: string;
  status?: string;
  notes?: string;
  meetingLink?: string;
  taskId?: string;
  /** For team/1:1 follow-ups: assign to this user (must be in same tenant; requires team_overview:read). */
  assignedTo?: string;
}): Promise<string | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  let assignee = auth.userId;
  if (form.assignedTo) {
    if (!hasPermission(auth.roleName, "team_overview:read")) throw new Error("Forbidden");
    const member = await getMembership(form.assignedTo);
    if (!member || member.tenantId !== auth.tenantId) throw new Error("Forbidden");
    assignee = form.assignedTo;
  }
  const startAt = parseInstantRequired("Začátek události", form.startAt);
  const endAt = form.endAt
    ? parseInstantRequired("Konec události", form.endAt)
    : new Date(startAt.getTime() + DEFAULT_EVENT_DURATION_MS);
  let googleEventId: string | null = null;
  let googleCalendarId: string | null = null;
  try {
    const valid = await getValidAccessToken(auth.userId, auth.tenantId);
    const allDay = form.allDay ?? false;
    const startIso = startAt.toISOString();
    const endIso = endAt.toISOString();
    const sy = form.allDayStartYmd?.trim();
    const ey = form.allDayEndYmd?.trim();
    const googleAllDayStart =
      allDay && sy && /^\d{4}-\d{2}-\d{2}$/.test(sy) ? sy : startIso.slice(0, 10);
    const googleAllDayEndInclusive =
      allDay && ey && /^\d{4}-\d{2}-\d{2}$/.test(ey) ? ey : endIso.slice(0, 10);
    const googleAllDayEndExclusive =
      allDay ? addOneCalendarDayYmd(googleAllDayEndInclusive) ?? googleAllDayEndInclusive : "";
    const googleEvent = await createCalendarEvent(valid.accessToken, valid.calendarId, {
      summary: form.title.trim(),
      description: form.notes?.trim() || undefined,
      location: form.location?.trim() || undefined,
      ...(allDay
        ? {
            start: { date: googleAllDayStart },
            end: { date: googleAllDayEndExclusive },
          }
        : {
            start: { dateTime: startIso },
            end: { dateTime: endIso },
          }),
    });
    googleEventId = googleEvent.id ?? null;
    googleCalendarId = valid.calendarId;
  } catch {
    // Google not connected or API error – event will be stored only in DB
  }
  const [row] = await db
    .insert(events)
    .values({
      tenantId: auth.tenantId,
      title: form.title.trim(),
      eventType: form.eventType || "schuzka",
      startAt,
      endAt,
      allDay: form.allDay ?? false,
      location: form.location?.trim() || null,
      reminderAt: form.reminderAt ? parseInstantRequired("Připomínka", form.reminderAt) : null,
      contactId: form.contactId || null,
      opportunityId: form.opportunityId || null,
      status: form.status?.trim() || null,
      notes: form.notes?.trim() || null,
      meetingLink: form.meetingLink?.trim() || null,
      taskId: form.taskId || null,
      assignedTo: assignee,
      googleEventId,
      googleCalendarId,
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
    allDayStartYmd?: string;
    allDayEndYmd?: string;
    location?: string;
    /** `null` zruší připomenutí; vynechání pole ponechá DB beze změny. */
    reminderAt?: string | null;
    contactId?: string;
    opportunityId?: string;
    status?: string;
    notes?: string;
    meetingLink?: string;
    taskId?: string;
  }
): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const [existing] = await db
    .select({
      googleEventId: events.googleEventId,
      googleCalendarId: events.googleCalendarId,
      startAt: events.startAt,
      endAt: events.endAt,
      reminderAt: events.reminderAt,
      allDay: events.allDay,
    })
    .from(events)
    .where(and(eq(events.tenantId, auth.tenantId), eq(events.id, id)))
    .limit(1);
  if (existing?.googleEventId) {
    try {
      const valid = await getValidAccessToken(auth.userId, auth.tenantId);
      const calendarId = existing.googleCalendarId ?? valid.calendarId;
      const patch: { summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; description?: string; location?: string } = {};
      if (form.title != null) patch.summary = form.title.trim();
      if (form.notes != null) patch.description = form.notes.trim() || undefined;
      if (form.location != null) patch.location = form.location.trim() || undefined;
      if (form.startAt != null || form.endAt != null || form.allDay != null) {
        const startAt =
          form.startAt != null
            ? parseInstantRequired("Začátek události", form.startAt)
            : existing.startAt;
        const endAt =
          form.endAt != null
            ? parseInstantRequired("Konec události", form.endAt)
            : existing.endAt != null
              ? existing.endAt
              : new Date(startAt.getTime() + DEFAULT_EVENT_DURATION_MS);
        const allDay = form.allDay ?? existing.allDay ?? false;
        const startIso = startAt.toISOString();
        const endIso = endAt.toISOString();
        const sy = form.allDayStartYmd?.trim();
        const ey = form.allDayEndYmd?.trim();
        const googleAllDayStart =
          allDay && sy && /^\d{4}-\d{2}-\d{2}$/.test(sy) ? sy : startIso.slice(0, 10);
        const googleAllDayEndInclusive =
          allDay && ey && /^\d{4}-\d{2}-\d{2}$/.test(ey) ? ey : endIso.slice(0, 10);
        const googleAllDayEndExclusive =
          allDay ? addOneCalendarDayYmd(googleAllDayEndInclusive) ?? googleAllDayEndInclusive : "";
        if (allDay) {
          patch.start = { date: googleAllDayStart };
          patch.end = { date: googleAllDayEndExclusive };
        } else {
          patch.start = { dateTime: startIso };
          patch.end = { dateTime: endIso };
        }
      }
      if (Object.keys(patch).length > 0) {
        await updateCalendarEvent(valid.accessToken, calendarId, existing.googleEventId, patch);
      }
    } catch {
      // Google not connected or API error – DB update still proceeds
    }
  }
  const scheduleChanged = scheduleTimesOrReminderChanged(existing, form);

  await db
    .update(events)
    .set({
      ...(form.title != null && { title: form.title.trim() }),
      ...(form.eventType != null && { eventType: form.eventType }),
      ...(form.startAt != null && { startAt: parseInstantRequired("Začátek události", form.startAt) }),
      ...(form.endAt != null && { endAt: parseInstantRequired("Konec události", form.endAt) }),
      ...(form.allDay != null && { allDay: form.allDay }),
      ...(form.location != null && { location: form.location.trim() || null }),
      ...(form.contactId != null && { contactId: form.contactId || null }),
      ...(form.opportunityId != null && { opportunityId: form.opportunityId || null }),
      ...(form.reminderAt !== undefined && {
        reminderAt: form.reminderAt ? parseInstantRequired("Připomínka", form.reminderAt) : null,
      }),
      ...(scheduleChanged && { reminderNotifiedAt: null }),
      ...(form.status != null && { status: form.status.trim() || null }),
      ...(form.notes != null && { notes: form.notes.trim() || null }),
      ...(form.meetingLink != null && { meetingLink: form.meetingLink.trim() || null }),
      ...(form.taskId != null && { taskId: form.taskId || null }),
      updatedAt: new Date(),
    })
    .where(and(eq(events.tenantId, auth.tenantId), eq(events.id, id)));
  try { await logActivity("event", id, "update", { fields: Object.keys(form) }); } catch {}
}

export async function deleteEvent(id: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");
  const [existing] = await db
    .select({ googleEventId: events.googleEventId, googleCalendarId: events.googleCalendarId })
    .from(events)
    .where(and(eq(events.tenantId, auth.tenantId), eq(events.id, id)))
    .limit(1);
  if (existing?.googleEventId) {
    try {
      const valid = await getValidAccessToken(auth.userId, auth.tenantId);
      const calendarId = existing.googleCalendarId ?? valid.calendarId;
      await deleteCalendarEvent(valid.accessToken, calendarId, existing.googleEventId);
    } catch {
      // Google not connected or API error – still delete from DB
    }
  }
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
  try {
    const auth = await requireAuthInAction();
    if (!hasPermission(auth.roleName, "contacts:write")) throw new Error("Forbidden");

    if (type === "event") {
      const startAt = form.startAt ? parseInstantRequired("Začátek události", form.startAt) : new Date();
      const endAt = new Date(startAt.getTime() + DEFAULT_EVENT_DURATION_MS);
      const [row] = await db
        .insert(events)
        .values({
          tenantId: auth.tenantId,
          title: form.title.trim(),
          eventType: "followup",
          startAt,
          endAt,
          contactId: form.contactId || null,
          assignedTo: auth.userId,
        })
        .returning({ id: events.id });
      return row?.id ?? null;
    }

    const dueFollowUp = form.dueDate?.trim() || defaultTaskDueDateYmd();
    const [row] = await db
      .insert(tasks)
      .values({
        tenantId: auth.tenantId,
        title: form.title.trim(),
        dueDate: dueFollowUp,
        contactId: form.contactId || null,
        assignedTo: auth.userId,
        createdBy: auth.userId,
      })
      .returning({ id: tasks.id });
    return row?.id ?? null;
  } catch (e) {
    console.error("[createFollowUp]", e);
    return null;
  }
}
