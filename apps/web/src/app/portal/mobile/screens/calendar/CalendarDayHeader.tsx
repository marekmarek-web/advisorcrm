"use client";

import type { CSSProperties } from "react";
import { formatDateLocal } from "@/app/portal/calendar/date-utils";
import type { CalendarFontSize, TodayStyle } from "@/app/portal/calendar/calendar-settings";
import { getCalendarGridFontClasses } from "@/app/portal/calendar/calendar-grid-font";
import { dayIndexForHeader, getDayNames } from "./calendar-utils";

const DEFAULT_ACCENT = "#485fed";
const DEFAULT_ACCENT_LIGHT = "rgba(72, 95, 237, 0.12)";

function normalizeAccent(hex: string | null | undefined): string {
  const t = hex?.trim();
  if (!t) return DEFAULT_ACCENT;
  return t.startsWith("#") ? t : `#${t}`;
}

export function CalendarDayHeader({
  weekDays,
  todayStr,
  firstDayOfWeek,
  timeColWidth,
  compact,
  onSelectDay,
  fontSize,
  accent,
  accentLight,
  todayStyle,
}: {
  weekDays: Date[];
  todayStr: string;
  firstDayOfWeek: 0 | 1;
  timeColWidth: number;
  compact: boolean;
  onSelectDay?: (day: Date) => void;
  fontSize?: CalendarFontSize | null;
  accent?: string | null;
  accentLight?: string | null;
  todayStyle?: TodayStyle | null;
}) {
  const dayNames = getDayNames(firstDayOfWeek);
  const fc = getCalendarGridFontClasses(fontSize, compact);
  const safeAccent = normalizeAccent(accent);
  const safeAccentLight = accentLight?.trim() || DEFAULT_ACCENT_LIGHT;
  const ts: TodayStyle = todayStyle ?? "pill";

  return (
    <div className="flex shrink-0 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm">
      <div className="shrink-0 border-r border-[color:var(--wp-surface-card-border)]" style={{ width: timeColWidth }} aria-hidden />
      {weekDays.map((day) => {
        const ds = formatDateLocal(day);
        const isToday = ds === todayStr;
        const isWeekend = day.getDay() === 0 || day.getDay() === 6;
        const idx = dayIndexForHeader(day, firstDayOfWeek);

        const cellStyle: CSSProperties | undefined =
          isToday && ts === "background" ? { backgroundColor: safeAccentLight } : undefined;

        let dayNumClass = `flex items-center justify-center font-bold ${fc.dayNumberBox} ${fc.dayNumberText}`;
        let dayNumStyle: CSSProperties | undefined;

        if (isToday) {
          if (ts === "underline") {
            dayNumClass += " border-b-[3px] bg-transparent text-[color:var(--wp-text)]";
            dayNumStyle = { borderBottomColor: safeAccent };
          } else if (ts === "background") {
            dayNumClass += " rounded-lg text-[color:var(--wp-text)]";
            dayNumStyle = { boxShadow: `0 0 0 2px ${safeAccent}` };
          } else {
            dayNumClass += " rounded-full text-white shadow-md";
            dayNumStyle = { backgroundColor: safeAccent };
          }
        } else {
          dayNumClass += " rounded-full text-[color:var(--wp-text-secondary)]";
        }

        const inner = (
          <>
            <span
              className={`mb-1 font-black uppercase tracking-widest ${fc.dayName} ${
                isToday ? "" : "text-[color:var(--wp-text-tertiary)]"
              }`}
              style={isToday ? { color: safeAccent } : undefined}
            >
              {dayNames[idx]}
            </span>
            <div className={dayNumClass} style={dayNumStyle}>
              {day.getDate()}
            </div>
          </>
        );

        const tapClass =
          "flex min-h-[48px] w-full flex-col items-center justify-center rounded-lg transition-colors active:opacity-90";

        return (
          <div
            key={ds}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center border-r border-[color:var(--wp-surface-card-border)] py-2 last:border-r-0 ${
              isWeekend ? "bg-[color:var(--wp-surface-muted)]/50" : "bg-[color:var(--wp-surface-card)]"
            }`}
            style={cellStyle}
          >
            {onSelectDay ? (
              <button type="button" onClick={() => onSelectDay(day)} className={tapClass} aria-label={`Přejít na ${ds}`}>
                {inner}
              </button>
            ) : (
              inner
            )}
          </div>
        );
      })}
    </div>
  );
}
