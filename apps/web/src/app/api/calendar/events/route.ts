import { NextResponse } from "next/server";
import { db, events, contacts, opportunities } from "db";
import { eq, and, inArray } from "db";
import { getCalendarAuth, calendarTokenErrorResponse } from "../auth";
import { getValidAccessToken } from "@/lib/integrations/google-calendar-integration-service";
import { listCalendarEvents, createCalendarEvent, type GoogleCalendarEvent } from "@/lib/integrations/google-calendar";

export const dynamic = "force-dynamic";

/** Výchozí rozsah: od teď + 7 dní, max 30 událostí. */
const DEFAULT_DAYS_AHEAD = 7;
const DEFAULT_MAX_RESULTS = 30;

export type CalendarEventItem = {
  id: string;
  title: string;
  start: string;
  end: string;
  location: string | null;
  allDay: boolean;
  contactId?: string | null;
  opportunityId?: string | null;
  contactName?: string | null;
};

function normalizeGoogleEvent(ev: GoogleCalendarEvent): CalendarEventItem | null {
  const id = ev.id;
  if (!id || ev.status === "cancelled") return null;
  const title = ev.summary?.trim() || "(Bez názvu)";
  const start = ev.start;
  const end = ev.end;
  let startIso: string;
  let endIso: string;
  let allDay: boolean;
  if (start?.dateTime) {
    startIso = start.dateTime;
    endIso = end?.dateTime ?? startIso;
    allDay = false;
  } else if (start?.date) {
    startIso = `${start.date}T00:00:00.000Z`;
    endIso = end?.date ? `${end.date}T23:59:59.999Z` : `${start.date}T23:59:59.999Z`;
    allDay = true;
  } else {
    return null;
  }
  return {
    id,
    title,
    start: startIso,
    end: endIso,
    location: ev.location?.trim() || null,
    allDay,
  };
}

