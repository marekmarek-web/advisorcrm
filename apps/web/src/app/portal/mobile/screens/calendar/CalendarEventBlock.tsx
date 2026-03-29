"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
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
  fontTitleClass,
  fontMetaClass,
  isDragging,
  suppressClick,
  onClick,
  onPointerDown,
  onResizePointerDown,
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
  /** From calendar settings (`getCalendarGridFontClasses`). */
  fontTitleClass?: string;
  fontMetaClass?: string;
  isDragging?: boolean;
  suppressClick?: boolean;
  onClick: () => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizePointerDown?: (event: ReactPointerEvent<HTMLSpanElement>) => void;
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
        if (suppressClick || isDragging) return;
        onClick();
      }}
      onPointerDown={onPointerDown}
      className={`absolute z-10 overflow-hidden rounded-lg border border-l-[3px] p-1 text-left shadow-sm transition-transform active:scale-[0.97] ${
        useInlineColor ? "border-[color:var(--wp-border-strong)] text-[color:var(--wp-text)]" : style.tailwindClass
      } ${isSelected ? "z-30 ring-2 ring-[color:var(--cal-accent)] ring-offset-1" : ""} ${isDragging ? "opacity-40" : ""}`}
      style={{
        top: topPx + 1,
        height: Math.max(heightPx - 2, compact ? 18 : 20),
        minHeight: compact ? 18 : 20,
        ...horiz,
        ...(useInlineColor ? { backgroundColor: `${style.color}22`, borderLeftColor: style.color } : {}),
      }}
      title={`${style.label}: ${ev.title}`}
    >
      <h4
        className={`font-bold leading-tight line-clamp-2 ${fontTitleClass ?? (compact ? "text-[9px]" : "text-[10px]")}`}
      >
        {ev.title}
      </h4>
      {!compact ? (
        <div className={`mt-0.5 font-semibold opacity-80 ${fontMetaClass ?? "text-[9px]"}`}>
          {formatTime(start)}
          {ev.endAt ? ` – ${formatTime(end)}` : null}
        </div>
      ) : null}
      {showClient ? (
        <div
          className={`mt-0.5 flex items-center gap-0.5 truncate font-semibold opacity-90 ${fontMetaClass ?? "text-[9px]"}`}
        >
          <User size={9} className="shrink-0" />
          <span className="truncate">{ev.contactName}</span>
        </div>
      ) : null}
      <span
        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize touch-none"
        onPointerDown={onResizePointerDown}
        aria-hidden
      />
    </button>
  );
}

export function CalendarAllDayChips({
  events,
  columnDateStr,
  eventTypeColors,
  chipTextClass,
  onEventClick,
}: {
  events: EventRow[];
  columnDateStr: string;
  eventTypeColors?: Record<string, string>;
  chipTextClass?: string;
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
            className={`truncate rounded-md border border-l-[3px] px-1.5 py-0.5 text-left font-bold shadow-sm active:scale-[0.98] ${chipTextClass ?? "text-[9px]"} ${
              useInline ? "border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text)]" : style.tailwindClass
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
