"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { listEvents, type EventRow } from "@/app/actions/events";
import {
  buildEventsByDate,
  computeFetchRange,
  getVisibleDays,
  type CalendarViewMode,
} from "./calendar-utils";

export function useCalendarEvents(
  anchorDate: Date,
  view: CalendarViewMode,
  firstDayOfWeek: 0 | 1,
) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const visibleDays = useMemo(
    () => getVisibleDays(anchorDate, view, firstDayOfWeek),
    [anchorDate, view, firstDayOfWeek],
  );

  const { startIso, endIso } = useMemo(() => computeFetchRange(visibleDays), [visibleDays]);

  const reload = useCallback(() => {
    startTransition(async () => {
      setError(null);
      try {
        const rows = await listEvents({ start: startIso, end: endIso });
        setEvents(rows);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kalendář se nepodařilo načíst.");
        setEvents([]);
      }
    });
  }, [startIso, endIso]);

  useEffect(() => {
    reload();
  }, [reload]);

  const eventsByDate = useMemo(() => buildEventsByDate(events), [events]);

  return {
    events,
    eventsByDate,
    visibleDays,
    loading: isPending && events.length === 0,
    refreshing: isPending && events.length > 0,
    error,
    reload,
  };
}
