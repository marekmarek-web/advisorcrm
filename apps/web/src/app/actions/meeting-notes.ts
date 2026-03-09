"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import { db } from "db";
import { noteTemplates, meetingNotes, contacts } from "db";
import { eq, and, desc } from "db";

export type TemplateRow = { id: string; name: string; domain: string };

export type MeetingNoteRow = {
  id: string;
  meetingAt: Date;
  domain: string;
  contactName: string;
  createdAt: Date;
};

export async function getNoteTemplates(): Promise<TemplateRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "meeting_notes:read")) throw new Error("Forbidden");
  const rows = await db.select({ id: noteTemplates.id, name: noteTemplates.name, domain: noteTemplates.domain }).from(noteTemplates).where(eq(noteTemplates.tenantId, auth.tenantId));
  return rows;
}

export async function getMeetingNotesList(contactId?: string): Promise<MeetingNoteRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "meeting_notes:read")) throw new Error("Forbidden");
  const cond = contactId ? and(eq(meetingNotes.tenantId, auth.tenantId), eq(meetingNotes.contactId, contactId)) : eq(meetingNotes.tenantId, auth.tenantId);
  const rows = await db.select({ id: meetingNotes.id, meetingAt: meetingNotes.meetingAt, domain: meetingNotes.domain, contactId: meetingNotes.contactId, createdAt: meetingNotes.createdAt }).from(meetingNotes).where(cond).orderBy(desc(meetingNotes.meetingAt)).limit(50);
  const contactIds = [...new Set(rows.map((r) => r.contactId))];
  const contactList = contactIds.length ? await db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(eq(contacts.tenantId, auth.tenantId)) : [];
  const nameMap = Object.fromEntries(contactList.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
  return rows.map((r) => ({ id: r.id, meetingAt: r.meetingAt, domain: r.domain, contactName: nameMap[r.contactId] ?? "—", createdAt: r.createdAt }));
}

/** Pro Vision Board: zápisky včetně content pro náhled karet */
export type MeetingNoteForBoard = MeetingNoteRow & {
  contactId: string;
  content: Record<string, unknown> | null;
};

export async function getMeetingNotesForBoard(): Promise<MeetingNoteForBoard[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "meeting_notes:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: meetingNotes.id,
      meetingAt: meetingNotes.meetingAt,
      domain: meetingNotes.domain,
      contactId: meetingNotes.contactId,
      content: meetingNotes.content,
      createdAt: meetingNotes.createdAt,
    })
    .from(meetingNotes)
    .where(eq(meetingNotes.tenantId, auth.tenantId))
    .orderBy(desc(meetingNotes.meetingAt))
    .limit(100);
  const contactIds = [...new Set(rows.map((r) => r.contactId))];
  const contactList = contactIds.length ? await db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(eq(contacts.tenantId, auth.tenantId)) : [];
  const nameMap = Object.fromEntries(contactList.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
  return rows.map((r) => ({
    id: r.id,
    meetingAt: r.meetingAt,
    domain: r.domain,
    contactId: r.contactId,
    contactName: nameMap[r.contactId] ?? "—",
    createdAt: r.createdAt,
    content: r.content as Record<string, unknown> | null,
  }));
}

export async function getMeetingNotesByOpportunityId(opportunityId: string): Promise<MeetingNoteRow[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "meeting_notes:read")) throw new Error("Forbidden");
  const rows = await db
    .select({ id: meetingNotes.id, meetingAt: meetingNotes.meetingAt, domain: meetingNotes.domain, contactId: meetingNotes.contactId, createdAt: meetingNotes.createdAt })
    .from(meetingNotes)
    .where(and(eq(meetingNotes.tenantId, auth.tenantId), eq(meetingNotes.opportunityId, opportunityId)))
    .orderBy(desc(meetingNotes.meetingAt))
    .limit(50);
  const contactIds = [...new Set(rows.map((r) => r.contactId))];
  const contactList = contactIds.length ? await db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(eq(contacts.tenantId, auth.tenantId)) : [];
  const nameMap = Object.fromEntries(contactList.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
  return rows.map((r) => ({ id: r.id, meetingAt: r.meetingAt, domain: r.domain, contactName: nameMap[r.contactId] ?? "—", createdAt: r.createdAt }));
}

export async function createMeetingNote(form: {
  contactId: string;
  templateId?: string;
  meetingAt: string;
  domain: string;
  content: Record<string, unknown>;
  opportunityId?: string;
}) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "meeting_notes:write")) throw new Error("Forbidden");
  const [row] = await db.insert(meetingNotes).values({
    tenantId: auth.tenantId,
    contactId: form.contactId,
    opportunityId: form.opportunityId || null,
    templateId: form.templateId || null,
    meetingAt: new Date(form.meetingAt),
    domain: form.domain,
    content: form.content as Record<string, unknown>,
    createdBy: auth.userId,
  }).returning({ id: meetingNotes.id });
  return row?.id ?? null;
}

export type MeetingNoteDetail = {
  id: string;
  contactId: string;
  templateId: string | null;
  meetingAt: Date;
  domain: string;
  content: unknown;
  createdAt: Date;
};

export async function getMeetingNote(id: string): Promise<MeetingNoteDetail | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "meeting_notes:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: meetingNotes.id,
      contactId: meetingNotes.contactId,
      templateId: meetingNotes.templateId,
      meetingAt: meetingNotes.meetingAt,
      domain: meetingNotes.domain,
      content: meetingNotes.content,
      createdAt: meetingNotes.createdAt,
    })
    .from(meetingNotes)
    .where(and(eq(meetingNotes.tenantId, auth.tenantId), eq(meetingNotes.id, id)));
  return rows[0] ?? null;
}

export async function updateMeetingNote(
  id: string,
  data: { content: Record<string, unknown>; domain?: string; meetingAt?: string }
) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "meeting_notes:write")) throw new Error("Forbidden");
  await db
    .update(meetingNotes)
    .set({
      content: data.content,
      ...(data.domain != null && { domain: data.domain }),
      ...(data.meetingAt != null && { meetingAt: new Date(data.meetingAt) }),
      updatedAt: new Date(),
    })
    .where(and(eq(meetingNotes.tenantId, auth.tenantId), eq(meetingNotes.id, id)));
}

export async function deleteMeetingNote(id: string) {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "meeting_notes:write")) throw new Error("Forbidden");
  await db
    .delete(meetingNotes)
    .where(and(eq(meetingNotes.tenantId, auth.tenantId), eq(meetingNotes.id, id)));
}
