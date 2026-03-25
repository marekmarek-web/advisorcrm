"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { getMeetingNote } from "@/app/actions/meeting-notes";
import { getEvent } from "@/app/actions/events";
import { getHouseholdForContact } from "@/app/actions/households";
import { getContact } from "@/app/actions/contacts";
import { createResponseSafe } from "@/lib/openai";
import type { PostMeetingSummary } from "@/lib/meeting-briefing/types";

const MEETING_SUMMARY_PROMPT = `Jsi asistent pro finanční poradce. Z následujících poznámek ze schůzky s klientem vytvoř strukturovaný výstup. Odpověz POUZE platným JSON bez markdown, bez \`\`\`json.
Formát:
{
  "summaryShort": "2-4 věty shrnutí schůzky v češtině",
  "keyPoints": ["bod 1", "bod 2", "max 5 bodů"],
  "agreedItems": ["co bylo domluveno", "max 5 bodů"],
  "suggestedTasks": [{"title": "název úkolu", "dueDate": "YYYY-MM-DD nebo prázdné"}],
  "suggestedNextMeeting": "jedna věta návrhu další schůzky nebo null",
  "suggestedOpportunity": "název obchodu/příležitosti nebo null",
  "suggestedServiceReview": true nebo false,
  "suggestedAnalysisUpdate": true nebo false
}
Poznámky ze schůzky:
`;

function extractTextFromMeetingContent(content: unknown): string {
  if (content == null) return "";
  const o = content as Record<string, unknown>;
  if (typeof o.summary === "string") return o.summary;
  if (typeof o.title === "string") return o.title;
  return JSON.stringify(o).slice(0, 2000);
}

type AiMeetingOutput = {
  summaryShort?: string;
  keyPoints?: string[];
  agreedItems?: string[];
  suggestedTasks?: Array<{ title?: string; dueDate?: string }>;
  suggestedNextMeeting?: string | null;
  suggestedOpportunity?: string | null;
  suggestedServiceReview?: boolean;
  suggestedAnalysisUpdate?: boolean;
};

function parseAiOutput(text: string): AiMeetingOutput | null {
  const trimmed = text.trim().replace(/^```json?\s*|\s*```$/g, "");
  try {
    const parsed = JSON.parse(trimmed) as AiMeetingOutput;
    return parsed;
  } catch {
    return null;
  }
}

export async function getPostMeetingSummary(
  contactId: string,
  options?: { meetingNoteId?: string; eventId?: string; rawNotes?: string }
): Promise<PostMeetingSummary | null> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client" && auth.contactId !== contactId) {
    throw new Error("Forbidden");
  }
  if (auth.roleName !== "Client" && !hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Forbidden");
  }

  let sourceNotes = options?.rawNotes?.trim() ?? "";
  let meetingId: string | null = null;
  let meetingNoteId: string | null = null;

  if (options?.meetingNoteId) {
    const note = await getMeetingNote(options.meetingNoteId);
    if (note && note.contactId === contactId) {
      meetingNoteId = note.id;
      sourceNotes = sourceNotes || extractTextFromMeetingContent(note.content);
      if (note.meetingAt) {
        sourceNotes = `[${note.domain || "schůzka"}, ${new Date(note.meetingAt).toLocaleDateString("cs-CZ")}]\n${sourceNotes}`;
      }
    }
  }

  if (options?.eventId) {
    const event = await getEvent(options.eventId);
    if (event && event.tenantId === auth.tenantId && (event.contactId === contactId || !event.contactId)) {
      meetingId = event.id;
      if (event.notes?.trim()) {
        sourceNotes = sourceNotes ? `${sourceNotes}\n\nPoznámky k události:\n${event.notes.trim()}` : event.notes.trim();
      }
    }
  }

  const household = await getHouseholdForContact(contactId);
  const now = new Date().toISOString();

  if (!sourceNotes) {
    return {
      meetingId,
      meetingNoteId,
      contactId,
      householdId: household?.id ?? null,
      summaryShort: "",
      keyPoints: [],
      agreedItems: [],
      followUps: [],
      suggestedTasks: [],
      suggestedNextMeeting: null,
      suggestedOpportunity: null,
      suggestedServiceReview: false,
      suggestedAnalysisUpdate: false,
      emailDraft: { subject: "", body: "" },
      sourceNotes: null,
      confidence: "low",
      createdAt: now,
      updatedAt: now,
    };
  }

  const prompt = MEETING_SUMMARY_PROMPT + sourceNotes.slice(0, 3000);
  const result = await createResponseSafe(prompt);

  let ai: AiMeetingOutput | null = null;
  if (result.ok && result.text) {
    ai = parseAiOutput(result.text);
  }

  const suggestedTasks = (ai?.suggestedTasks ?? []).filter((t) => t?.title?.trim()).map((t) => ({
    title: String(t.title).trim(),
    dueDate: t.dueDate?.trim() || undefined,
  }));

  const followUps: PostMeetingSummary["followUps"] = suggestedTasks.map((t) => ({
    title: t.title,
    dueDate: t.dueDate,
    kind: "task" as const,
  }));
  if (ai?.suggestedNextMeeting?.trim()) {
    followUps.push({ title: ai.suggestedNextMeeting.trim(), kind: "event" as const });
  }

  const summaryShort = ai?.summaryShort?.trim()?.slice(0, 1000) ?? "";
  const keyPoints = Array.isArray(ai?.keyPoints) ? ai.keyPoints.filter((s) => typeof s === "string").slice(0, 10) : [];
  const agreedItems = Array.isArray(ai?.agreedItems) ? ai.agreedItems.filter((s) => typeof s === "string").slice(0, 10) : [];

  let emailDraft: { subject: string; body: string } = { subject: "", body: "" };
  const contact = await getContact(contactId);
  const clientName = contact ? `${contact.firstName} ${contact.lastName}`.trim() : "Klient";
  if (summaryShort || keyPoints.length > 0 || agreedItems.length > 0) {
    const contextParts = [summaryShort, keyPoints.length ? `Klíčové body: ${keyPoints.join(", ")}` : "", agreedItems.length ? `Domluveno: ${agreedItems.join(", ")}` : ""].filter(Boolean);
    const emailPrompt = `Napiš krátký profesionální e-mail klientovi ${clientName} po schůzce. Kontext: ${contextParts.join(". ")}. E-mail: poděkování, krátké shrnutí, další krok, návrh dalšího kontaktu. 2–4 odstavce. Bez oslovení na konci, jen tělo. Česky.`;
    const emailResult = await createResponseSafe(emailPrompt);
    if (emailResult.ok && emailResult.text.trim()) {
      emailDraft = {
        subject: `Shrnutí schůzky – ${clientName}`,
        body: emailResult.text.trim().slice(0, 1500),
      };
    }
  }

  const summary: PostMeetingSummary = {
    meetingId,
    meetingNoteId,
    contactId,
    householdId: household?.id ?? null,
    summaryShort,
    keyPoints,
    agreedItems,
    followUps,
    suggestedTasks,
    suggestedNextMeeting: ai?.suggestedNextMeeting?.trim() ?? null,
    suggestedOpportunity: ai?.suggestedOpportunity?.trim() ?? null,
    suggestedServiceReview: Boolean(ai?.suggestedServiceReview),
    suggestedAnalysisUpdate: Boolean(ai?.suggestedAnalysisUpdate),
    emailDraft,
    sourceNotes: sourceNotes.slice(0, 500),
    confidence: ai ? "medium" : "low",
    createdAt: now,
    updatedAt: now,
  };

  return summary;
}
