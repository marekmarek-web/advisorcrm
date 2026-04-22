"use server";

import { withAuthContext } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import { noteTemplates, meetingNotes, contacts, opportunities } from "db";
import { eq, and, desc } from "db";
import type { TenantContextDb } from "@/lib/db/with-tenant-context";
import { createOpportunity } from "./pipeline";

export type TemplateRow = { id: string; name: string; domain: string };

async function ensureContactBelongsToTenant(
  tx: TenantContextDb,
  tenantId: string,
  contactId: string
): Promise<void> {
  const [row] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)))
    .limit(1);
  if (!row) throw new Error("Vybraný kontakt neexistuje.");
}

/** Náhled textu pro seznam (tělo obchodu nebo formát nástěnky title/obsah). */
function meetingNoteContentPreview(content: unknown): string | null {
  if (!content || typeof content !== "object" || content === null) return null;
  const c = content as Record<string, unknown>;
  const body = typeof c.body === "string" ? c.body.trim() : "";
  if (body) return body.length > 160 ? `${body.slice(0, 160)}…` : body;
  const title = typeof c.title === "string" ? c.title.trim() : "";
  const obsah = typeof c.obsah === "string" ? c.obsah.trim() : "";
  const parts = [title, obsah].filter(Boolean);
  if (parts.length === 0) return null;
  const combined = parts.join(" — ");
  return combined.length > 160 ? `${combined.slice(0, 160)}…` : combined;
}

export type MeetingNoteRow = {
  id: string;
  meetingAt: Date;
  domain: string;
  contactName: string;
  createdAt: Date;
};

export async function getNoteTemplates(): Promise<TemplateRow[]> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "meeting_notes:read")) throw new Error("Forbidden");
    const rows = await tx
      .select({ id: noteTemplates.id, name: noteTemplates.name, domain: noteTemplates.domain })
      .from(noteTemplates)
      .where(eq(noteTemplates.tenantId, auth.tenantId));
    return rows;
  });
}

export async function getMeetingNotesList(contactId?: string): Promise<MeetingNoteRow[]> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "meeting_notes:read")) throw new Error("Forbidden");
    const cond = contactId
      ? and(eq(meetingNotes.tenantId, auth.tenantId), eq(meetingNotes.contactId, contactId))
      : eq(meetingNotes.tenantId, auth.tenantId);
    const rows = await tx
      .select({
        id: meetingNotes.id,
        meetingAt: meetingNotes.meetingAt,
        domain: meetingNotes.domain,
        contactId: meetingNotes.contactId,
        createdAt: meetingNotes.createdAt,
      })
      .from(meetingNotes)
      .where(cond)
      .orderBy(desc(meetingNotes.meetingAt))
      .limit(50);
    const contactIds = [...new Set(rows.map((r) => r.contactId).filter(Boolean))] as string[];
    const contactList = contactIds.length
      ? await tx
          .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
          .from(contacts)
          .where(eq(contacts.tenantId, auth.tenantId))
      : [];
    const nameMap = Object.fromEntries(contactList.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
    return rows.map((r) => ({
      id: r.id,
      meetingAt: r.meetingAt,
      domain: r.domain,
      contactName: r.contactId ? (nameMap[r.contactId] ?? "—") : "Obecný zápisek",
      createdAt: r.createdAt,
    }));
  });
}

function previewTextFromMeetingNoteContent(content: unknown): string | null {
  if (content == null || typeof content !== "object") return null;
  const o = content as Record<string, unknown>;
  const raw =
    typeof o.obsah === "string"
      ? o.obsah
      : typeof o.body === "string"
        ? o.body
        : typeof o.summary === "string"
          ? o.summary
          : "";
  const t = raw.trim();
  if (!t) return null;
  return t.length > 220 ? `${t.slice(0, 220)}…` : t;
}

export type MeetingNoteFeedItem = {
  id: string;
  meetingAt: Date;
  domain: string;
  preview: string | null;
};

/** Zápisky kontaktu s náhledem textu — feed v detailu nástěnky. */
export async function getMeetingNotesFeedForContact(contactId: string): Promise<MeetingNoteFeedItem[]> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "meeting_notes:read")) throw new Error("Forbidden");
    const rows = await tx
      .select({
        id: meetingNotes.id,
        meetingAt: meetingNotes.meetingAt,
        domain: meetingNotes.domain,
        content: meetingNotes.content,
      })
      .from(meetingNotes)
      .where(and(eq(meetingNotes.tenantId, auth.tenantId), eq(meetingNotes.contactId, contactId)))
      .orderBy(desc(meetingNotes.meetingAt))
      .limit(40);
    return rows.map((r) => ({
      id: r.id,
      meetingAt: r.meetingAt,
      domain: r.domain,
      preview: previewTextFromMeetingNoteContent(r.content),
    }));
  });
}

