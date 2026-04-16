"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { teamEvents, teamTasks, events, tasks } from "db";
import { eq, and } from "db";
import { logActivity } from "./activity";
import { defaultTaskDueDateYmd } from "@/lib/date/date-only";

export async function createTeamEvent(
  form: {
    title: string;
    eventType?: string;
    startAt: string;
    endAt?: string;
    allDay?: boolean;
    location?: string;
    notes?: string;
    meetingLink?: string;
    reminderAt?: string;
  },
  targetUserIds: string[]
): Promise<string | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_calendar:write")) throw new Error("Forbidden");

  if (!form.title?.trim() || targetUserIds.length === 0) return null;

  const [master] = await db
    .insert(teamEvents)
    .values({
      tenantId: auth.tenantId,
      createdBy: auth.userId,
      title: form.title.trim(),
      eventType: form.eventType || "schuzka",
      startAt: new Date(form.startAt),
      endAt: form.endAt ? new Date(form.endAt) : null,
      allDay: form.allDay ?? false,
      location: form.location?.trim() || null,
      notes: form.notes?.trim() || null,
      meetingLink: form.meetingLink?.trim() || null,
      reminderAt: form.reminderAt ? new Date(form.reminderAt) : null,
      targetType: "selected",
      targetUserIds,
      updatedAt: new Date(),
    })
    .returning({ id: teamEvents.id });

  if (!master?.id) return null;

  const startAt = new Date(form.startAt);
  const endAt = form.endAt ? new Date(form.endAt) : null;
  if (targetUserIds.length > 0) {
    await db.insert(events).values(
      targetUserIds.map((userId) => ({
        tenantId: auth.tenantId,
        title: form.title.trim(),
        eventType: form.eventType || "schuzka",
        startAt,
        endAt,
        allDay: form.allDay ?? false,
        location: form.location?.trim() || null,
        notes: form.notes?.trim() || null,
        meetingLink: form.meetingLink?.trim() || null,
        reminderAt: form.reminderAt ? new Date(form.reminderAt) : null,
        assignedTo: userId,
        teamEventId: master.id,
        updatedAt: new Date(),
      }))
    );
  }
  try {
    await logActivity("event", master.id, "create", { title: form.title, teamEvent: true });
  } catch {}
  return master.id;
}

export async function createTeamTask(
  form: { title: string; description?: string; dueDate?: string },
  targetUserIds: string[]
): Promise<string | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_calendar:write")) throw new Error("Forbidden");

  if (!form.title?.trim() || targetUserIds.length === 0) return null;

  const dueTeam = form.dueDate?.trim() || defaultTaskDueDateYmd();

  const [master] = await db
    .insert(teamTasks)
    .values({
      tenantId: auth.tenantId,
      createdBy: auth.userId,
      title: form.title.trim(),
      description: form.description?.trim() || null,
      dueDate: new Date(dueTeam),
      targetType: "selected",
      targetUserIds,
      updatedAt: new Date(),
    })
    .returning({ id: teamTasks.id });

  if (!master?.id) return null;

  if (targetUserIds.length > 0) {
    await db.insert(tasks).values(
      targetUserIds.map((userId) => ({
        tenantId: auth.tenantId,
        title: form.title.trim(),
        description: form.description?.trim() || null,
        dueDate: dueTeam,
        assignedTo: userId,
        createdBy: auth.userId,
        teamTaskId: master.id,
        updatedAt: new Date(),
      }))
    );
  }
  try {
    await logActivity("task", master.id, "create", { title: form.title, teamTask: true });
  } catch {}
  return master.id;
}

export async function updateTeamEvent(
  teamEventId: string,
  form: {
    title?: string;
    eventType?: string;
    startAt?: string;
    endAt?: string;
    allDay?: boolean;
    location?: string;
    notes?: string;
    meetingLink?: string;
    reminderAt?: string;
  }
): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_calendar:write")) throw new Error("Forbidden");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (form.title != null) updates.title = form.title.trim();
  if (form.eventType != null) updates.eventType = form.eventType;
  if (form.startAt != null) updates.startAt = new Date(form.startAt);
  if (form.endAt != null) updates.endAt = form.endAt ? new Date(form.endAt) : null;
  if (form.allDay != null) updates.allDay = form.allDay;
  if (form.location != null) updates.location = form.location.trim() || null;
  if (form.notes != null) updates.notes = form.notes.trim() || null;
  if (form.meetingLink != null) updates.meetingLink = form.meetingLink.trim() || null;
  if (form.reminderAt != null) updates.reminderAt = form.reminderAt ? new Date(form.reminderAt) : null;

  await db
    .update(teamEvents)
    .set(updates as Record<string, never>)
    .where(and(eq(teamEvents.tenantId, auth.tenantId), eq(teamEvents.id, teamEventId)));

  await db
    .update(events)
    .set({
      ...(form.title != null && { title: form.title.trim() }),
      ...(form.eventType != null && { eventType: form.eventType }),
      ...(form.startAt != null && { startAt: new Date(form.startAt) }),
      ...(form.endAt != null && { endAt: form.endAt ? new Date(form.endAt) : null }),
      ...(form.allDay != null && { allDay: form.allDay }),
      ...(form.location != null && { location: form.location.trim() || null }),
      ...(form.notes != null && { notes: form.notes.trim() || null }),
      ...(form.meetingLink != null && { meetingLink: form.meetingLink.trim() || null }),
      ...(form.reminderAt != null && { reminderAt: form.reminderAt ? new Date(form.reminderAt) : null }),
      updatedAt: new Date(),
    })
    .where(eq(events.teamEventId, teamEventId));
}

export async function cancelTeamEvent(teamEventId: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_calendar:write")) throw new Error("Forbidden");

  await db
    .update(teamEvents)
    .set({ cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(teamEvents.tenantId, auth.tenantId), eq(teamEvents.id, teamEventId)));

  await db
    .update(events)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(events.teamEventId, teamEventId));
}

export async function cancelTeamTask(teamTaskId: string): Promise<void> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_calendar:write")) throw new Error("Forbidden");

  await db
    .update(teamTasks)
    .set({ cancelledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(teamTasks.tenantId, auth.tenantId), eq(teamTasks.id, teamTaskId)));

  await db
    .update(tasks)
    .set({ completedAt: new Date(), updatedAt: new Date() })
    .where(eq(tasks.teamTaskId, teamTaskId));
}
