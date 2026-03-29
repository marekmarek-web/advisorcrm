"use client";

import { User } from "lucide-react";
import type { EventRow } from "@/app/actions/events";
import { formatDateLocal } from "@/app/portal/calendar/date-utils";
import { getEventStyle } from "@/app/portal/calendar/event-categories";
import type { CalendarSettings } from "@/app/portal/calendar/calendar-settings";
import { MONTH_NAMES } from "./calendar-utils";

function formatTimeShort(d: Date): string {
  return d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

function dayHeading(d: Date, todayStr: string): string {
  const ds = formatDateLocal(d);
  const w = d.toLocaleDateString("cs-CZ", { weekday: "long" });
  if (ds === todayStr) return `Dnes · ${d.getDate()}. ${MONTH_NAMES[d.getMonth()]}`;
  return `${w.charAt(0).toUpperCase() + w.slice(1)} · ${d.getDate()}. ${MONTH_NAMES[d.getMonth()]}`;
}

export function CalendarAgendaView({
  visibleDays,
  eventsByDate,
  todayStr,
  selectedEventId,
  settings,
  onEventClick,
}: {
  visibleDays: Date[];
  eventsByDate: Map<string, EventRow[]>;
  todayStr: string;
  selectedEventId: string | null;
  settings: CalendarSettings | null;
  onEventClick: (ev: EventRow) => void;
}) {
  const eventTypeColors = settings?.eventTypeColors;
  const fontClass =
    settings?.fontSize === "small"
      ? "text-xs"
      : settings?.fontSize === "large"
        ? "text-base"
        : "text-sm";

  const dayHeadingClass =
    settings?.fontSize === "small"
      ? "text-[9px]"
      : settings?.fontSize === "large"
        ? "text-xs"
        : "text-[10px]";

  const hasAny = visibleDays.some((d) => (eventsByDate.get(formatDateLocal(d)) ?? []).length > 0);

  if (!hasAny) {
    return (
      <div
        className="flex min-h-[200px] flex-1 flex-col items-center justify-center px-6 pb-24 text-center"
        style={{ maxHeight: "min(720px, calc(100dvh - 220px))" }}
      >
        <p className="text-sm font-bold text-[color:var(--wp-text-secondary)]">Žádné události v tomto týdnu</p>
        <p className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">Zkuste jiné období nebo přidejte aktivitu.</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto px-2 pb-24 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ maxHeight: "min(720px, calc(100dvh - 220px))" }}
    >
      <div className="space-y-5 py-2">
        {visibleDays.map((day) => {
          const ds = formatDateLocal(day);
          const list = eventsByDate.get(ds) ?? [];
          if (list.length === 0) return null;
          const sorted = [...list].sort(
            (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
          );
          return (
            <section key={ds}>
              <h3
                className={`sticky top-0 z-[1] mb-2 bg-[color:var(--wp-surface-card)]/95 py-1 font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] backdrop-blur-sm ${dayHeadingClass}`}
              >
                {dayHeading(day, todayStr)}
              </h3>
              <ul className="space-y-2">
                {sorted.map((ev) => {
                  const custom = eventTypeColors?.[ev.eventType ?? ""];
                  const style = getEventStyle(ev.eventType, custom);
                  const useInline = Boolean(custom);
                  const start = new Date(ev.startAt);
                  const end = ev.endAt ? new Date(ev.endAt) : null;
                  const timeLabel = ev.allDay
                    ? "Celý den"
                    : end
                      ? `${formatTimeShort(start)} – ${formatTimeShort(end)}`
                      : formatTimeShort(start);
                  return (
                    <li key={ev.id}>
                      <button
                        type="button"
                        onClick={() => onEventClick(ev)}
                        className={`flex w-full min-h-[52px] items-start gap-3 rounded-2xl border border-l-[4px] p-3 text-left shadow-sm transition-transform active:scale-[0.99] ${
                          useInline ? "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)]" : style.tailwindClass
                        } ${selectedEventId === ev.id ? "ring-2 ring-indigo-500 ring-offset-1" : ""}`}
                        style={
                          useInline
                            ? { borderLeftColor: style.color, backgroundColor: `${style.color}18` }
                            : undefined
                        }
                      >
                        <div className={`shrink-0 font-bold text-[color:var(--wp-text-secondary)] ${fontClass}`}>{timeLabel}</div>
                        <div className="min-w-0 flex-1">
                          <p className={`font-black text-[color:var(--wp-text)] ${fontClass} line-clamp-2`}>{ev.title}</p>
                          {ev.contactName ? (
                            <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-semibold text-[color:var(--wp-text-secondary)]">
                              <User size={12} className="shrink-0" />
                              <span className="truncate">{ev.contactName}</span>
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-lg" aria-hidden>
                          {style.icon}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