export async function GET(request: Request) {
  const authResult = await getCalendarAuth(request);
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;

  const url = new URL(request.url);
  const timeMinParam = url.searchParams.get("timeMin");
  const timeMaxParam = url.searchParams.get("timeMax");
  const maxResultsParam = url.searchParams.get("maxResults");

  const now = new Date();
  const timeMin = timeMinParam ? new Date(timeMinParam) : now;
  const timeMax = timeMaxParam
    ? new Date(timeMaxParam)
    : new Date(now.getTime() + DEFAULT_DAYS_AHEAD * 24 * 60 * 60 * 1000);
  if (Number.isNaN(timeMin.getTime())) {
    return NextResponse.json({ error: "Neplatné timeMin (očekává se ISO 8601)" }, { status: 400 });
  }
  if (Number.isNaN(timeMax.getTime())) {
    return NextResponse.json({ error: "Neplatné timeMax (očekává se ISO 8601)" }, { status: 400 });
  }
  if (timeMax.getTime() <= timeMin.getTime()) {
    return NextResponse.json({ error: "timeMax musí být po timeMin" }, { status: 400 });
  }
  const maxResults = maxResultsParam ? Math.min(100, Math.max(1, parseInt(maxResultsParam, 10))) : DEFAULT_MAX_RESULTS;
  if (Number.isNaN(maxResults)) {
    return NextResponse.json({ error: "Invalid maxResults" }, { status: 400 });
  }

  let accessToken: string;
  let calendarId: string;
  try {
    const valid = await getValidAccessToken(userId, tenantId);
    accessToken = valid.accessToken;
    calendarId = valid.calendarId;
  } catch (e) {
    const tokenErr = calendarTokenErrorResponse(e);
    if (tokenErr) return tokenErr;
    return NextResponse.json({ error: "Nepodařilo se získat přístup ke kalendáři" }, { status: 502 });
  }

  try {
    const response = await listCalendarEvents(accessToken, calendarId, {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults,
    });
    const items = (response.items ?? [])
      .map(normalizeGoogleEvent)
      .filter((e): e is CalendarEventItem => e !== null)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    if (items.length > 0) {
      const ids = items.map((e) => e.id);
      const links = await db
        .select({
          googleEventId: events.googleEventId,
          contactId: events.contactId,
          opportunityId: events.opportunityId,
          contactFirstName: contacts.firstName,
          contactLastName: contacts.lastName,
        })
        .from(events)
        .leftJoin(contacts, eq(events.contactId, contacts.id))
        .where(
          and(
            eq(events.tenantId, tenantId),
            inArray(events.googleEventId, ids)
          )
        );
      const byGoogleId = new Map(
        links
          .filter((r) => r.googleEventId)
          .map((r) => [
            r.googleEventId,
            {
              contactId: r.contactId ?? null,
              opportunityId: r.opportunityId ?? null,
              contactName:
                r.contactFirstName && r.contactLastName
                  ? `${r.contactFirstName} ${r.contactLastName}`.trim()
                  : null,
            },
          ])
      );
      items.forEach((item) => {
        const link = byGoogleId.get(item.id);
        if (link) {
          item.contactId = link.contactId;
          item.opportunityId = link.opportunityId;
          item.contactName = link.contactName;
        }
      });
    }
    return NextResponse.json({ events: items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Google API error";
    return NextResponse.json({ error: "Calendar API failed", detail: msg }, { status: 502 });
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateCalendarEventBody = {
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  contactId?: string;
  opportunityId?: string;
};

function validateCreateBody(body: unknown): { ok: true; data: CreateCalendarEventBody } | { ok: false; error: string; status: number } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Request body is required", status: 400 };
  }
  const b = body as Record<string, unknown>;
  const title = b.title;
  if (typeof title !== "string" || !title.trim()) {
    return { ok: false, error: "Pole Název je povinné", status: 400 };
  }
  if (title.length > 500) {
    return { ok: false, error: "Název může mít maximálně 500 znaků", status: 400 };
  }
  const start = b.start;
  const end = b.end;
  if (typeof start !== "string" || !start.trim()) {
    return { ok: false, error: "Datum a čas začátku jsou povinné", status: 400 };
  }
  if (typeof end !== "string" || !end.trim()) {
    return { ok: false, error: "Datum a čas konce jsou povinné", status: 400 };
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime())) {
    return { ok: false, error: "Neplatné datum začátku", status: 400 };
  }
  if (Number.isNaN(endDate.getTime())) {
    return { ok: false, error: "Neplatné datum konce", status: 400 };
  }
  if (endDate.getTime() <= startDate.getTime()) {
    return { ok: false, error: "Čas konce musí být po čase začátku", status: 400 };
  }
  const description = b.description;
  const location = b.location;
  if (description !== undefined && description !== null && typeof description !== "string") {
    return { ok: false, error: "Poznámka musí být text", status: 400 };
  }
  if (location !== undefined && location !== null && typeof location !== "string") {
    return { ok: false, error: "Místo musí být text", status: 400 };
  }
  const contactId = b.contactId;
  const opportunityId = b.opportunityId;
  if (contactId !== undefined && contactId !== null) {
    if (typeof contactId !== "string" || !UUID_REGEX.test(contactId.trim())) {
      return { ok: false, error: "Neplatné contactId", status: 400 };
    }
  }
  if (opportunityId !== undefined && opportunityId !== null) {
    if (typeof opportunityId !== "string" || !UUID_REGEX.test(opportunityId.trim())) {
      return { ok: false, error: "Neplatné opportunityId", status: 400 };
    }
  }
  return {
    ok: true,
    data: {
      title: title.trim(),
      start: start.trim(),
      end: end.trim(),
      description: typeof description === "string" ? description.trim() || undefined : undefined,
      location: typeof location === "string" ? location.trim() || undefined : undefined,
      contactId: typeof contactId === "string" && UUID_REGEX.test(contactId.trim()) ? contactId.trim() : undefined,
      opportunityId: typeof opportunityId === "string" && UUID_REGEX.test(opportunityId.trim()) ? opportunityId.trim() : undefined,
    },
  };
}

export async function POST(request: Request) {
  const authResult = await getCalendarAuth(request);
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = validateCreateBody(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }
  const { title, start, end, description, location, contactId, opportunityId } = validation.data;

  if (contactId) {
    const [contactRow] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId))).limit(1);
    if (!contactRow) {
      return NextResponse.json({ error: "Kontakt nenalezen nebo nemáte přístup" }, { status: 400 });
    }
  }
  if (opportunityId) {
    const [oppRow] = await db.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.id, opportunityId), eq(opportunities.tenantId, tenantId))).limit(1);
    if (!oppRow) {
      return NextResponse.json({ error: "Příležitost nenalezena nebo nemáte přístup" }, { status: 400 });
    }
  }

  let accessToken: string;
  let calendarId: string;
  try {
    const valid = await getValidAccessToken(userId, tenantId);
    accessToken = valid.accessToken;
    calendarId = valid.calendarId;
  } catch (e) {
    const tokenErr = calendarTokenErrorResponse(e);
    if (tokenErr) return tokenErr;
    return NextResponse.json({ error: "Nepodařilo se získat přístup ke kalendáři" }, { status: 502 });
  }

  try {
    const created = await createCalendarEvent(accessToken, calendarId, {
      summary: title,
      start: { dateTime: start },
      end: { dateTime: end },
      description: description ?? undefined,
      location: location ?? undefined,
    });
    const googleEventId = created.id ?? null;
    const startAt = new Date(start);
    const endAt = new Date(end);
    try {
      await db.insert(events).values({
        tenantId,
        contactId: contactId ?? null,
        opportunityId: opportunityId ?? null,
        title,
        eventType: "schuzka",
        startAt,
        endAt,
        allDay: false,
        location: location ?? null,
        notes: description ?? null,
        assignedTo: userId,
        googleEventId,
        googleCalendarId: calendarId,
      });
    } catch (dbErr) {
      return NextResponse.json(
        { error: "Událost byla vytvořena v kalendáři, ale nepodařilo se uložit vazbu v aplikaci. Zkuste to znovu nebo kontaktujte podporu." },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { id: googleEventId, title: created.summary, start: created.start?.dateTime ?? start, end: created.end?.dateTime ?? end, location: created.location ?? null },
      { status: 201 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Google API error";
    return NextResponse.json({ error: "Vytvoření události selhalo", detail: msg }, { status: 502 });
  }
}
