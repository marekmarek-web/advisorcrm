"use client";

import { useCallback, useEffect, useState } from "react";
import { loadCalendarSettings, type CalendarSettings } from "@/app/portal/calendar/calendar-settings";
import type { CalendarViewMode } from "./calendar-utils";
import { navigateAnchor, startOfDayLocal } from "./calendar-utils";

function initialViewMode(): CalendarViewMode {
  return "day";
}

export function useCalendarState() {
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  useEffect(() => {
    setSettings(loadCalendarSettings());
  }, []);

  const [view, setView] = useState<CalendarViewMode>(initialViewMode);

  const [anchorDate, setAnchorDate] = useState(() => startOfDayLocal(new Date()));

  const firstDayOfWeek: 0 | 1 = settings?.firstDayOfWeek === 0 ? 0 : 1;

  const goPrev = useCallback(() => {
    setAnchorDate((d) => navigateAnchor(d, view, -1));
  }, [view]);

  const goNext = useCallback(() => {
    setAnchorDate((d) => navigateAnchor(d, view, 1));
  }, [view]);

  const goToday = useCallback(() => {
    setAnchorDate(startOfDayLocal(new Date()));
  }, []);

  return {
    view,
    setView,
    anchorDate,
    setAnchorDate,
    firstDayOfWeek,
    settings,
    setSettings,
    goPrev,
    goNext,
    goToday,
  };
}