/** Pro Vision Board: zápisky včetně content pro náhled karet */
export type MeetingNoteForBoard = MeetingNoteRow & {
  contactId?: string;
  /** Když je zápisek navázaný na obchod, zůstane i na nástěnce + odkaz na detail. */
  opportunityId?: string | null;
  content: Record<string, unknown> | null;
};

export async function getMeetingNotesForBoard(): Promise<MeetingNoteForBoard[]> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "meeting_notes:read")) throw new Error("Forbidden");
    const rows = await tx
      .select({
        id: meetingNotes.id,
        meetingAt: meetingNotes.meetingAt,
        domain: meetingNotes.domain,
        contactId: meetingNotes.contactId,
        opportunityId: meetingNotes.opportunityId,
        content: meetingNotes.content,
        createdAt: meetingNotes.createdAt,
      })
      .from(meetingNotes)
      .where(eq(meetingNotes.tenantId, auth.tenantId))
      .orderBy(desc(meetingNotes.meetingAt))
      .limit(100);
    const contactIds = [...new Set(rows.map((r) => r.contactId).filter(Boolean))] as string[];
    const contactList = contactIds.length
      ? await tx
          .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
          .from(contacts)
          .where(eq(contacts.tenantId, auth.tenantId))
      : [];
    const nameMap = Object.fromEntries(contactList.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
    return rows.map((r) => ({
      id: r.id,
      meetingAt: r.meetingAt,
      domain: r.domain,
      contactId: r.contactId ?? undefined,
      opportunityId: r.opportunityId ?? null,
      contactName: r.contactId ? (nameMap[r.contactId] ?? "—") : "Obecný zápisek",
      createdAt: r.createdAt,
      content: r.content as Record<string, unknown> | null,
    }));
  });
}

export type MeetingNoteRowWithContent = MeetingNoteRow & {
  contentPreview: string | null;
};

export async function getMeetingNotesByOpportunityId(
  opportunityId: string,
): Promise<MeetingNoteRowWithContent[]> {
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "meeting_notes:read")) throw new Error("Forbidden");
    const rows = await tx
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
    const contactList = contactIds.length
      ? await tx
          .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
          .from(contacts)
          .where(eq(contacts.tenantId, auth.tenantId))
      : [];
    const nameMap = Object.fromEntries(contactList.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
    return rows.map((r) => {
      const preview = meetingNoteContentPreview(r.content);
      return {
        id: r.id,
        meetingAt: r.meetingAt,
        domain: r.domain,
        contactName: r.contactId ? (nameMap[r.contactId] ?? "—") : "Obecný zápisek",
        createdAt: r.createdAt,
        contentPreview: preview,
      };
    });
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
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "meeting_notes:write")) throw new Error("Forbidden");
    const [row] = await tx
      .insert(meetingNotes)
      .values({
        tenantId: auth.tenantId,
        contactId: form.contactId ?? null,
        opportunityId: form.opportunityId || null,
        templateId: form.templateId || null,
        meetingAt: new Date(form.meetingAt),
        domain: form.domain,
        content: form.content as Record<string, unknown>,
        createdBy: auth.userId,
      })
      .returning({ id: meetingNotes.id });
    return row?.id ?? null;
  });
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
  return withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "meeting_notes:read")) throw new Error("Forbidden");
    const rows = await tx
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
  });
}

export async function updateMeetingNote(
  id: string,
  data: {
    content: Record<string, unknown>;
    domain?: string;
    meetingAt?: string;
    contactId?: string | null;
  },
) {
  await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "meeting_notes:write")) throw new Error("Forbidden");

    let contactPatch: { contactId: string | null } | Record<string, never> = {};
    if (data.contactId !== undefined) {
      if (data.contactId === null || data.contactId === "") {
        contactPatch = { contactId: null };
      } else {
        await ensureContactBelongsToTenant(tx, auth.tenantId, data.contactId);
        contactPatch = { contactId: data.contactId };
      }
    }

    await tx
      .update(meetingNotes)
      .set({
        content: data.content,
        ...contactPatch,
        ...(data.domain != null && { domain: data.domain }),
        ...(data.meetingAt != null && { meetingAt: new Date(data.meetingAt) }),
        updatedAt: new Date(),
      })
      .where(and(eq(meetingNotes.tenantId, auth.tenantId), eq(meetingNotes.id, id)));
  });
}

function caseTypeFromMeetingNoteDomain(domain: string): string {
  switch (domain) {
    case "hypo":
      return "hypotéka";
    case "investice":
      return "investice";
    case "pojisteni":
      return "pojištění";
    case "uvery":
      return "úvěr";
    case "dps":
      return "jiné";
    case "komplex":
      return "jiné";
    default:
      return "jiné";
  }
}

