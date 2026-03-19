"use client";

import { useState, useCallback } from "react";
import { Loader2, AlertCircle, Calendar, CalendarClock, Clock } from "lucide-react";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";

const DURATION_OPTIONS = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 h" },
  { value: 90, label: "1,5 h" },
  { value: 120, label: "2 h" },
];

function formatSlotDate(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "short" });
}

function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

export type AvailabilitySlot = { start: string; end: string };

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function GoogleCalendarAvailability() {
  const today = toYmd(new Date());
  const nextWeek = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return toYmd(d);
  })();
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(nextWeek);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const fetchAvailability = useCallback(async () => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const timeMin = new Date(`${dateFrom}T08:00:00`).toISOString();
    const timeMax = new Date(`${dateTo}T18:00:00`).toISOString();
    if (new Date(timeMax).getTime() <= new Date(timeMin).getTime()) {
      setError("Konec období musí být po začátku.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        durationMinutes: String(durationMinutes),
        timeZone,
      });
      const res = await fetch(`/api/calendar/availability?${params.toString()}`);
      const data = (await res.json()) as { slots?: AvailabilitySlot[]; error?: string; detail?: string };
      if (!res.ok) {
        setError(data.error ?? data.detail ?? "Načtení volných termínů se nepovedlo.");
        setSlots([]);
        return;
      }
      setSlots(data.slots ?? []);
    } catch {
      setError("Načtení volných termínů se nepovedlo.");
      setSlots([]);
    } finally {
      setLoading(false);
      setHasSearched(true);
    }
  }, [dateFrom, dateTo, durationMinutes]);

  const labelClass = "block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1";
  const inputClass =
    "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-slate-800 min-h-[44px]";

  return (
    <div className="mt-6 pt-4 border-t border-slate-100">
      <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
        <CalendarClock size={14} aria-hidden /> Volné termíny
      </h4>
      <p className="text-sm text-slate-600 mb-4">
        Zadejte rozsah dat a délku schůzky. Zobrazí se volné sloty (po–pá 8:00–18:00 v vaší časové zóně).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div>
          <label htmlFor="avail-date-from" className={labelClass}>Od data</label>
          <input
            id="avail-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            min={today}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="avail-date-to" className={labelClass}>Do data</label>
          <input
            id="avail-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            min={dateFrom}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="avail-duration" className={labelClass}>Délka schůzky</label>
          <CustomDropdown
            value={String(durationMinutes)}
            onChange={(id) => setDurationMinutes(Number(id))}
            options={DURATION_OPTIONS.map((o) => ({ id: String(o.value), label: o.label }))}
            placeholder="Délka"
            icon={Clock}
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={fetchAvailability}
            disabled={loading}
            className="wp-btn wp-btn-primary w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={18} className="animate-spin shrink-0" /> : <Calendar size={18} className="shrink-0" />}
            {loading ? "Hledám…" : "Zobrazit volné termíny"}
          </button>
        </div>
      </div>
      {error && (
        <p className="text-sm text-amber-700 font-medium flex items-center gap-2 mb-3">
          <AlertCircle size={16} className="shrink-0" aria-hidden /> {error}
        </p>
      )}
      {slots.length > 0 && (
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
            Nalezeno {slots.length} volných slotů
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[280px] overflow-y-auto" role="list">
            {slots.map((slot, i) => (
              <li key={`${slot.start}-${i}`} className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-100">
                <Calendar size={14} className="text-indigo-500 shrink-0" aria-hidden />
                <span className="text-sm font-medium text-slate-800">
                  {formatSlotDate(slot.start)} {formatSlotTime(slot.start)} – {formatSlotTime(slot.end)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!loading && slots.length === 0 && !error && (
        <p className="text-sm text-slate-500 font-medium">
          {hasSearched ? "V zadaném období nebyly nalezeny žádné volné sloty." : "Klikněte na „Zobrazit volné termíny“ pro načtení slotů."}
        </p>
      )}
    </div>
  );
}
