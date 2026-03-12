"use client";

import { useMemo, useCallback } from "react";
import type { EventRow } from "@/app/actions/events";
import { getEventStyle } from "./event-categories";
import { CurrentTimeLine } from "./CurrentTimeLine";

const START_HOUR = 7;
const END_HOUR = 23;
const PIXELS_PER_HOUR = 56;
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
}

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
  currentTimeLineColor,
  currentTimeLineWidth,
}: WeekDayGridProps) {
  const totalHeight = (END_HOUR - START_HOUR) * PIXELS_PER_HOUR;
  const todayColumnIndex = useMemo(() => {
    const idx = weekDays.findIndex((d) => formatDate(d) === todayStr);
    return idx;
  }, [weekDays, todayStr]);

  const handleSlotClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, dateStr: string) => {
      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const minutesFromStart = (y / PIXELS_PER_HOUR) * 60;
      const hour = START_HOUR + Math.floor(minutesFromStart / 60);
      const clampedHour = Math.max(START_HOUR, Math.min(END_HOUR - 1, hour));
      onSlotClick(dateStr, clampedHour);
    },
    [onSlotClick]
  );

  return (
    <div className="wp-cal-week-day-grid flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Sticky header */}
      <div
        className="wp-cal-week-header shrink-0"
        style={{ gridTemplateColumns: `${timeColWidth}px repeat(${weekDays.length}, 1fr)` }}
      >
        <div className="wp-cal-week-time-label wp-cal-week-time-label--header" />
        {weekDays.map((day) => {
          const ds = formatDate(day);
          const isToday = ds === todayStr;
          const isSelected = ds === selectedDate;
          const dayIdx = firstDayOfWeek === 0 ? day.getDay() : (day.getDay() === 0 ? 6 : day.getDay() - 1);
          return (
            <button
              key={ds}
              type="button"
              onClick={() => onDaySelect?.(ds)}
              className={`wp-cal-week-day-header ${isToday ? `wp-cal-week-day-header--today wp-cal-week-day-header--today-${todayStyle}` : ""} ${isSelected ? "wp-cal-week-day-header--selected" : ""}`}
            >
              <span>{dayNames[dayIdx]}</span>
              <span className="wp-cal-week-day-number">{day.getDate()}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto min-h-0" style={{ position: "relative" }}>
        <div
          className="wp-cal-week-body"
          style={{
            display: "grid",
            gridTemplateColumns: `${timeColWidth}px repeat(${weekDays.length}, 1fr)`,
            minHeight: totalHeight,
          }}
        >
          {/* Time labels column */}
          <div className="wp-cal-week-time-col shrink-0" style={{ height: totalHeight, position: "relative" }}>
            {HOURS.map((h) => (
              <div
                key={h}
                className="wp-cal-week-time-label"
                style={{ position: "absolute", left: 0, right: 0, height: PIXELS_PER_HOUR, top: (h - START_HOUR) * PIXELS_PER_HOUR }}
              >
                <span>{isMobile ? String(h) : `${h}:00`}</span>
              </div>
            ))}
          </div>

          {/* Day columns with events */}
          {weekDays.map((day) => {
            const ds = formatDate(day);
            const isToday = ds === todayStr;
            const dayEvents = eventsByDate.get(ds) ?? [];

            return (
              <div
                key={ds}
                className={`wp-cal-week-day-col ${isToday ? `wp-cal-week-day-col--today wp-cal-week-day-col--today-${todayStyle}` : ""}`}
                style={{ height: totalHeight, position: "relative" }}
                onClick={(e) => handleSlotClick(e, ds)}
              >
                {dayEvents.map((ev) => {
                  const start = new Date(ev.startAt);
                  const end = ev.endAt ? new Date(ev.endAt) : new Date(start.getTime() + 60 * 60 * 1000);
                  const dayStart = new Date(ev.startAt);
                  dayStart.setHours(START_HOUR, 0, 0, 0);
                  const topMin = (start.getTime() - dayStart.getTime()) / (60 * 1000);
                  const durationMin = (end.getTime() - start.getTime()) / (60 * 1000);
                  const topPx = topMin * (PIXELS_PER_HOUR / 60);
                  const heightPx = Math.max(20, durationMin * (PIXELS_PER_HOUR / 60));
                  const style = getEventStyle(ev.eventType);

                  return (
                    <button
                      key={ev.id}
                      type="button"
                      className={`wp-cal-week-event ${style.calClass} ${selectedEventId === ev.id ? "wp-cal-week-event--selected" : ""}`}
                      style={{
                        position: "absolute",
                        left: 2,
                        right: 2,
                        top: topPx,
                        height: heightPx,
                        minHeight: 20,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(ev);
                      }}
                      title={`${style.label}: ${ev.title}${ev.contactName ? ` – ${ev.contactName}` : ""} – ${formatTime(start)}`}
                    >
                      <span className="wp-cal-week-event-time">{formatTime(start)}</span>
                      <span className="wp-cal-week-event-icon">{style.icon}</span>
                      <span className="wp-cal-week-event-title">
                        {ev.title}
                        {ev.contactName && <span className="wp-cal-week-event-contact"> · {ev.contactName}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Current time line overlay */}
        <CurrentTimeLine
          startHour={START_HOUR}
          pixelsPerHour={PIXELS_PER_HOUR}
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
