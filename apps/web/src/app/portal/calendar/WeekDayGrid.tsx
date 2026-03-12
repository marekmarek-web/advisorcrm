"use client";

import { useMemo, useCallback } from "react";
import { Plus, User } from "lucide-react";
import type { EventRow } from "@/app/actions/events";
import { getEventStyle } from "./event-categories";
import { CurrentTimeLine } from "./CurrentTimeLine";

/** Kalendar.txt: 8:00–18:00, 60px per hour */
const START_HOUR = 8;
const END_HOUR = 19;
const PIXELS_PER_HOUR = 60;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR);

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

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
  onEventClick: (event: EventRow) => void;
  onDaySelect?: (dateStr: string) => void;
  selectedEventId: string | null;
  isMobile?: boolean;
  currentTimeLineColor?: string;
  currentTimeLineWidth?: number;
  /** Override grid range (default 8–18 from kalendar.txt) */
  startHour?: number;
  endHour?: number;
  pixelsPerHour?: number;
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
  onDaySelect,
  selectedEventId,
  isMobile = false,
  currentTimeLineColor = "#f43f5e",
  currentTimeLineWidth = 2,
  startHour = defaultStartHour,
  endHour = defaultEndHour,
  pixelsPerHour = defaultPixelsPerHour,
}: WeekDayGridProps) {
  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => i + startHour),
    [startHour, endHour]
  );
  const totalHeight = (endHour - startHour) * pixelsPerHour;
  const todayColumnIndex = useMemo(() => {
    return weekDays.findIndex((d) => formatDate(d) === todayStr);
  }, [weekDays, todayStr]);

  const handleSlotClick = useCallback(
    (dateStr: string, hour: number) => {
      onSlotClick(dateStr, hour);
    },
    [onSlotClick]
  );

  return (
    <div className="wp-cal-week-day-grid flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Sticky header – kalendar.txt style: PO/ÚT + date, today = indigo circle */}
      <div className="flex border-b border-slate-100 bg-white/95 backdrop-blur-sm z-30 shrink-0 pr-2">
        <div className="w-[60px] flex-shrink-0 border-r border-slate-50" aria-hidden />
        {weekDays.map((day) => {
          const ds = formatDate(day);
          const isToday = ds === todayStr;
          const isSelected = ds === selectedDate;
          const dayIdx = firstDayOfWeek === 0 ? day.getDay() : (day.getDay() === 0 ? 6 : day.getDay() - 1);
          return (
            <div
              key={ds}
              className="flex-1 flex flex-col items-center py-3 border-r border-slate-50 last:border-0 relative"
            >
              <span
                className={`text-[10px] font-black tracking-widest uppercase mb-1 ${isToday ? "text-indigo-600" : "text-slate-400"}`}
              >
                {dayNames[dayIdx]}
              </span>
              <button
                type="button"
                onClick={() => onDaySelect?.(ds)}
                className={`text-xl font-medium ${isToday ? "bg-indigo-600 text-white w-9 h-9 flex items-center justify-center rounded-full shadow-md" : "text-slate-800"}`}
              >
                {day.getDate()}
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto min-h-0 wp-cal-hide-scrollbar relative">
        <div
          className="flex min-h-[660px]"
          style={{
            display: "grid",
            gridTemplateColumns: `${timeColWidth}px repeat(${weekDays.length}, 1fr)`,
            minHeight: totalHeight,
          }}
        >
          {/* Time column – 60px, labels at top-right of each hour */}
          <div
            className="w-[60px] flex-shrink-0 border-r border-slate-50 bg-white relative z-10"
            style={{ height: totalHeight }}
          >
            {hours.map((h) => (
              <div
                key={h}
                className="absolute right-2 text-[10px] font-bold text-slate-400"
                style={{ top: (h - startHour) * pixelsPerHour - 10, height: pixelsPerHour }}
              >
                {h}:00
              </div>
            ))}
          </div>

          {/* Day columns: modern-grid bg + click cells + events */}
          {weekDays.map((day) => {
            const ds = formatDate(day);
            const isToday = ds === todayStr;
            const isPast = ds < todayStr;
            const dayEvents = eventsByDate.get(ds) ?? [];

            return (
              <div
                key={ds}
                className={`flex-1 border-r border-slate-50 relative ${isPast ? "wp-cal-striped-past opacity-80" : ""}`}
                style={{ height: totalHeight }}
              >
                {/* Click-to-add: hour cells with hover + Plus */}
                <div className="absolute inset-0 flex flex-col z-0 wp-cal-modern-grid">
                  {hours.map((h) => (
                    <div
                      key={h}
                      onClick={() => handleSlotClick(ds, h)}
                      className="border-b border-transparent hover:border-indigo-200 hover:bg-indigo-50/50 cursor-pointer transition-colors group/cell flex items-center pl-2 shrink-0"
                      style={{ height: pixelsPerHour }}
                    >
                      <Plus size={14} className="text-indigo-400 opacity-0 group-hover/cell:opacity-100 shrink-0" />
                    </div>
                  ))}
                </div>

                {/* Event blocks – kalendar.txt style with Tailwind */}
                {dayEvents.map((ev) => {
                  const start = new Date(ev.startAt);
                  const end = ev.endAt ? new Date(ev.endAt) : new Date(start.getTime() + 60 * 60 * 1000);
                  const dayStart = new Date(ev.startAt);
                  dayStart.setHours(startHour, 0, 0, 0);
                  const topMin = (start.getTime() - dayStart.getTime()) / (60 * 1000);
                  const durationMin = (end.getTime() - start.getTime()) / (60 * 1000);
                  const topPx = topMin * (pixelsPerHour / 60);
                  const heightPx = Math.max(20, durationMin * (pixelsPerHour / 60));
                  const style = getEventStyle(ev.eventType);
                  const selected = selectedEventId === ev.id;

                  return (
                    <button
                      key={ev.id}
                      type="button"
                      className={`absolute left-1.5 right-1.5 rounded-xl p-2.5 border border-l-[3px] cursor-pointer transition-all duration-200 overflow-hidden text-left
                        ${style.tailwindClass}
                        ${selected ? "ring-2 ring-indigo-400 ring-offset-1 shadow-lg scale-[1.02] z-30" : "hover:shadow-md hover:scale-[1.01] z-10"}
                      `}
                      style={{ top: topPx, height: heightPx, minHeight: 20 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(ev);
                      }}
                      title={`${style.label}: ${ev.title}${ev.contactName ? ` – ${ev.contactName}` : ""} – ${formatTime(start)}`}
                    >
                      <h4 className="font-bold text-[13px] leading-tight truncate mb-0.5">{ev.title}</h4>
                      <div className="text-[10px] font-black uppercase tracking-wider opacity-70 mb-1">
                        {formatTime(start)}
                        {ev.endAt && ` – ${formatTime(end)}`}
                      </div>
                      {ev.contactName && heightPx > 60 && (
                        <div className="flex items-center gap-1.5 text-xs font-semibold opacity-90 truncate mt-2 bg-white/40 w-fit px-1.5 py-0.5 rounded">
                          <User size={10} /> {ev.contactName}
                        </div>
                      )}
                    </button>
                  );
                })}
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
