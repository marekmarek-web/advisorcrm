"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
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
  const contactIds = [...new Set(rows.map((r) => r.contactId).filter(Boolean))] as string[];
  const contactList = contactIds.length ? await db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(eq(contacts.tenantId, auth.tenantId)) : [];
  const nameMap = Object.fromEntries(contactList.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
  return rows.map((r) => ({ id: r.id, meetingAt: r.meetingAt, domain: r.domain, contactName: r.contactId ? (nameMap[r.contactId] ?? "—") : "Obecný zápisek", createdAt: r.createdAt }));
}

/** Pro Vision Board: zápisky včetně content pro náhled karet */
export type MeetingNoteForBoard = MeetingNoteRow & {
  contactId?: string;
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
  const contactIds = [...new Set(rows.map((r) => r.contactId).filter(Boolean))] as string[];
  const contactList = contactIds.length ? await db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(eq(contacts.tenantId, auth.tenantId)) : [];
  const nameMap = Object.fromEntries(contactList.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
  return rows.map((r) => ({
    id: r.id,
    meetingAt: r.meetingAt,
    domain: r.domain,
    contactId: r.contactId ?? undefined,
    contactName: r.contactId ? (nameMap[r.contactId] ?? "—") : "Obecný zápisek",
    createdAt: r.createdAt,
    content: r.content as Record<string, unknown> | null,
  }));
}

export type MeetingNoteRowWithContent = MeetingNoteRow & {
  contentPreview: string | null;
};

export async function getMeetingNotesByOpportunityId(
  opportunityId: string,
): Promise<MeetingNoteRowWithContent[]> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "meeting_notes:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: meetingNotes.id,
      meetingAt: meetingNotes.meetingAt,
      domain: meetingNotes.domain,
      contactId: meetingNotes.contactId,
      createdAt: meetingNotes.createdAt,
      content: meetingNotes.content,
    })
    .from(meetingNotes)
    .where(and(eq(meetingNotes.tenantId, auth.tenantId), eq(meetingNotes.opportunityId, opportunityId)))
    .orderBy(desc(meetingNotes.meetingAt))
    .limit(50);
  const contactIds = [...new Set(rows.map((r) => r.contactId).filter(Boolean))] as string[];
  const contactList = contactIds.length ? await db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(eq(contacts.tenantId, auth.tenantId)) : [];
  const nameMap = Object.fromEntries(contactList.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
  return rows.map((r) => {
    const body =
      r.content && typeof r.content === "object" && r.content !== null && "body" in r.content
        ? String((r.content as { body?: unknown }).body ?? "")
        : "";
    const preview = body.trim() ? (body.length > 160 ? `${body.slice(0, 160)}…` : body) : null;
    return {
      id: r.id,
      meetingAt: r.meetingAt,
      domain: r.domain,
      contactName: r.contactId ? (nameMap[r.contactId] ?? "—") : "Obecný zápisek",
      createdAt: r.createdAt,
      contentPreview: preview,
    };
  });
}

export async function createMeetingNote(form: {
  contactId?: string | null;
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
    contactId: form.contactId ?? null,
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
  contactId: string | null;
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

export async function summarizeMeetingNotes(): Promise<string> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "meeting_notes:read")) throw new Error("Forbidden");
  const rows = await db
    .select({
      id: meetingNotes.id,
      meetingAt: meetingNotes.meetingAt,
      domain: meetingNotes.domain,
      content: meetingNotes.content,
      contactId: meetingNotes.contactId,
    })
    .from(meetingNotes)
    .where(eq(meetingNotes.tenantId, auth.tenantId))
    .orderBy(desc(meetingNotes.meetingAt))
    .limit(20);

  if (rows.length === 0) return "Žádné zápisky k sumarizaci.";

  const contactIds = [...new Set(rows.map((r) => r.contactId).filter(Boolean))] as string[];
  const contactList = contactIds.length
    ? await db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(eq(contacts.tenantId, auth.tenantId))
    : [];
  const nameMap = Object.fromEntries(contactList.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));

  const domainLabels: Record<string, string> = {
    hypo: "Hypotéka",
    investice: "Investice",
    pojisteni: "Pojištění",
    komplex: "Komplexní plán",
  };

  const byDomain: Record<string, string[]> = {};
  for (const r of rows) {
    const domain = domainLabels[r.domain] ?? r.domain ?? "Ostatní";
    const c = r.content as Record<string, unknown> | null;
    const title = (c && typeof c.title === "string" && c.title.trim()) ? c.title : "Zápisek";
    const contact = r.contactId ? (nameMap[r.contactId] ?? "—") : "Obecný";
    const date = r.meetingAt ? new Date(r.meetingAt).toLocaleDateString("cs-CZ") : "";
    if (!byDomain[domain]) byDomain[domain] = [];
    byDomain[domain].push(`• ${title} (${contact}, ${date})`);
  }

  let summary = `Shrnutí ${rows.length} zápisků:\n\n`;
  for (const [domain, items] of Object.entries(byDomain)) {
    summary += `${domain} (${items.length}):\n${items.join("\n")}\n\n`;
  }
  return summary.trim();
}
