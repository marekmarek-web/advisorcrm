"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { EventRow } from "@/app/actions/events";
import { formatDateLocal } from "@/app/portal/calendar/date-utils";
import type { CalendarSettings } from "@/app/portal/calendar/calendar-settings";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";
import {
  DEFAULT_END_HOUR_PHONE,
  DEFAULT_END_HOUR_TABLET,
  DEFAULT_START_HOUR,
} from "./calendar-utils";
import { CalendarAllDayChips, CalendarEventBlock } from "./CalendarEventBlock";
import { CalendarCurrentTimeLine } from "./CalendarCurrentTimeLine";
import { CalendarDayHeader } from "./CalendarDayHeader";
import { layoutTimedOverlaps } from "./event-overlap-layout";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function CalendarTimeGrid({
  visibleDays,
  eventsByDate,
  todayStr,
  firstDayOfWeek,
  deviceClass,
  settings,
  selectedEventId,
  onSlotClick,
  onEventClick,
  onSelectDay,
  scrollSignal,
}: {
  visibleDays: Date[];
  eventsByDate: Map<string, EventRow[]>;
  todayStr: string;
  firstDayOfWeek: 0 | 1;
  deviceClass: DeviceClass;
  settings: CalendarSettings | null;
  selectedEventId: string | null;
  onSlotClick: (dateStr: string, hour: number) => void;
  onEventClick: (ev: EventRow) => void;
  onSelectDay?: (day: Date) => void;
  scrollSignal: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const startHour = DEFAULT_START_HOUR;
  const endHour = deviceClass === "phone" ? DEFAULT_END_HOUR_PHONE : DEFAULT_END_HOUR_TABLET;
  const pixelsPerHour =
    deviceClass === "phone" && visibleDays.length >= 7 ? 50 : deviceClass === "phone" ? 64 : 70;
  const timeColWidth = deviceClass === "phone" ? 44 : 52;
  const compact = visibleDays.length >= 5;

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => i + startHour),
    [startHour, endHour],
  );
  const totalHeight = (endHour - startHour) * pixelsPerHour;

  const todayColumnIndex = useMemo(() => {
    return visibleDays.findIndex((d) => formatDateLocal(d) === todayStr);
  }, [visibleDays, todayStr]);

  const eventTypeColors = settings?.eventTypeColors;
  const lineColor = settings?.currentTimeLineColor ?? "#e5534b";
  const lineWidth = settings?.currentTimeLineWidth ?? 2;

  const scrollToNow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const now = new Date();
    const minutesFromStart = (now.getHours() - startHour) * 60 + now.getMinutes();
    if (minutesFromStart < 0) {
      el.scrollTop = 0;
      return;
    }
    const y = minutesFromStart * (pixelsPerHour / 60) - pixelsPerHour;
    el.scrollTop = Math.max(0, y);
  }, [startHour, pixelsPerHour]);

  useEffect(() => {
    scrollToNow();
  }, [scrollSignal, scrollToNow, visibleDays.length]);

  const handleSlotClick = useCallback(
    (dateStr: string, hour: number) => {
      onSlotClick(dateStr, hour);
    },
    [onSlotClick],
  );

  const hasAnyAllDay = useMemo(() => {
    for (const day of visibleDays) {
      const ds = formatDateLocal(day);
      const list = eventsByDate.get(ds) ?? [];
      if (list.some((e) => e.allDay)) return true;
    }
    return false;
  }, [visibleDays, eventsByDate]);

  const gridLineStyle = useMemo(
    () => ({
      backgroundImage: "linear-gradient(to bottom, #f1f5f9 1px, transparent 1px)",
      backgroundSize: `100% ${pixelsPerHour}px`,
    }),
    [pixelsPerHour],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      {hasAnyAllDay ? (
        <div className="flex shrink-0 border-b border-slate-200 bg-slate-50/40">
          <div className="shrink-0 border-r border-slate-100" style={{ width: timeColWidth }} />
          {visibleDays.map((day) => {
            const ds = formatDateLocal(day);
            const list = eventsByDate.get(ds) ?? [];
            return (
              <div key={ds} className="min-h-[32px] min-w-0 flex-1 border-r border-slate-100 last:border-r-0">
                <CalendarAllDayChips
                  events={list}
                  columnDateStr={ds}
                  eventTypeColors={eventTypeColors}
                  onEventClick={onEventClick}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      <CalendarDayHeader
        weekDays={visibleDays}
        todayStr={todayStr}
        firstDayOfWeek={firstDayOfWeek}
        timeColWidth={timeColWidth}
        compact={compact}
        onSelectDay={onSelectDay}
      />

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maxHeight: "min(720px, calc(100dvh - 240px))" }}
      >
        <div className="flex" style={{ minHeight: totalHeight }}>
          <div
            className="relative z-10 shrink-0 border-r border-slate-100 bg-white"
            style={{ width: timeColWidth, height: totalHeight }}
          >
            {hours.map((h) => (
              <div key={h} className="relative" style={{ height: pixelsPerHour }}>
                <span
                  className={cx(
                    "absolute -top-2.5 font-bold text-slate-400",
                    compact ? "right-1 text-[9px]" : "right-2 text-[10px]",
                  )}
                >
                  {h}:00
                </span>
              </div>
            ))}
          </div>

          <div className="relative min-h-0 min-w-0 flex-1" style={{ minHeight: totalHeight }}>
            <div className="flex h-full min-h-[inherit]">
              {visibleDays.map((day) => {
                const ds = formatDateLocal(day);
                const isToday = ds === todayStr;
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                const dayEvents = eventsByDate.get(ds) ?? [];
                const overlap = layoutTimedOverlaps(dayEvents, ds);
                const now = new Date();
                const currentHour = now.getHours();

                return (
                  <div
                    key={ds}
                    className={cx(
                      "relative min-w-0 flex-1 border-r border-slate-100 last:border-r-0",
                      isWeekend ? "bg-slate-50/40" : "bg-white",
                    )}
                    style={{ height: totalHeight }}
                  >
                    <div
                      className="absolute inset-0 z-0 flex flex-col opacity-90"
                      style={gridLineStyle}
                    >
                      {hours.map((h) => {
                        const isPastHour = isToday && h < currentHour;
                        return (
                          <button
                            key={h}
                            type="button"
                            onClick={() => handleSlotClick(ds, h)}
                            className={cx(
                              "w-full shrink-0 border-b border-slate-100/80 transition-colors active:bg-indigo-50/60",
                              isPastHour ? "bg-slate-50/30" : "",
                            )}
                            style={{ height: pixelsPerHour }}
                            aria-label={`Nová událost ${ds} v ${h}:00`}
                          />
                        );
                      })}
                    </div>

                    {dayEvents.map((ev) => {
                      const pos = overlap.get(ev.id);
                      return (
                        <CalendarEventBlock
                          key={ev.id}
                          ev={ev}
                          columnDateStr={ds}
                          startHour={startHour}
                          endHour={endHour}
                          pixelsPerHour={pixelsPerHour}
                          isSelected={selectedEventId === ev.id}
                          eventTypeColors={eventTypeColors}
                          compact={compact}
                          layoutLeftPct={pos?.leftPct}
                          layoutWidthPct={pos?.widthPct}
                          onClick={() => onEventClick(ev)}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <CalendarCurrentTimeLine
              deviceClass={deviceClass}
              startHour={startHour}
              pixelsPerHour={pixelsPerHour}
              viewDate={visibleDays.length === 1 ? visibleDays[0]! : new Date(`${todayStr}T12:00:00`)}
              todayDate={new Date(`${todayStr}T12:00:00`)}
              dayColumnCount={visibleDays.length}
              todayColumnIndex={todayColumnIndex}
              color={lineColor}
              width={lineWidth}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
