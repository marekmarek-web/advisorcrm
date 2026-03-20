"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar as CalendarIcon, MapPin, RefreshCw, User } from "lucide-react";
import { listEvents, createEvent, type EventRow } from "@/app/actions/events";
import type { ContactRow } from "@/app/actions/contacts";
import {
  BottomSheet,
  EmptyState,
  ErrorState,
  FilterChips,
  LoadingSkeleton,
  MobileCard,
  MobileSection,
} from "@/app/shared/mobile-ui/primitives";

type RangeFilter = "today" | "week" | "month";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function formatDayHeading(d: Date) {
  return d.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" });
}

function formatTimeRange(ev: EventRow) {
  const s = new Date(ev.startAt);
  const e = ev.endAt ? new Date(ev.endAt) : null;
  const t0 = s.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  if (!e) return t0;
  const t1 = e.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  return `${t0}–${t1}`;
}

export function CalendarMobileScreen({ contacts }: { contacts: ContactRow[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>("month");
  const [createOpen, setCreateOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftStart, setDraftStart] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - (now.getMinutes() % 15));
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [draftContactId, setDraftContactId] = useState("");

  const load = useCallback(() => {
    startTransition(async () => {
      setError(null);
      try {
        const start = startOfDay(new Date()).toISOString();
        const end = addDays(new Date(), 62).toISOString();
        const rows = await listEvents({ start, end });
        setEvents(rows);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kalendář se nepodařilo načíst.");
        setEvents([]);
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const now = useMemo(() => new Date(), []);
  const filtered = useMemo(() => {
    const startToday = startOfDay(now).getTime();
    const endToday = addDays(startOfDay(now), 1).getTime();
    const endWeek = addDays(startOfDay(now), 7).getTime();

    return events.filter((ev) => {
      const t = new Date(ev.startAt).getTime();
      if (rangeFilter === "today") return t >= startToday && t < endToday;
      if (rangeFilter === "week") return t >= startToday && t < endWeek;
      return true;
    });
  }, [events, rangeFilter, now]);

  const grouped = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const ev of filtered) {
      const d = startOfDay(new Date(ev.startAt));
      const key = d.toISOString().slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    const keys = [...map.keys()].sort();
    return keys.map((key) => ({
      key,
      date: new Date(`${key}T12:00:00`),
      items: (map.get(key) ?? []).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    }));
  }, [filtered]);

  async function onCreateEvent() {
    if (!draftTitle.trim()) return;
    startTransition(async () => {
      setError(null);
      try {
        const startAt = new Date(draftStart).toISOString();
        const end = new Date(new Date(draftStart).getTime() + 60 * 60 * 1000).toISOString();
        await createEvent({
          title: draftTitle.trim(),
          eventType: "schuzka",
          startAt,
          endAt: end,
          contactId: draftContactId || undefined,
        });
        setCreateOpen(false);
        setDraftTitle("");
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Událost se nepodařilo vytvořit.");
      }
    });
  }

  return (
    <>
      <MobileSection title="Kalendář">
        <MobileCard className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600 border border-indigo-100">
            <CalendarIcon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">Nadcházející události</p>
            <p className="text-xs text-slate-500 mt-1">
              Přehled napojený na CRM. Plný týdenní pohled otevřete na desktopu v detailu schůzky.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={load}
                disabled={busy}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700"
              >
                <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
                Obnovit
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="min-h-[44px] rounded-xl bg-indigo-600 px-3 text-sm font-bold text-white"
              >
                Nová schůzka
              </button>
            </div>
          </div>
        </MobileCard>

        <FilterChips
          value={rangeFilter}
          onChange={(id) => setRangeFilter(id as RangeFilter)}
          options={[
            { id: "today", label: "Dnes" },
            { id: "week", label: "7 dní" },
            { id: "month", label: "Vše (2 měs.)" },
          ]}
        />
      </MobileSection>

      {error ? <ErrorState title={error} onRetry={load} /> : null}
      {busy && events.length === 0 ? <LoadingSkeleton rows={4} /> : null}

      {!busy && !error && grouped.length === 0 ? (
        <EmptyState title="Žádné události" description="V tomto výběru zatím nic nemáte." />
      ) : (
        grouped.map((group) => (
          <MobileSection key={group.key} title={formatDayHeading(group.date)}>
            {group.items.map((ev) => (
              <MobileCard key={ev.id} className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">{ev.title}</p>
                  <span className="text-xs font-semibold text-indigo-700 shrink-0">{formatTimeRange(ev)}</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                  {ev.eventType ? <span className="rounded-lg border border-slate-200 px-2 py-1">{ev.eventType}</span> : null}
                  {ev.contactId && ev.contactName ? (
                    <button
                      type="button"
                      onClick={() => router.push(`/portal/contacts/${ev.contactId}`)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 min-h-[32px]"
                    >
                      <User size={12} />
                      {ev.contactName}
                    </button>
                  ) : null}
                  {ev.location ? (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1">
                      <MapPin size={12} />
                      {ev.location}
                    </span>
                  ) : null}
                </div>
              </MobileCard>
            ))}
          </MobileSection>
        ))
      )}

      <BottomSheet open={createOpen} onClose={() => setCreateOpen(false)} title="Nová schůzka">
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase text-slate-500">Název</label>
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm"
            placeholder="Např. Schůzka s klientem"
          />
          <label className="text-xs font-bold uppercase text-slate-500">Start</label>
          <input
            type="datetime-local"
            value={draftStart}
            onChange={(e) => setDraftStart(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm"
          />
          <label className="text-xs font-bold uppercase text-slate-500">Klient (volitelně)</label>
          <select
            value={draftContactId}
            onChange={(e) => setDraftContactId(e.target.value)}
            className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm bg-white"
          >
            <option value="">— Bez klienta —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onCreateEvent}
            disabled={busy || !draftTitle.trim()}
            className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-60"
          >
            Uložit událost
          </button>
          <p className="text-[11px] text-slate-500">
            Vyžaduje oprávnění zapisovat události. Při „Forbidden“ kontaktujte správce tenantu.
          </p>
        </div>
      </BottomSheet>
    </>
  );
}
