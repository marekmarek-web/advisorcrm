"use client";

import { useState, useEffect, useMemo } from "react";

export interface CurrentTimeLineProps {
  /** First hour shown in the grid (e.g. 7) */
  startHour: number;
  /** Pixel height per hour in the grid */
  pixelsPerHour: number;
  /** Date of the grid column we're rendering into (for day view) or null for week view (show in today column) */
  viewDate: Date;
  /** For week view: which date is "today" so we only show line in that column */
  todayDate: Date;
  /** Line color (default red) */
  color?: string;
  /** Line width in px */
  width?: number;
  /** Show "Teď HH:mm" badge */
  showBadge?: boolean;
  /** Number of day columns (1 for day view, 5 or 7 for week) */
  dayColumnCount: number;
  /** Index of today's column (0-based) when dayColumnCount > 1; -1 to hide line */
  todayColumnIndex: number;
  /** Ref from parent scroll container for sticky; not required for absolute positioning */
  className?: string;
}

function formatNow(d: Date): string {
  return d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

export function CurrentTimeLine({
  startHour,
  pixelsPerHour,
  viewDate,
  todayDate,
  color = "#e5534b",
  width = 2,
  showBadge = true,
  dayColumnCount,
  todayColumnIndex,
  className = "",
}: CurrentTimeLineProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const isDayView = dayColumnCount === 1;
  const viewDateStr = formatDate(viewDate);
  const todayStr = formatDate(todayDate);
  const nowStr = formatDate(now);

  const showInDayView = isDayView && viewDateStr === todayStr;
  const showInWeekView = !isDayView && todayColumnIndex >= 0;
  const visible = showInDayView || showInWeekView;

  const topPx = useMemo(() => {
    const startOfDay = new Date(now);
    startOfDay.setHours(startHour, 0, 0, 0);
    if (now < startOfDay) return -width;
    const minutesFromStart = (now.getHours() - startHour) * 60 + now.getMinutes();
    return minutesFromStart * (pixelsPerHour / 60);
  }, [now, startHour, pixelsPerHour, width]);

  if (!visible) return null;

  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    top: topPx,
    left: 0,
    right: 0,
    height: width,
    zIndex: 10,
    pointerEvents: "none",
  };

  const lineStyle: React.CSSProperties = {
    position: "absolute",
    left: isDayView ? 0 : `calc(${(100 / dayColumnCount) * todayColumnIndex}% + 0px)`,
    width: isDayView ? "100%" : `calc(${100 / dayColumnCount}% - 0px)`,
    top: 0,
    height: width,
    backgroundColor: color,
    borderRadius: width / 2,
    boxShadow: `0 0 0 1px rgba(0,0,0,0.06)`,
  };

  return (
    <div className={`wp-cal-current-time ${className}`} style={wrapperStyle} aria-hidden>
      <div style={lineStyle} />
      {showBadge && (
        <div
          className="wp-cal-current-time-badge"
          style={{
            position: "absolute",
            left: isDayView ? 4 : `calc(${(100 / dayColumnCount) * todayColumnIndex}% + 4px)`,
            top: -12,
            fontSize: 10,
            fontWeight: 600,
            color,
            background: "var(--wp-surface)",
            padding: "2px 6px",
            borderRadius: 4,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            whiteSpace: "nowrap",
          }}
        >
          Teď {formatNow(now)}
        </div>
      )}
    </div>
  );
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
