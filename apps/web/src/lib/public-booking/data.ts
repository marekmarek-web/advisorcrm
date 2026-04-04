import "server-only";

import { db, advisorPreferences, tenants, userProfiles, events, contacts, eq, and, lt, or, isNull, ne, sql } from "db";
import type { BookingWeeklyAvailability } from "db";
import { getValidAccessToken } from "@/lib/integrations/google-calendar-integration-service";
import { queryFreeBusy } from "@/lib/integrations/google-calendar";
import { addDaysPragueYmd, formatYmdInPrague, pragueWallToUtcMs, BOOKING_TIMEZONE } from "./prague-time";
import type { BusyInterval } from "./slots";

export type ResolvedPublicBookingAdvisor = {
  tenantId: string;
  userId: string;
  tenantName: string;
  advisorName: string;
  slotMinutes: number;
  bufferMinutes: number;
  availability: BookingWeeklyAvailability;
};

export async function resolveEnabledPublicBooking(
  token: string,
): Promise<ResolvedPublicBookingAdvisor | null> {
  const t = token.trim();
  if (!t || t.length > 80) return null;

  const rows = await db
    .select({
      tenantId: advisorPreferences.tenantId,
      userId: advisorPreferences.userId,
      slotMinutes: advisorPreferences.bookingSlotMinutes,
      bufferMinutes: advisorPreferences.bookingBufferMinutes,
      availability: advisorPreferences.bookingAvailability,
      tenantName: tenants.name,
    })
    .from(advisorPreferences)
    .innerJoin(tenants, eq(advisorPreferences.tenantId, tenants.id))
    .where(
      and(
        eq(advisorPreferences.publicBookingToken, t),
        eq(advisorPreferences.publicBookingEnabled, true),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [profile] = await db
    .select({ fullName: userProfiles.fullName })
    .from(userProfiles)
    .where(eq(userProfiles.userId, row.userId))
    .limit(1);

  const availability = (row.availability ?? null) as BookingWeeklyAvailability | null;
  if (!availability || Object.keys(availability).length === 0) return null;

  return {
    tenantId: row.tenantId,
    userId: row.userId,
    tenantName: row.tenantName?.trim() || "—",
    advisorName: profile?.fullName?.trim() || "Poradce",
    slotMinutes: row.slotMinutes ?? 30,
    bufferMinutes: row.bufferMinutes ?? 0,
    availability,
  };
}

function eventRowToBusyInterval(
  r: { startAt: Date; endAt: Date | null; allDay: boolean | null },
  rangeStartMs: number,
  rangeEndMs: number,
): BusyInterval | null {
  let startMs: number;
  let endMs: number;

  if (r.allDay) {
    const ymd = formatYmdInPrague(r.startAt.getTime());
    try {
      startMs = pragueWallToUtcMs(ymd, "00:00");
      endMs = pragueWallToUtcMs(addDaysPragueYmd(ymd, 1), "00:00");
    } catch {
      return null;
    }
  } else {
    const end = r.endAt ?? new Date(r.startAt.getTime() + 60 * 60 * 1000);
    startMs = r.startAt.getTime();
    endMs = end.getTime();
  }

  if (endMs <= rangeStartMs || startMs >= rangeEndMs) return null;
  return { startMs, endMs };
}

/** Události z CRM přiřazené poradci (včetně celodenních — celý den v Europe/Prague). Zrušené se nepočítají. */
export async function loadBusyIntervalsForAdvisor(
  tenantId: string,
  userId: string,
  rangeStartUtc: Date,
  rangeEndUtc: Date,
): Promise<BusyInterval[]> {
  const rows = await db
    .select({
      startAt: events.startAt,
      endAt: events.endAt,
      allDay: events.allDay,
      status: events.status,
    })
    .from(events)
    .where(
      and(
        eq(events.tenantId, tenantId),
        eq(events.assignedTo, userId),
        lt(events.startAt, rangeEndUtc),
        or(isNull(events.status), ne(events.status, "cancelled")),
      ),
    );

  const out: BusyInterval[] = [];
  const rangeStartMs = rangeStartUtc.getTime();
  const rangeEndMs = rangeEndUtc.getTime();

  for (const r of rows) {
    const iv = eventRowToBusyInterval(r, rangeStartMs, rangeEndMs);
    if (iv) out.push(iv);
  }
  return out;
}

/**
 * Busy z Google Calendar (free/busy) — jen časové intervaly, bez názvů událostí.
 * Při ne připojeném kalendáři nebo chybě API vrací prázdné pole.
 */
export async function loadGoogleFreeBusyIntervals(
  tenantId: string,
  userId: string,
  rangeStartUtc: Date,
  rangeEndUtc: Date,
): Promise<BusyInterval[]> {
  let accessToken: string;
  let calendarId: string;
  try {
    const v = await getValidAccessToken(userId, tenantId);
    accessToken = v.accessToken;
    calendarId = v.calendarId;
  } catch {
    return [];
  }

  const timeMin = rangeStartUtc.toISOString();
  const timeMax = rangeEndUtc.toISOString();

  try {
    const res = await queryFreeBusy(accessToken, {
      timeMin,
      timeMax,
      items: [{ id: calendarId }],
      timeZone: BOOKING_TIMEZONE,
    });
    const cal = res.calendars?.[calendarId];
    if (cal?.errors?.length) return [];
    const busy = cal?.busy ?? [];
    const out: BusyInterval[] = [];
    for (const b of busy) {
      const startMs = new Date(b.start).getTime();
      const endMs = new Date(b.end).getTime();
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
        out.push({ startMs, endMs });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** CRM + Google free/busy pro výpočet veřejných slotů. */
export async function loadMergedBusyIntervalsForPublicBooking(
  tenantId: string,
  userId: string,
  rangeStartUtc: Date,
  rangeEndUtc: Date,
): Promise<BusyInterval[]> {
  const [crm, google] = await Promise.all([
    loadBusyIntervalsForAdvisor(tenantId, userId, rangeStartUtc, rangeEndUtc),
    loadGoogleFreeBusyIntervals(tenantId, userId, rangeStartUtc, rangeEndUtc),
  ]);
  return [...crm, ...google];
}

export async function findContactIdByEmail(tenantId: string, email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(eq(contacts.tenantId, tenantId), sql`lower(trim(${contacts.email})) = ${normalized}`),
    )
    .limit(1);
  return row?.id ?? null;
}
