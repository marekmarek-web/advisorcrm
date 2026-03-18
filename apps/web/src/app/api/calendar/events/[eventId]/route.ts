import { NextResponse } from "next/server";
import { getCalendarAuth, calendarTokenErrorResponse } from "../../auth";
import { getValidAccessToken } from "@/lib/integrations/google-calendar-integration-service";
import { getCalendarEvent, updateCalendarEvent, deleteCalendarEvent, type GoogleCalendarEvent } from "@/lib/integrations/google-calendar";

export const dynamic = "force-dynamic";

const MAX_EVENT_ID_LENGTH = 256;

function validateEventId(eventId: string): { ok: true } | { ok: false; error: string; status: number } {
  const trimmed = eventId.trim();
  if (!trimmed) return { ok: false, error: "Chybí ID události", status: 400 };
  if (trimmed.length > MAX_EVENT_ID_LENGTH) return { ok: false, error: "Neplatné ID události", status: 400 };
  if (trimmed.includes("..") || trimmed.includes("\\") || /[\r\n]/.test(trimmed)) {
    return { ok: false, error: "Neplatné ID události", status: 400 };
  }
  return { ok: true };
}

export type UpdateCalendarEventBody = {
  title?: string;
  start?: string;
  end?: string;
  description?: string;
  location?: string;
};

function validateUpdateBody(body: unknown): { ok: true; data: UpdateCalendarEventBody } | { ok: false; error: string; status: number } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body is required", status: 400 };
  }
  const b = body as Record<string, unknown>;
  const title = b.title;
  if (title !== undefined && title !== null) {
    if (typeof title !== "string") return { ok: false, error: "Název musí být text", status: 400 };
    if (!title.trim()) return { ok: false, error: "Název nemůže být prázdný", status: 400 };
    if (title.length > 500) return { ok: false, error: "Název může mít maximálně 500 znaků", status: 400 };
  }
  const start = b.start;
  const end = b.end;
  if (start !== undefined && start !== null) {
    if (typeof start !== "string" || !start.trim()) return { ok: false, error: "Neplatné datum začátku", status: 400 };
    if (Number.isNaN(new Date(start).getTime())) return { ok: false, error: "Neplatné datum začátku", status: 400 };
  }
  if (end !== undefined && end !== null) {
    if (typeof end !== "string" || !end.trim()) return { ok: false, error: "Neplatné datum konce", status: 400 };
    if (Number.isNaN(new Date(end).getTime())) return { ok: false, error: "Neplatné datum konce", status: 400 };
  }
  if (start !== undefined && start !== null && end !== undefined && end !== null) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (endDate.getTime() <= startDate.getTime()) {
      return { ok: false, error: "Čas konce musí být po čase začátku", status: 400 };
    }
  }
  const description = b.description;
  const location = b.location;
  if (description !== undefined && description !== null && typeof description !== "string") {
    return { ok: false, error: "Poznámka musí být text", status: 400 };
  }
  if (location !== undefined && location !== null && typeof location !== "string") {
    return { ok: false, error: "Místo musí být text", status: 400 };
  }
  const data: UpdateCalendarEventBody = {};
  if (typeof title === "string") data.title = title.trim();
  if (typeof start === "string" && start.trim()) data.start = start.trim();
  if (typeof end === "string" && end.trim()) data.end = end.trim();
  if (typeof description === "string") data.description = description.trim() || undefined;
  if (typeof location === "string") data.location = location.trim() || undefined;
  return { ok: true, data };
}

function isNotFoundError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("404") || /not found/i.test(msg);
}

