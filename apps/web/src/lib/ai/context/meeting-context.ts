"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { getEvent } from "@/app/actions/events";
import { buildClientAiContextRaw, type ClientAiContextRaw } from "./client-context";
import { renderClientAiPromptVariables } from "./client-context";

export type PreMeetingContextRaw = {
  clientContext: ClientAiContextRaw;
  event: {
    id: string;
    title: string;
    eventType: string | null;
    startAt: Date;
    endAt: Date | null;
    notes: string | null;
    location: string | null;
    contactId: string | null;
    contactName: string | null;
  } | null;
};

export type PostMeetingContextRaw = {
  clientContext: ClientAiContextRaw;
  meetingNotes: string;
  meetingId: string | null;
};

export async function buildPreMeetingContextRaw(
  clientId: string,
  _userId: string,
  eventId?: string | null
): Promise<PreMeetingContextRaw> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") {
    if (!auth.contactId || auth.contactId !== clientId) throw new Error("Forbidden");
  } else if (!hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Forbidden");
  }

  const [clientContext, eventRow] = await Promise.all([
    buildClientAiContextRaw(clientId),
    eventId ? getEvent(eventId) : Promise.resolve(null),
  ]);

  let event: PreMeetingContextRaw["event"] = null;
  if (eventRow && eventRow.contactId === clientId) {
    event = {
      id: eventRow.id,
      title: eventRow.title,
      eventType: eventRow.eventType ?? null,
      startAt: eventRow.startAt,
      endAt: eventRow.endAt ?? null,
      notes: eventRow.notes ?? null,
      location: eventRow.location ?? null,
      contactId: eventRow.contactId ?? null,
      contactName: eventRow.contactName ?? null,
    };
  }

  return { clientContext, event };
}

export async function buildPostMeetingContextRaw(
  clientId: string,
  _userId: string,
  meetingNotes: string,
  meetingId?: string | null
): Promise<PostMeetingContextRaw> {
  const auth = await requireAuthInAction();
  if (auth.roleName === "Client") {
    if (!auth.contactId || auth.contactId !== clientId) throw new Error("Forbidden");
  } else if (!hasPermission(auth.roleName, "contacts:read")) {
    throw new Error("Forbidden");
  }

  const clientContext = await buildClientAiContextRaw(clientId);
  return {
    clientContext,
    meetingNotes: meetingNotes || "Žádný text zápisu.",
    meetingId: meetingId ?? null,
  };
}

export async function renderPreMeetingPromptVariables(raw: PreMeetingContextRaw): Promise<Record<string, string>> {
  const base = await renderClientAiPromptVariables(raw.clientContext);
  const meeting_block = raw.event
    ? [
        `Schůzka: ${raw.event.title}`,
        `Datum a čas: ${new Date(raw.event.startAt).toLocaleString("cs-CZ")}`,
        raw.event.endAt ? `Konec: ${new Date(raw.event.endAt).toLocaleTimeString("cs-CZ")}` : "",
        raw.event.location ? `Místo: ${raw.event.location}` : "",
        raw.event.contactName ? `Účastník: ${raw.event.contactName}` : "",
        raw.event.notes ? `Poznámka: ${raw.event.notes}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "Žádná konkrétní schůzka nevybrána.";
  return {
    ...base,
    meeting_context: meeting_block,
  };
}

export async function renderPostMeetingPromptVariables(raw: PostMeetingContextRaw): Promise<Record<string, string>> {
  const base = await renderClientAiPromptVariables(raw.clientContext);
  return {
    ...base,
    meeting_notes: raw.meetingNotes,
  };
}
