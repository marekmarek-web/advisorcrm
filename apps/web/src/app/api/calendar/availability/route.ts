import { NextResponse } from "next/server";
import { getCalendarAuth, calendarTokenErrorResponse } from "../auth";
import { getValidAccessToken } from "@/lib/integrations/google-calendar-integration-service";
import { queryFreeBusy } from "@/lib/integrations/google-calendar";
import { computeFreeSlots, type TimeRange } from "@/lib/datetime";

export const dynamic = "force-dynamic";

const DEFAULT_SLOT_STEP_MINUTES = 15;
const MAX_DAYS_RANGE = 31;
const MIN_DURATION = 15;
const MAX_DURATION = 480;

export type AvailabilityQuery = {
  timeMin: string;
  timeMax: string;
  durationMinutes: string;
  timeZone?: string;
  slotStepMinutes?: string;
};

function parseQuery(url: URL): { ok: true; data: { timeMin: string; timeMax: string; durationMinutes: number; timeZone?: string; slotStepMinutes: number } } | { ok: false; error: string; status: number } {
  const timeMin = url.searchParams.get("timeMin");
  const timeMax = url.searchParams.get("timeMax");
  const durationMinutes = url.searchParams.get("durationMinutes");
  const timeZone = url.searchParams.get("timeZone") ?? undefined;
  const slotStepMinutesParam = url.searchParams.get("slotStepMinutes");

  if (!timeMin?.trim()) return { ok: false, error: "Chybí parametr timeMin (ISO 8601)", status: 400 };
  if (!timeMax?.trim()) return { ok: false, error: "Chybí parametr timeMax (ISO 8601)", status: 400 };
  if (!durationMinutes?.trim()) return { ok: false, error: "Chybí parametr durationMinutes", status: 400 };

  const start = new Date(timeMin);
  const end = new Date(timeMax);
  if (Number.isNaN(start.getTime())) return { ok: false, error: "Neplatné timeMin", status: 400 };
  if (Number.isNaN(end.getTime())) return { ok: false, error: "Neplatné timeMax", status: 400 };
  if (end.getTime() <= start.getTime()) return { ok: false, error: "timeMax musí být po timeMin", status: 400 };

  const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  if (days > MAX_DAYS_RANGE) return { ok: false, error: `Rozsah maximálně ${MAX_DAYS_RANGE} dní`, status: 400 };

  const duration = parseInt(durationMinutes, 10);
  if (Number.isNaN(duration) || duration < MIN_DURATION || duration > MAX_DURATION) {
    return { ok: false, error: `durationMinutes mezi ${MIN_DURATION} a ${MAX_DURATION}`, status: 400 };
  }

  const parsedStep = slotStepMinutesParam ? parseInt(slotStepMinutesParam, 10) : NaN;
  const slotStepMinutes = !Number.isNaN(parsedStep) ? Math.min(60, Math.max(5, parsedStep)) : DEFAULT_SLOT_STEP_MINUTES;

  return {
    ok: true,
    data: {
      timeMin: timeMin.trim(),
      timeMax: timeMax.trim(),
      durationMinutes: duration,
      timeZone: timeZone && timeZone.trim() ? timeZone.trim() : undefined,
      slotStepMinutes,
    },
  };
}

export async function GET(request: Request) {
  const authResult = await getCalendarAuth(request);
  if (!authResult.ok) return authResult.response;
  const { userId, tenantId } = authResult.auth;

  const url = new URL(request.url);
  const parsed = parseQuery(url);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }
  const { timeMin, timeMax, durationMinutes, timeZone, slotStepMinutes } = parsed.data;

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
    const freeBusyRes = await queryFreeBusy(accessToken, {
      timeMin,
      timeMax,
      items: [{ id: calendarId }],
      timeZone: timeZone ?? undefined,
    });

    const cal = freeBusyRes.calendars?.[calendarId];
    if (cal?.errors?.length) {
      const msg = cal.errors.map((e) => e.reason ?? e.domain).join("; ");
      return NextResponse.json({ error: "Free/busy dotaz selhal", detail: msg }, { status: 502 });
    }

    const busy: TimeRange[] = (cal?.busy ?? []).map((b) => ({ start: b.start, end: b.end }));
    const slots = computeFreeSlots(timeMin, timeMax, busy, durationMinutes, slotStepMinutes);

    return NextResponse.json({
      slots: slots.map((s) => ({ start: s.start, end: s.end })),
      timeMin,
      timeMax,
      durationMinutes,
      timeZone: timeZone ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Google API error";
    return NextResponse.json({ error: "Zjištění volných termínů selhalo", detail: msg }, { status: 502 });
  }
}
