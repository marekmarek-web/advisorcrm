import { NextResponse } from "next/server";
import { db, events } from "db";
import { eq, and } from "db";
import { getCalendarAuth, calendarTokenErrorResponse } from "../auth";
import { getValidAccessToken } from "@/lib/integrations/google-calendar-integration-service";
import { listCalendarEvents, type GoogleCalendarEvent } from "@/lib/integrations/google-calendar";

export const dynamic = "force-dynamic";

function parseGoogleEventTime(ev: GoogleCalendarEvent): { startAt: Date; endAt: Date | null; allDay: boolean } {
  const start = ev.start;
  const end = ev.end;
  if (start?.dateTime) {
    const startAt = new Date(start.dateTime);
    const endAt = end?.dateTime ? new Date(end.dateTime) : null;
    return { startAt, endAt, allDay: false };
  }
  if (start?.date) {
    const startAt = new Date(start.date + "T00:00:00.000Z");
    const endAt = end?.date ? new Date(end.date + "T23:59:59.999Z") : new Date(start.date + "T23:59:59.999Z");
    return { startAt, endAt, allDay: true };
  }
  const startAt = new Date();
  return { startAt, endAt: null, allDay: false };
}

export async function POST(request: Request) {
  const authResult = await getCalendarAuth(request);
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;

  let accessToken: string;
  let calendarId: string;
  try {
    const valid = await getValidAccessToken(userId, tenantId);
    accessToken = valid.accessToken;
    calendarId = valid.calendarId;
  } catch (e) {
    const tokenErr = calendarTokenErrorResponse(e);
    if (tokenErr) return tokenErr;
    return NextResponse.json(
      { error: "Nepodařilo se získat přístup ke kalendáři", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 }
    );
  }
  let timeMin: string;
  let timeMax: string;
  try {
    const body = await request.json().catch(() => ({}));
    const bodyObj = body && typeof body === "object" ? body as { timeMin?: string; timeMax?: string } : {};
    if (bodyObj.timeMin) {
      const t = new Date(bodyObj.timeMin);
      timeMin = Number.isNaN(t.getTime()) ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() : t.toISOString();
    } else {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      timeMin = start.toISOString();
    }
    if (bodyObj.timeMax) {
      const t = new Date(bodyObj.timeMax);
      timeMax = Number.isNaN(t.getTime()) ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : t.toISOString();
    } else {
      const end = new Date();
      end.setDate(end.getDate() + 30);
      timeMax = end.toISOString();
    }
  } catch {
    const start = new Date();
    start.setDate(start.getDate() - 7);
    timeMin = start.toISOString();
    const end = new Date();
    end.setDate(end.getDate() + 30);
    timeMax = end.toISOString();
  }

  let items: GoogleCalendarEvent[] = [];
  try {
    const result = await listCalendarEvents(accessToken, calendarId, {
      timeMin,
      timeMax,
      maxResults: 250,
    });
    items = result.items ?? [];
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch Google Calendar events", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 }
    );
  }

  let created = 0;
  let updated = 0;
  const now = new Date();

  for (const ev of items) {
    const googleEventId = ev.id;
    if (!googleEventId || ev.status === "cancelled") continue;

    const { startAt, endAt, allDay } = parseGoogleEventTime(ev);
    const title = ev.summary?.trim() || "(Bez názvu)";

    const existing = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.tenantId, tenantId),
          eq(events.googleEventId, googleEventId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(events)
        .set({
          title,
          startAt,
          endAt,
          allDay,
          location: ev.location?.trim() || null,
          notes: ev.description?.trim() || null,
          updatedAt: now,
        })
        .where(eq(events.id, existing[0].id));
      updated++;
    } else {
      await db.insert(events).values({
        tenantId,
        assignedTo: userId,
        title,
        eventType: "schuzka",
        startAt,
        endAt,
        allDay,
        location: ev.location?.trim() || null,
        notes: ev.description?.trim() || null,
        googleEventId,
        googleCalendarId: calendarId,
        updatedAt: now,
      });
      created++;
    }
  }

  return NextResponse.json({ ok: true, created, updated, total: items.length });
}