function meetingNoteTitleFromContent(content: unknown): string {
  if (!content || typeof content !== "object" || content === null) return "";
  const c = content as Record<string, unknown>;
  if (typeof c.title === "string" && c.title.trim()) return c.title.trim();
  const obsah = c.obsah;
  if (typeof obsah === "string" && obsah.trim()) return obsah.split("\n")[0].slice(0, 200).trim();
  return "";
}

/**
 * Vytvoří nový obchod ve zvolené fázi a přiřadí k němu zápisek (stejně jako attachMeetingNoteToOpportunity).
 */
export async function createOpportunityFromMeetingNote(
  noteId: string,
  stageId: string,
  titleOverride?: string | null
): Promise<string | null> {
  const note = await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "meeting_notes:write")) throw new Error("Forbidden");
    if (!hasPermission(auth.roleName, "opportunities:write")) throw new Error("Forbidden");

    const [note] = await tx
      .select({
        id: meetingNotes.id,
        domain: meetingNotes.domain,
        content: meetingNotes.content,
        contactId: meetingNotes.contactId,
        opportunityId: meetingNotes.opportunityId,
      })
      .from(meetingNotes)
      .where(and(eq(meetingNotes.tenantId, auth.tenantId), eq(meetingNotes.id, noteId)))
      .limit(1);
    if (!note) throw new Error("Zápisek nebyl nalezen.");
    if (note.opportunityId) throw new Error("Zápisek je už přiřazen k obchodu.");
    return note;
  });

  const rawTitle = (titleOverride?.trim() || meetingNoteTitleFromContent(note.content) || "Obchod ze zápisku").trim();
  const title = rawTitle.slice(0, 500);
  const caseType = caseTypeFromMeetingNoteDomain(note.domain ?? "");

  const newId = await createOpportunity({
    title,
    caseType,
    contactId: note.contactId ?? undefined,
    stageId,
  });
  if (!newId) throw new Error("Obchod se nepodařilo vytvořit.");

  await attachMeetingNoteToOpportunity(noteId, newId);
  return newId;
}

/** Přiřadí zápisek k existujícímu obchodu; contact_id převezme z obchodu. */
export async function attachMeetingNoteToOpportunity(noteId: string, opportunityId: string) {
  await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "meeting_notes:write")) throw new Error("Forbidden");
    if (!hasPermission(auth.roleName, "opportunities:read")) throw new Error("Forbidden");

    const [opp] = await tx
      .select({
        id: opportunities.id,
        contactId: opportunities.contactId,
        tenantId: opportunities.tenantId,
      })
      .from(opportunities)
      .where(and(eq(opportunities.tenantId, auth.tenantId), eq(opportunities.id, opportunityId)))
      .limit(1);
    if (!opp) throw new Error("Obchod nebyl nalezen.");

    const [note] = await tx
      .select({ id: meetingNotes.id })
      .from(meetingNotes)
      .where(and(eq(meetingNotes.tenantId, auth.tenantId), eq(meetingNotes.id, noteId)))
      .limit(1);
    if (!note) throw new Error("Zápisek nebyl nalezen.");

    await tx
      .update(meetingNotes)
      .set({
        opportunityId,
        contactId: opp.contactId,
        updatedAt: new Date(),
      })
      .where(and(eq(meetingNotes.tenantId, auth.tenantId), eq(meetingNotes.id, noteId)));
  });
}

export async function deleteMeetingNote(id: string) {
  await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "meeting_notes:write")) throw new Error("Forbidden");
    await tx
      .delete(meetingNotes)
      .where(and(eq(meetingNotes.tenantId, auth.tenantId), eq(meetingNotes.id, id)));
  });
}

export async function summarizeMeetingNotes(): Promise<string> {
  const { rows, nameMap } = await withAuthContext(async (auth, tx) => {
    if (!hasPermission(auth.roleName, "meeting_notes:read")) throw new Error("Forbidden");
    const rows = await tx
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

    const contactIds = [...new Set(rows.map((r) => r.contactId).filter(Boolean))] as string[];
    const contactList = contactIds.length
      ? await tx
          .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
          .from(contacts)
          .where(eq(contacts.tenantId, auth.tenantId))
      : [];
    const nameMap = Object.fromEntries(contactList.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));
    return { rows, nameMap };
  });

  if (rows.length === 0) return "Žádné zápisky k sumarizaci.";

  const domainLabels: Record<string, string> = {
    hypo: "Hypotéka",
    investice: "Investice",
    pojisteni: "Pojištění",
    dps: "Penzijní spoření",
    uvery: "Úvěry",
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
