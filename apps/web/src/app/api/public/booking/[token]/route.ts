import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, events, userProfiles, eq } from "db";
import { getClientIp, rateLimitByKey } from "@/lib/rate-limit-ip";
import { addDaysPragueYmd, formatYmdInPrague, pragueWallToUtcMs } from "@/lib/public-booking/prague-time";
import { computeAvailableSlots, todayYmdPrague } from "@/lib/public-booking/slots";
import {
  resolveEnabledPublicBooking,
  loadMergedBusyIntervalsForPublicBooking,
  findContactIdByEmail,
} from "@/lib/public-booking/data";
import { sendPublicBookingNotifications } from "@/lib/public-booking/public-booking-emails";

export const dynamic = "force-dynamic";

const POST_WINDOW_MS = 60_000;
const POST_MAX = 10;
const postBuckets = new Map<string, number[]>();

function rateLimitPost(key: string): boolean {
  const now = Date.now();
  const arr = postBuckets.get(key) ?? [];
  const pruned = arr.filter((t) => now - t < POST_WINDOW_MS);
  if (pruned.length >= POST_MAX) return false;
  pruned.push(now);
  postBuckets.set(key, pruned);
  return true;
}

function jsonError(status: number, code: string, message?: string) {
  return NextResponse.json({ ok: false, error: code, message }, { status });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const ip = getClientIp(request);
  if (!rateLimitByKey(`public-booking-get:${ip}`).ok) {
    return jsonError(429, "rate_limited");
  }

  const { token } = await ctx.params;
  const resolved = await resolveEnabledPublicBooking(token);
  if (!resolved) {
    return jsonError(404, "not_found", "Neplatný nebo neaktivní odkaz.");
  }

  const url = new URL(request.url);
  const daysRaw = parseInt(url.searchParams.get("days") ?? "14", 10);
  const days = Math.min(21, Math.max(1, Number.isFinite(daysRaw) ? daysRaw : 14));
  const fromParam = url.searchParams.get("from")?.trim();
  const fromYmd = /^\d{4}-\d{2}-\d{2}$/.test(fromParam ?? "") ? (fromParam as string) : todayYmdPrague(Date.now());

  const lastYmd = addDaysPragueYmd(fromYmd, days - 1);
  const rangeStartUtc = new Date(pragueWallToUtcMs(fromYmd, "00:00"));
  const rangeEndUtc = new Date(pragueWallToUtcMs(lastYmd, "23:59") + 3 * 60 * 60 * 1000);

  const busy = await loadMergedBusyIntervalsForPublicBooking(
    resolved.tenantId,
    resolved.userId,
    rangeStartUtc,
    rangeEndUtc,
  );

  const slots = computeAvailableSlots({
    fromYmd,
    numDays: days,
    availability: resolved.availability,
    slotMinutes: resolved.slotMinutes,
    bufferMinutes: resolved.bufferMinutes,
    busy,
    nowMs: Date.now(),
    minLeadMinutes: 120,
  });

  return NextResponse.json({
    ok: true,
    timezone: "Europe/Prague",
    advisorName: resolved.advisorName,
    companyName: resolved.tenantName,
    slotMinutes: resolved.slotMinutes,
    slots,
  });
}

type PostBody = {
  start?: string;
  end?: string;
  clientName?: string;
  email?: string;
  phone?: string;
  note?: string;
};

export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const ip = getClientIp(request);
  const { token } = await ctx.params;
  if (!rateLimitPost(`public-booking-post:${ip}:${token.slice(0, 16)}`)) {
    return jsonError(429, "rate_limited");
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return jsonError(400, "invalid_json");
  }

  const clientName = (body.clientName ?? "").trim();
  const email = (body.email ?? "").trim();
  const phone = (body.phone ?? "").trim();
  const note = (body.note ?? "").trim();
  const startIso = (body.start ?? "").trim();
  const endIso = (body.end ?? "").trim();

  if (!clientName || clientName.length > 120) {
    return jsonError(400, "invalid_name", "Zadejte jméno.");
  }
  if (!email || !EMAIL_RE.test(email) || email.length > 200) {
    return jsonError(400, "invalid_email", "Zadejte platný e-mail.");
  }
  if (!startIso || !endIso) {
    return jsonError(400, "invalid_slot", "Vyberte termín.");
  }

  const startAt = new Date(startIso);
  const endAt = new Date(endIso);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return jsonError(400, "invalid_slot", "Neplatný čas.");
  }

  const resolved = await resolveEnabledPublicBooking(token);
  if (!resolved) {
    return jsonError(404, "not_found", "Neplatný nebo neaktivní odkaz.");
  }

  const ymd = formatYmdInPrague(startAt.getTime());
  const rangeStartUtc = new Date(pragueWallToUtcMs(ymd, "00:00"));
  const rangeEndUtc = new Date(pragueWallToUtcMs(ymd, "23:59") + 3 * 60 * 60 * 1000);

  const contactId = await findContactIdByEmail(resolved.tenantId, email);

  const notesLines = [
    `Rezervace přes veřejný odkaz.`,
    `Klient: ${clientName}`,
    `E-mail: ${email}`,
    phone ? `Telefon: ${phone}` : null,
    note ? `Poznámka: ${note}` : null,
  ].filter(Boolean);

  const startIsoKey = startAt.toISOString();

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${resolved.userId}::text), hashtext(${startIsoKey}::text))`,
      );

      const busyFresh = await loadMergedBusyIntervalsForPublicBooking(
        resolved.tenantId,
        resolved.userId,
        rangeStartUtc,
        rangeEndUtc,
      );

      const slotsFresh = computeAvailableSlots({
        fromYmd: ymd,
        numDays: 1,
        availability: resolved.availability,
        slotMinutes: resolved.slotMinutes,
        bufferMinutes: resolved.bufferMinutes,
        busy: busyFresh,
        nowMs: Date.now(),
        minLeadMinutes: 120,
      });

      const matchFresh = slotsFresh.some(
        (s) => s.start === startAt.toISOString() && s.end === endAt.toISOString(),
      );
      if (!matchFresh) {
        throw Object.assign(new Error("slot_taken"), { code: "SLOT_TAKEN" as const });
      }

      await tx.insert(events).values({
        tenantId: resolved.tenantId,
        title: `Schůzka (web) — ${clientName}`,
        eventType: "schuzka",
        startAt,
        endAt,
        allDay: false,
        assignedTo: resolved.userId,
        status: "scheduled",
        notes: notesLines.join("\n"),
        contactId,
      });
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "SLOT_TAKEN") {
      return jsonError(409, "slot_taken", "Tento termín už není k dispozici. Obnovte stránku a vyberte jiný.");
    }
    throw e;
  }

  const [advisorProfile] = await db
    .select({ email: userProfiles.email })
    .from(userProfiles)
    .where(eq(userProfiles.userId, resolved.userId))
    .limit(1);

  await sendPublicBookingNotifications({
    clientEmail: email,
    clientName,
    advisorEmail: advisorProfile?.email?.trim() ?? null,
    advisorName: resolved.advisorName,
    companyName: resolved.tenantName,
    startAt,
    endAt,
  });

  return NextResponse.json({ ok: true });
}
