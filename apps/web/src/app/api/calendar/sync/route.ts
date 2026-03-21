import { NextResponse } from "next/server";
import { db, events } from "db";
import { eq, and } from "db";
import { getCalendarAuth, calendarTokenErrorResponse } from "../auth";
import { getValidAccessToken } from "@/lib/integrations/google-calendar-integration-service";
import { listAllCalendarEventsInRange, type GoogleCalendarEvent } from "@/lib/integrations/google-calendar";

export const dynamic = "force-dynamic";
/** Delší sync (až 2 roky + stránkování); na Vercelu zvedni limit v plánu pokud padá na timeout. */
export const maxDuration = 120;

/** Výchozí sync: ~2 roky zpět (více než půl roku bez týdenního mačkání Sync). */
const DEFAULT_SYNC_PAST_DAYS = 730;
/** Výchozí sync dopředu (rok). */
const DEFAULT_SYNC_FUTURE_DAYS = 366;
const MS_PER_DAY = 86400000;

const DETAIL_MAX = 450;

function safeErrorDetail(e: unknown): string | undefined {
  const msg = e instanceof Error ? e.message : String(e);
  const t = msg.replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  return t.length > DETAIL_MAX ? `${t.slice(0, DETAIL_MAX)}…` : t;
}

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
  try {
    return await handleCalendarSyncPost(request);
  } catch (e) {
    console.error("[calendar/sync] unhandled", e);
    return NextResponse.json(
      {
        ok: false,
        error: "Synchronizace selhala (neočekávaná chyba serveru).",
        detail: safeErrorDetail(e),
      },
      { status: 500 }
    );
  }
}

async function handleCalendarSyncPost(request: Request): Promise<Response> {
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
    const bodyObj =
      body && typeof body === "object"
        ? (body as { timeMin?: string; timeMax?: string; pastDays?: number; futureDays?: number })
        : {};

    const now = Date.now();
    let pastDays = DEFAULT_SYNC_PAST_DAYS;
    let futureDays = DEFAULT_SYNC_FUTURE_DAYS;
    if (typeof bodyObj.pastDays === "number" && Number.isFinite(bodyObj.pastDays)) {
      pastDays = Math.min(Math.max(Math.floor(bodyObj.pastDays), 1), 800);
    }
    if (typeof bodyObj.futureDays === "number" && Number.isFinite(bodyObj.futureDays)) {
      futureDays = Math.min(Math.max(Math.floor(bodyObj.futureDays), 1), 400);
    }

    let rangeMin = now - pastDays * MS_PER_DAY;
    let rangeMax = now + futureDays * MS_PER_DAY;

    if (bodyObj.timeMin) {
      const t = new Date(bodyObj.timeMin).getTime();
      if (!Number.isNaN(t)) rangeMin = Math.min(t, rangeMin);
    }
    if (bodyObj.timeMax) {
      const t = new Date(bodyObj.timeMax).getTime();
      if (!Number.isNaN(t)) rangeMax = Math.max(t, rangeMax);
    }

    if (rangeMax <= rangeMin) {
      rangeMax = rangeMin + MS_PER_DAY;
    }

    timeMin = new Date(rangeMin).toISOString();
    timeMax = new Date(rangeMax).toISOString();
  } catch {
    const now = Date.now();
    timeMin = new Date(now - DEFAULT_SYNC_PAST_DAYS * MS_PER_DAY).toISOString();
    timeMax = new Date(now + DEFAULT_SYNC_FUTURE_DAYS * MS_PER_DAY).toISOString();
  }

  let items: GoogleCalendarEvent[] = [];
  let fetchTruncated = false;
  try {
    const result = await listAllCalendarEventsInRange(accessToken, calendarId, {
      timeMin,
      timeMax,
    });
    items = result.items;
    fetchTruncated = result.truncated;
    if (fetchTruncated) {
      console.warn("[calendar/sync] Google list truncated (page limit)", { timeMin, timeMax, count: items.length });
    }
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to fetch Google Calendar events", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 }
    );
  }

  let created = 0;
  let updated = 0;
  const now = new Date();

  try {
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
  } catch (e) {
    console.error("[calendar/sync] DB write failed", e);
    const msg = e instanceof Error ? e.message : String(e);
    const isMissingColumn =
      /column .* does not exist/i.test(msg) ||
      /google_event_id|google_calendar_id|team_event_id|team_task_id/i.test(msg);
    return NextResponse.json(
      {
        ok: false,
        error: isMissingColumn
          ? "V databázi chybí sloupce tabulky events (např. team_event_id nebo google_*). Spusťte v Supabase migraci packages/db/migrations/add_events_google_calendar_fields.sql."
          : "Uložení událostí do databáze selhalo.",
        detail: safeErrorDetail(e),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    created,
    updated,
    total: items.length,
    truncated: fetchTruncated,
    range: { timeMin, timeMax },
  });
}
