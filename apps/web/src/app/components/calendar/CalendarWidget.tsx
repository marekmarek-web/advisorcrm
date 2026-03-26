"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Calendar as CalendarIcon, Plus, Users, Phone, CheckCircle2, Mail } from "lucide-react";
import { listEvents, type EventRow } from "@/app/actions/events";
import { loadCalendarSettings } from "@/app/portal/calendar/calendar-settings";
import { getEventCategory } from "@/app/portal/calendar/event-categories";

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < -60) return "proběhlo";
  if (diffMin < 0) return "právě teď";
  if (diffMin < 60) return `za ${diffMin} min.`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `za ${diffH} h.`;
  return `za ${Math.round(diffH / 24)} dní`;
}

function formatTimeShort(d: Date): string {
  return d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
}

function EventIcon({ eventType }: { eventType: string | null }) {
  switch (eventType) {
    case "schuzka":
      return <Users size={16} />;
    case "telefonat":
      return <Phone size={16} />;
    case "mail":
      return <Mail size={16} />;
    case "ukol":
      return <CheckCircle2 size={16} />;
    default:
      return <CalendarIcon size={16} />;
  }
}

export function CalendarWidget({
  onNewActivity,
  hideTitle,
  variant = "default",
}: {
  onNewActivity?: () => void;
  hideTitle?: boolean;
  /** Tmavý kontext (pravý panel nástěnky) – navy „Dnes“, agenda texty pro tmavé pozadí. */
  variant?: "default" | "darkPanel";
}) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventTypeColors, setEventTypeColors] = useState<Record<string, string>>({});

  useEffect(() => {
    const settings = loadCalendarSettings();
    setEventTypeColors(settings.eventTypeColors ?? {});
  }, []);

  const load = useCallback(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    setLoading(true);
    listEvents({ start: start.toISOString(), end: end.toISOString() })
      .then((data) => {
        const sorted = data
          .filter((e) => new Date(e.startAt) >= start)
          .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
        setEvents(sorted.slice(0, 5));
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const todayFull = new Date().toLocaleDateString("cs-CZ", { month: "long", day: "numeric", year: "numeric" });
  const isDark = variant === "darkPanel";

  return (
    <div className="space-y-8">
      {!hideTitle && (
        <div className="flex justify-between items-center">
          <Link
            href="/portal/calendar"
            className="text-sm font-bold text-slate-700 hover:text-indigo-600 transition-colors"
          >
            Kalendář
          </Link>
          <Link
            href="/portal/calendar"
            className="w-10 h-10 rounded-2xl bg-slate-50 text-slate-600 flex items-center justify-center hover:bg-slate-100 transition-colors border border-slate-200 min-w-[44px] min-h-[44px]"
            aria-label="Otevřít kalendář"
          >
            <CalendarIcon size={18} />
          </Link>
        </div>
      )}

      {/* Karta dne – navy + jemný fialový accent (Aidvisora tokeny) */}
      <div
        className={`relative rounded-[28px] p-6 text-white shadow-xl overflow-hidden group border ${
          isDark
            ? "bg-gradient-to-br from-aidv-surface-dark via-aidv-surface-elevated to-[#1a1f3d] border-[color:var(--aidv-border-on-dark)] shadow-black/30"
            : "bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-800 border-transparent shadow-indigo-900/20"
        }`}
      >
        <div
          className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl transform translate-x-10 -translate-y-10 group-hover:scale-110 transition-transform duration-700 ${
            isDark ? "bg-aidv-accent-purple/25" : "bg-white/10"
          }`}
          aria-hidden
        />
        <span
          className={`text-[10px] font-black uppercase tracking-widest block mb-2 opacity-90 ${
            isDark ? "text-aidv-text-muted-on-dark" : "text-indigo-200 opacity-80"
          }`}
        >
          Dnes
        </span>
        <h3 className="text-2xl font-black tracking-tight mb-6">{todayFull}</h3>
        <button
          type="button"
          onClick={onNewActivity}
          className={`absolute bottom-6 right-6 w-12 h-12 rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all ${
            isDark ? "bg-white text-aidv-dashboard-cta" : "bg-white text-indigo-600"
          }`}
          aria-label="Nová aktivita"
        >
          <Plus size={24} />
        </button>
      </div>

      {/* Agenda – timeline vlevo od kruhů (čára neprotíná ikony) */}
      <div>
        <h3
          className={`text-xs font-black uppercase tracking-widest mb-4 ${
            isDark ? "text-aidv-text-muted-on-dark" : "text-slate-400"
          }`}
        >
          Agenda
        </h3>
        <div
          className={`space-y-4 relative pl-4 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 ${
            isDark ? "before:bg-white/15" : "before:bg-slate-100"
          }`}
        >
          {loading ? (
            <p className={`text-sm pl-14 ${isDark ? "text-aidv-text-muted-on-dark" : "text-slate-500"}`}>Načítám…</p>
          ) : events.length === 0 ? (
            <p className={`text-sm pl-14 ${isDark ? "text-aidv-text-muted-on-dark" : "text-slate-500"}`}>Žádné nadcházející události.</p>
          ) : (
            events.map((ev) => {
              const start = new Date(ev.startAt);
              const typeId = ev.eventType ?? "schuzka";
              const color = eventTypeColors[typeId] ?? getEventCategory(typeId).color;
              const bgRgba = hexToRgba(color, 0.2);
              return (
                <Link
                  key={ev.id}
                  href="/portal/calendar"
                  className="relative flex items-center justify-between group"
                >
                  <div
                    className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-white shadow-sm z-10 transition-colors shrink-0 relative"
                    style={{ backgroundColor: bgRgba, color, borderColor: color }}
                  >
                    <EventIcon eventType={typeId} />
                  </div>
                  <div className="w-[calc(100%-3rem)] ml-4 p-4 rounded-2xl bg-white border border-slate-100 shadow-sm hover:border-indigo-200 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
                        {formatTimeShort(start)}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">{formatDateShort(start)}</span>
                    </div>
                    <h4 className="font-bold text-slate-800 text-sm">{ev.title}</h4>
                    <p className="text-xs font-medium text-slate-500 mt-1">{ev.contactName ?? "—"}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1">{getRelativeTime(start)}</p>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
