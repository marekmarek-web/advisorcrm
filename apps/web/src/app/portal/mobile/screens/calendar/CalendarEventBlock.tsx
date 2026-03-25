"use client";

import { User } from "lucide-react";
import type { EventRow } from "@/app/actions/events";
import { formatDateLocal } from "@/app/portal/calendar/date-utils";
import { getEventStyle } from "@/app/portal/calendar/event-categories";

function formatTime(d: Date): string {
  return d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

export function CalendarEventBlock({
  ev,
  columnDateStr,
  startHour,
  endHour,
  pixelsPerHour,
  isSelected,
  eventTypeColors,
  compact,
  layoutLeftPct,
  layoutWidthPct,
  onClick,
}: {
  ev: EventRow;
  columnDateStr: string;
  startHour: number;
  endHour: number;
  pixelsPerHour: number;
  isSelected: boolean;
  eventTypeColors?: Record<string, string>;
  compact: boolean;
  /** Horizontal position in day column when overlapping events (0–100). */
  layoutLeftPct?: number;
  layoutWidthPct?: number;
  onClick: () => void;
}) {
  if (formatDateLocal(new Date(ev.startAt)) !== columnDateStr) return null;
  if (ev.allDay) return null;

  const start = new Date(ev.startAt);
  const end = ev.endAt ? new Date(ev.endAt) : new Date(start.getTime() + 60 * 60 * 1000);

  const dayStart = new Date(start);
  dayStart.setHours(startHour, 0, 0, 0);
  const topMin = (start.getTime() - dayStart.getTime()) / (60 * 1000);
  const durationMin = Math.max(15, (end.getTime() - start.getTime()) / (60 * 1000));
  let topPx = topMin * (pixelsPerHour / 60);
  const heightPx = Math.max(compact ? 18 : 22, durationMin * (pixelsPerHour / 60));

  const gridBottom = (endHour - startHour) * pixelsPerHour;
  if (topPx + heightPx > gridBottom) {
    topPx = Math.max(0, gridBottom - heightPx);
  }
  topPx = Math.max(0, topPx);

  const customColor = eventTypeColors?.[ev.eventType ?? ""];
  const style = getEventStyle(ev.eventType, customColor);
  const useInlineColor = Boolean(customColor);

  const showClient = Boolean(ev.contactName && heightPx >= (compact ? pixelsPerHour * 0.45 : pixelsPerHour * 0.55));

  const horiz =
    layoutLeftPct != null && layoutWidthPct != null
      ? { left: `${layoutLeftPct}%`, width: `calc(${layoutWidthPct}% - 4px)`, marginLeft: "2px" }
      : { left: "2px", right: "2px" };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`absolute z-10 overflow-hidden rounded-lg border border-l-[3px] p-1 text-left shadow-sm transition-transform active:scale-[0.97] ${
        useInlineColor ? "border-slate-300 text-slate-900" : style.tailwindClass
      } ${isSelected ? "ring-2 ring-indigo-500 ring-offset-1 z-30" : ""}`}
      style={{
        top: topPx + 1,
        height: Math.max(heightPx - 2, compact ? 18 : 20),
        minHeight: compact ? 18 : 20,
        ...horiz,
        ...(useInlineColor ? { backgroundColor: `${style.color}22`, borderLeftColor: style.color } : {}),
      }}
      title={`${style.label}: ${ev.title}`}
    >
      <h4 className={`font-bold leading-tight line-clamp-2 ${compact ? "text-[9px]" : "text-[10px]"}`}>{ev.title}</h4>
      {!compact ? (
        <div className="mt-0.5 text-[9px] font-semibold opacity-80">
          {formatTime(start)}
          {ev.endAt ? ` – ${formatTime(end)}` : null}
        </div>
      ) : null}
      {showClient ? (
        <div className="mt-0.5 flex items-center gap-0.5 truncate text-[9px] font-semibold opacity-90">
          <User size={9} className="shrink-0" />
          <span className="truncate">{ev.contactName}</span>
        </div>
      ) : null}
    </button>
  );
}

export function CalendarAllDayChips({
  events,
  columnDateStr,
  eventTypeColors,
  onEventClick,
}: {
  events: EventRow[];
  columnDateStr: string;
  eventTypeColors?: Record<string, string>;
  onEventClick: (ev: EventRow) => void;
}) {
  const allDay = events.filter(
    (ev) => ev.allDay && formatDateLocal(new Date(ev.startAt)) === columnDateStr,
  );
  if (allDay.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5 px-0.5 py-1">
      {allDay.map((ev) => {
        const custom = eventTypeColors?.[ev.eventType ?? ""];
        const style = getEventStyle(ev.eventType, custom);
        const useInline = Boolean(custom);
        return (
          <button
            key={ev.id}
            type="button"
            onClick={() => onEventClick(ev)}
            className={`truncate rounded-md border border-l-[3px] px-1.5 py-0.5 text-left text-[9px] font-bold shadow-sm active:scale-[0.98] ${
              useInline ? "border-slate-200 text-slate-900" : style.tailwindClass
            }`}
            style={
              useInline
                ? { backgroundColor: `${style.color}22`, borderLeftColor: style.color }
                : undefined
            }
          >
            {ev.title}
          </button>
        );
      })}
    </div>
  );
}