async function getAuthAndToken(request: Request) {
  const authResult = await getCalendarAuth(request);
  if (!authResult.ok) return { ok: false as const, response: authResult.response };
  const { userId, tenantId } = authResult.auth;
  let accessToken: string;
  let calendarId: string;
  try {
    const valid = await getValidAccessToken(userId, tenantId);
    accessToken = valid.accessToken;
    calendarId = valid.calendarId;
  } catch (e) {
    const tokenErr = calendarTokenErrorResponse(e);
    if (tokenErr) return { ok: false as const, response: tokenErr };
    return { ok: false as const, response: NextResponse.json({ error: "Nepodařilo se získat přístup ke kalendáři" }, { status: 502 }) };
  }
  return { ok: true as const, accessToken, calendarId };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const idValidation = validateEventId(eventId ?? "");
  if (!idValidation.ok) {
    return NextResponse.json({ error: idValidation.error }, { status: idValidation.status });
  }
  const auth = await getAuthAndToken(_request);
  if (!auth.ok) return auth.response;
  const { accessToken, calendarId } = auth;

  try {
    const ev = await getCalendarEvent(accessToken, calendarId, eventId);
    if (ev.status === "cancelled") {
      return NextResponse.json({ error: "Událost byla zrušena" }, { status: 404 });
    }
    const startIso = ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T00:00:00.000Z` : null);
    const endIso = ev.end?.dateTime ?? (ev.end?.date ? `${ev.end.date}T23:59:59.999Z` : null);
    return NextResponse.json({
      id: ev.id,
      title: ev.summary?.trim() ?? "",
      start: startIso,
      end: endIso,
      description: ev.description?.trim() ?? "",
      location: ev.location?.trim() ?? "",
      allDay: !!ev.start?.date && !ev.start?.dateTime,
    });
  } catch (e) {
    if (isNotFoundError(e)) {
      return NextResponse.json({ error: "Událost nebyla nalezena" }, { status: 404 });
    }
    const msg = e instanceof Error ? e.message : "Google API error";
    return NextResponse.json({ error: "Načtení události selhalo", detail: msg }, { status: 502 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const idValidation = validateEventId(eventId ?? "");
  if (!idValidation.ok) {
    return NextResponse.json({ error: idValidation.error }, { status: idValidation.status });
  }
  const auth = await getAuthAndToken(request);
  if (!auth.ok) return auth.response;
  const { accessToken, calendarId } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const validation = validateUpdateBody(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }
  const data = validation.data;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Žádná pole k aktualizaci" }, { status: 400 });
  }

  const patch: Partial<GoogleCalendarEvent> = {};
  if (data.title !== undefined) patch.summary = data.title;
  if (data.start !== undefined) patch.start = { dateTime: data.start };
  if (data.end !== undefined) patch.end = { dateTime: data.end };
  if (data.description !== undefined) patch.description = data.description;
  if (data.location !== undefined) patch.location = data.location;

  try {
    const updated = await updateCalendarEvent(accessToken, calendarId, eventId, patch);
    return NextResponse.json({
      id: updated.id,
      title: updated.summary,
      start: updated.start?.dateTime ?? data.start ?? null,
      end: updated.end?.dateTime ?? data.end ?? null,
      location: updated.location ?? null,
    });
  } catch (e) {
    if (isNotFoundError(e)) {
      return NextResponse.json({ error: "Událost nebyla nalezena" }, { status: 404 });
    }
    const msg = e instanceof Error ? e.message : "Google API error";
    return NextResponse.json({ error: "Aktualizace události selhala", detail: msg }, { status: 502 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const idValidation = validateEventId(eventId ?? "");
  if (!idValidation.ok) {
    return NextResponse.json({ error: idValidation.error }, { status: idValidation.status });
  }
  const auth = await getAuthAndToken(_request);
  if (!auth.ok) return auth.response;
  const { accessToken, calendarId } = auth;

  try {
    await deleteCalendarEvent(accessToken, calendarId, eventId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (isNotFoundError(e)) {
      return NextResponse.json({ error: "Událost nebyla nalezena" }, { status: 404 });
    }
    const msg = e instanceof Error ? e.message : "Google API error";
    return NextResponse.json({ error: "Smazání události selhalo", detail: msg }, { status: 502 });
  }
}
