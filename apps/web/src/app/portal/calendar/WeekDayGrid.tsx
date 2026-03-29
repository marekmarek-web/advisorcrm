"use client";

import { useMemo, useCallback, useRef } from "react";
import { Plus, User } from "lucide-react";
import type { EventRow } from "@/app/actions/events";
import { DEFAULT_EVENT_DURATION_MS, formatDateLocal } from "./date-utils";
import { getEventStyle } from "./event-categories";
import { CurrentTimeLine } from "./CurrentTimeLine";
import { useCalendarPointerDrag } from "../mobile/screens/calendar/useCalendarPointerDrag";

/** 7:00–23:00, 60px per hour */
const START_HOUR = 7;
const END_HOUR = 24;
const PIXELS_PER_HOUR = 60;
const DRAG_MIME = "application/x-weplan-event-id";

function formatTime(d: Date): string {
  return d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

export interface WeekDayGridProps {
  mode: "day" | "week" | "workweek";
  weekDays: Date[];
  dayNames: string[];
  eventsByDate: Map<string, EventRow[]>;
  selectedDate: string;
  todayStr: string;
  todayStyle: string;
  firstDayOfWeek: 0 | 1;
  timeColWidth: number;
  onSlotClick: (dateStr: string, hour: number) => void;
  onEventClick: (
    event: EventRow,
    anchorRect?: { top: number; left: number; width: number; height: number },
  ) => void;
  /** Called when the main grid scrolls (e.g. close anchored popovers). */
  onGridScroll?: () => void;
  onDaySelect?: (dateStr: string) => void;
  selectedEventId: string | null;
  isMobile?: boolean;
  currentTimeLineColor?: string;
  currentTimeLineWidth?: number;
  /** Override grid range (default 8–18 from kalendar.txt) */
  startHour?: number;
  endHour?: number;
  pixelsPerHour?: number;
  /** Custom colors per event type (id → hex). When set, event blocks use inline backgroundColor/borderLeftColor. */
  eventTypeColors?: Record<string, string>;
  /** Přesun události v mřížce (den + začátek po 15 min). Celodenní události nelze táhnout. */
  onEventMove?: (eventId: string, targetDateStr: string, startMinutesFromMidnight: number) => void;
  onEventResize?: (eventId: string, targetDateStr: string, endMinutesFromMidnight: number) => void;
  onDragCreate?: (
    targetDateStr: string,
    startMinutesFromMidnight: number,
    endMinutesFromMidnight: number,
  ) => void;
}

const defaultStartHour = START_HOUR;
const defaultEndHour = END_HOUR;
const defaultPixelsPerHour = PIXELS_PER_HOUR;

export function WeekDayGrid({
  mode,
  weekDays,
  dayNames,
  eventsByDate,
  selectedDate,
  todayStr,
  todayStyle,
  firstDayOfWeek,
  timeColWidth,
  onSlotClick,
  onEventClick,
  onGridScroll,
  onDaySelect,
  selectedEventId,
  isMobile = false,
  currentTimeLineColor = "#f43f5e",
  currentTimeLineWidth = 2,
  startHour = defaultStartHour,
  endHour = defaultEndHour,
  pixelsPerHour = defaultPixelsPerHour,
  eventTypeColors,
  onEventMove,
  onEventResize,
  onDragCreate,
}: WeekDayGridProps) {
  const suppressClickEventIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayColumnRefs = useRef<Array<HTMLDivElement | null>>([]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => i + startHour),
    [startHour, endHour]
  );
  const totalHeight = (endHour - startHour) * pixelsPerHour;
  const todayColumnIndex = useMemo(() => {
    return weekDays.findIndex((d) => formatDateLocal(d) === todayStr);
  }, [weekDays, todayStr]);

  const handleSlotClick = useCallback(
    (dateStr: string, hour: number) => {
      onSlotClick(dateStr, hour);
    },
    [onSlotClick]
  );

  const handleColumnDragOver = useCallback((e: React.DragEvent) => {
    if (!onEventMove) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, [onEventMove]);

  const findEventById = useCallback(
    (eventId: string) => {
      for (const list of eventsByDate.values()) {
        const hit = list.find((x) => x.id === eventId);
        if (hit) return hit;
      }
      return undefined;
    },
    [eventsByDate]
  );

  const handleColumnDrop = useCallback(
    (e: React.DragEvent, targetDateStr: string) => {
      if (!onEventMove) return;
      e.preventDefault();
      const id = e.dataTransfer.getData(DRAG_MIME);
      if (!id) return;
      const moved = findEventById(id);
      if (!moved || moved.allDay) return;
      const s = new Date(moved.startAt);
      const en = moved.endAt ? new Date(moved.endAt) : new Date(s.getTime() + DEFAULT_EVENT_DURATION_MS);
      const durMin = Math.max(15, Math.ceil((en.getTime() - s.getTime()) / 60000 / 15) * 15);

      const col = e.currentTarget as HTMLElement;
      const rect = col.getBoundingClientRect();
      let y = e.clientY - rect.top;
      y = Math.max(0, Math.min(rect.height - 1, y));
      const minutesFromGridStart = (y / pixelsPerHour) * 60;
      let absoluteMin = startHour * 60 + minutesFromGridStart;
      absoluteMin = Math.round(absoluteMin / 15) * 15;
      const maxStartMin = Math.max(startHour * 60, endHour * 60 - durMin);
      const clamped = Math.min(Math.max(startHour * 60, absoluteMin), maxStartMin);
      suppressClickEventIdRef.current = id;
      window.setTimeout(() => {
        if (suppressClickEventIdRef.current === id) suppressClickEventIdRef.current = null;
      }, 200);
      onEventMove(id, targetDateStr, clamped);
    },
    [onEventMove, pixelsPerHour, startHour, endHour, findEventById]
  );

  const pointerDrag = useCalendarPointerDrag({
    visibleDays: weekDays,
    scrollRef,
    dayColumnRefs,
    startHour,
    endHour,
    pixelsPerHour,
    enabled: Boolean(onEventMove || onEventResize || onDragCreate),
    onEventMove,
    onEventResize,
    onDragCreate,
  });

  return (
    <div className="wp-cal-week-day-grid flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Sticky header – na mobilu kompaktnější */}
      <div className="flex border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/95 backdrop-blur-sm z-30 shrink-0 pr-1 sm:pr-2">
        <div className="flex-shrink-0 border-r border-[color:var(--wp-surface-card-border)]/50" style={{ width: timeColWidth }} aria-hidden />
        {weekDays.map((day) => {
          const ds = formatDateLocal(day);
          const isToday = ds === todayStr;
          const isSelected = ds === selectedDate;
          const dayIdx = firstDayOfWeek === 0 ? day.getDay() : (day.getDay() === 0 ? 6 : day.getDay() - 1);
          return (
            <div
              key={ds}
              className={`flex-1 flex flex-col items-center border-r border-[color:var(--wp-surface-card-border)]/50 last:border-0 relative ${isMobile ? "py-1.5" : "py-3"}`}
            >
              <span
                className={`font-black uppercase mb-0.5 ${isMobile ? "text-[9px] tracking-wider" : "text-[10px] tracking-widest"} ${isToday ? "text-indigo-600" : "text-[color:var(--wp-text-tertiary)]"}`}
              >
                {dayNames[dayIdx]}
              </span>
              <button
                type="button"
                onClick={() => onDaySelect?.(ds)}
                className={`font-medium flex items-center justify-center rounded-full ${isMobile ? "text-base w-7 h-7" : "text-xl w-9 h-9"} ${isToday ? "bg-indigo-600 text-white shadow-md" : "text-[color:var(--wp-text)]"}`}
              >
                {day.getDate()}
              </button>
            </div>
          );
        })}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto min-h-0 wp-cal-hide-scrollbar relative"
        onScroll={() => onGridScroll?.()}
      >
        <div
          className="flex min-h-[660px]"
          style={{
            display: "grid",
            gridTemplateColumns: `${timeColWidth}px repeat(${weekDays.length}, 1fr)`,
            minHeight: totalHeight,
          }}
        >
          {/* Time column – width from timeColWidth */}
          <div
            className="flex-shrink-0 border-r border-[color:var(--wp-surface-card-border)]/50 bg-[color:var(--wp-surface-card)] relative z-10"
            style={{ width: timeColWidth, height: totalHeight }}
          >
            {hours.map((h) => (
              <div
                key={h}
                className={`absolute right-1 sm:right-2 font-bold text-[color:var(--wp-text-tertiary)] ${isMobile ? "text-[9px]" : "text-[10px]"}`}
                style={{ top: (h - startHour) * pixelsPerHour - 10, height: pixelsPerHour }}
              >
                {h}:00
              </div>
            ))}
          </div>

          {/* Day columns: modern-grid bg + click cells + events */}
          {weekDays.map((day, dayIndex) => {
            const ds = formatDateLocal(day);
            const isToday = ds === todayStr;
            const isPast = ds < todayStr;
            const dayEvents = eventsByDate.get(ds) ?? [];
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinutes = now.getMinutes();

            return (
              <div
                key={ds}
                ref={(node) => {
                  dayColumnRefs.current[dayIndex] = node;
                }}
                className={`flex-1 border-r border-[color:var(--wp-surface-card-border)]/50 relative ${isPast ? "wp-cal-striped-past opacity-80" : ""}`}
                style={{ height: totalHeight }}
                onDragOver={onEventMove ? handleColumnDragOver : undefined}
                onDrop={onEventMove ? (e) => handleColumnDrop(e, ds) : undefined}
              >
                {/* Click-to-add: hour cells with hover + Plus; gray past hours in today column */}
                <div className="absolute inset-0 flex flex-col z-0 wp-cal-modern-grid">
                  {hours.map((h) => {
                    const isPastHour = isToday && (h < currentHour || (h === currentHour && currentMinutes >= 0));
                    return (
                      <div
                        key={h}
                        onClick={() => handleSlotClick(ds, h)}
                        onPointerDown={(event) => pointerDrag.onSlotPointerDown(event, ds)}
                        className={`border-b border-transparent hover:border-indigo-200 hover:bg-indigo-50/50 cursor-pointer transition-colors group/cell flex items-center pl-2 shrink-0 ${isPastHour ? "wp-cal-past-hour-today" : ""}`}
                        style={{ height: pixelsPerHour }}
                      >
                        <Plus size={14} className="text-indigo-400 opacity-0 group-hover/cell:opacity-100 shrink-0" />
                      </div>
                    );
                  })}
                </div>

                {/* Event blocks – kalendar.txt style with Tailwind */}
                {dayEvents.map((ev) => {
                  const start = new Date(ev.startAt);
                  const end = ev.endAt ? new Date(ev.endAt) : new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS);
                  const [yy, mm, dd] = ds.split("-").map(Number);
                  const dayStart = new Date(yy, mm - 1, dd, startHour, 0, 0, 0);
                  const topMin = (start.getTime() - dayStart.getTime()) / (60 * 1000);
                  const durationMin = (end.getTime() - start.getTime()) / (60 * 1000);
                  const topPx = topMin * (pixelsPerHour / 60);
                  const heightPx = Math.max(20, durationMin * (pixelsPerHour / 60));
                  const customColor = eventTypeColors?.[ev.eventType ?? ""];
                  const style = getEventStyle(ev.eventType, customColor);
                  const selected = selectedEventId === ev.id;
                  const useInlineColor = Boolean(customColor);

                  const draggable = Boolean(onEventMove && !ev.allDay);

                  return (
                    <button
                      key={ev.id}
                      type="button"
                      draggable={draggable}
                      onPointerDown={(event) => pointerDrag.onEventPointerDown(event, ev)}
                      onDragStart={
                        draggable
                          ? (e) => {
                              e.dataTransfer.setData(DRAG_MIME, ev.id);
                              e.dataTransfer.effectAllowed = "move";
                            }
                          : undefined
                      }
                      className={`absolute left-1.5 right-1.5 rounded-xl border border-l-[3px] p-2.5 text-left transition-all duration-200 overflow-hidden touch-manipulation
                        ${useInlineColor ? "text-gray-800 border-gray-300" : style.tailwindClass}
                        ${selected ? "ring-2 ring-indigo-400 ring-offset-1 shadow-lg scale-[1.02] z-30" : "hover:shadow-md hover:scale-[1.01] z-10"}
                        ${draggable ? "active:cursor-grabbing cursor-grab" : ""}
                        ${pointerDrag.activeEventId === ev.id ? "opacity-40" : ""}
                      `}
                      style={{
                        top: topPx,
                        height: heightPx,
                        minHeight: 20,
                        ...(useInlineColor ? { backgroundColor: style.color, borderLeftColor: style.color } : {}),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (
                          suppressClickEventIdRef.current === ev.id ||
                          pointerDrag.suppressClickEventId === ev.id ||
                          pointerDrag.activeEventId === ev.id
                        ) {
                          suppressClickEventIdRef.current = null;
                          return;
                        }
                        const el = e.currentTarget as HTMLElement;
                        const r = el.getBoundingClientRect();
                        onEventClick(ev, { top: r.top, left: r.left, width: r.width, height: r.height });
                      }}
                      title={`${style.label}: ${ev.title}${ev.contactName ? ` – ${ev.contactName}` : ""} – ${formatTime(start)}`}
                    >
                      <h4 className="font-bold text-[13px] leading-tight truncate mb-0.5">{ev.title}</h4>
                      <div className="text-[10px] font-black uppercase tracking-wider opacity-70 mb-1">
                        {formatTime(start)}
                        {ev.endAt && ` – ${formatTime(end)}`}
                      </div>
                      {ev.contactName && heightPx > 60 && (
                        <div className="flex items-center gap-1.5 text-xs font-semibold opacity-90 truncate mt-2 bg-[color:var(--wp-surface-card)]/40 w-fit px-1.5 py-0.5 rounded">
                          <User size={10} /> {ev.contactName}
                        </div>
                      )}
                      <span
                        className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize touch-none"
                        onPointerDown={(event) => pointerDrag.onResizePointerDown(event, ev)}
                        aria-hidden
                      />
                    </button>
                  );
                })}
                {pointerDrag.preview?.dateStr === ds ? (
                  <div
                    className="pointer-events-none absolute left-1.5 right-1.5 z-20 rounded-xl border border-dashed border-indigo-300 bg-indigo-200/35 shadow-sm"
                    style={{
                      top: pointerDrag.preview.topPx,
                      height: Math.max(pointerDrag.preview.heightPx, 12),
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        <CurrentTimeLine
          startHour={startHour}
          pixelsPerHour={pixelsPerHour}
          viewDate={weekDays.length === 1 ? weekDays[0] : new Date(todayStr + "T12:00:00")}
          todayDate={new Date(todayStr + "T12:00:00")}
          dayColumnCount={weekDays.length}
          todayColumnIndex={todayColumnIndex}
          showBadge={!isMobile}
          color={currentTimeLineColor}
          width={currentTimeLineWidth}
        />
      </div>
    </div>
  );
}
