"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ContactRow } from "@/app/actions/contacts";
import {
  createEvent,
  createFollowUp,
  deleteEvent,
  getEvent,
  updateEvent,
  type EventRow,
} from "@/app/actions/events";
import { getOpenOpportunitiesList } from "@/app/actions/pipeline";
import {
  DEFAULT_EVENT_DURATION_MS,
  formatDateLocal,
  formatDateTimeLocal,
  localDateTimeInputToUtcIso,
  reminderIsoBeforeStartUtc,
} from "@/app/portal/calendar/date-utils";
import { formatDisplayDateCs } from "@/lib/date/format-display-cs";
import {
  DEFAULT_SETTINGS,
  saveCalendarSettings,
} from "@/app/portal/calendar/calendar-settings";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";
import {
  BottomSheet,
  ErrorState,
  MobileCard,
  Toast,
  useToast,
} from "@/app/shared/mobile-ui/primitives";
import { Check } from "lucide-react";
import { CalendarAgendaView } from "./CalendarAgendaView";
import { CalendarDayTasksStrip } from "./CalendarDayTasksStrip";
import { CalendarDrawer } from "./CalendarDrawer";
import { CalendarEventDetail } from "./CalendarEventDetail";
import {
  CalendarEventForm,
  EMPTY_FORM,
  type EventFormData,
  type OpportunityOption,
} from "./CalendarEventForm";
import { CalendarGridSkeleton } from "./CalendarGridSkeleton";
import { CalendarMiniMonth } from "./CalendarMiniMonth";
import { CalendarSearch } from "./CalendarSearch";
import { CalendarSettingsWizard } from "./CalendarSettingsWizard";
import { CalendarMobileToolbar } from "./CalendarMobileToolbar";
import { CalendarWeekDayStrip } from "./CalendarWeekDayStrip";
import { CalendarTimeGrid } from "./CalendarTimeGrid";
import {
  buildEventsByDate,
  filterEventsByDateMap,
  formatMonthYear,
  startOfDayLocal,
} from "./calendar-utils";
import { useCalendarEvents } from "./useCalendarEvents";
import { useCalendarState } from "./useCalendarState";

function eventToFormData(ev: EventRow): EventFormData & { id: string } {
  const fmtDt = (d: Date | null) => (d ? formatDateTimeLocal(new Date(d)) : "");
  let reminderMinutes = 30;
  if (ev.reminderAt && ev.startAt) {
    const diffMin = Math.round(
      (new Date(ev.startAt).getTime() - new Date(ev.reminderAt).getTime()) / 60_000,
    );
    if ([0, 15, 30, 60, 1440].includes(diffMin)) reminderMinutes = diffMin;
  }
  return {
    id: ev.id,
    title: ev.title,
    eventType: ev.eventType ?? "schuzka",
    startAt: fmtDt(ev.startAt),
    endAt: fmtDt(ev.endAt),
    allDay: ev.allDay ?? false,
    location: ev.location ?? "",
    contactId: ev.contactId ?? "",
    opportunityId: ev.opportunityId ?? "",
    reminderMinutes,
    status: ev.status?.trim() ? ev.status : "scheduled",
    notes: ev.notes ?? "",
    meetingLink: ev.meetingLink ?? "",
  };
}

const UNDO_TIMEOUT_MS = 5_000;

export function CalendarScreen({
  contacts,
  deviceClass,
  canWriteCalendar = true,
  onOpenGlobalAppMenu,
}: {
  contacts: ContactRow[];
  deviceClass?: DeviceClass;
  canWriteCalendar?: boolean;
  onOpenGlobalAppMenu?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dc = deviceClass ?? "phone";
  const {
    view,
    setView,
    anchorDate,
    setAnchorDate,
    firstDayOfWeek,
    settings,
    setSettings,
    goPrev,
    goNext,
    goToday: goTodayBase,
  } = useCalendarState();

  const { events, visibleDays, loading, refreshing, error, reload } = useCalendarEvents(
    anchorDate,
    view,
    firstDayOfWeek,
  );

  const { toast, showToast, dismissToast } = useToast();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [hiddenEventTypes, setHiddenEventTypes] = useState<Set<string>>(() => new Set());
  const [contactFilterId, setContactFilterId] = useState("");
  const [optimisticDeleteIds, setOptimisticDeleteIds] = useState<Set<string>>(() => new Set());

  const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [scrollSignal, setScrollSignal] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [formInitial, setFormInitial] = useState<(EventFormData & { id?: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [opportunities, setOpportunities] = useState<OpportunityOption[]>([]);

  const undoRef = useRef<{ eventId: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const newParamHandled = useRef(false);

  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | undefined>();
  const [syncBusy, setSyncBusy] = useState(false);

  const refreshGoogleStatus = useCallback(() => {
    void fetch("/api/calendar/status", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d: { connected?: boolean; email?: string }) => {
        setGoogleConnected(!!d.connected);
        setGoogleEmail(d.email);
      })
      .catch(() => setGoogleConnected(false));
  }, []);

  useEffect(() => {
    refreshGoogleStatus();
  }, [refreshGoogleStatus]);

  const handleGoogleSync = useCallback(async () => {
    setSyncBusy(true);
    try {
      const r = await fetch("/api/calendar/sync", { method: "POST", credentials: "same-origin" });
      const data = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || data.ok === false) {
        showToast(typeof data.error === "string" ? data.error : "Synchronizace selhala", "error");
        return;
      }
      showToast("Kalendář synchronizován", "success");
      refreshGoogleStatus();
      reload();
    } catch {
      showToast("Synchronizace selhala", "error");
    } finally {
      setSyncBusy(false);
    }
  }, [reload, showToast, refreshGoogleStatus]);

  useEffect(() => {
    getOpenOpportunitiesList()
      .then(setOpportunities)
      .catch(() => {});
  }, []);

  const todayStr = formatDateLocal(new Date());

  const eventsAfterOptimistic = useMemo(
    () => events.filter((e) => !optimisticDeleteIds.has(e.id)),
    [events, optimisticDeleteIds],
  );

  const eventsFilteredByContact = useMemo(() => {
    if (!contactFilterId.trim()) return eventsAfterOptimistic;
    return eventsAfterOptimistic.filter((e) => e.contactId === contactFilterId);
  }, [eventsAfterOptimistic, contactFilterId]);

  const eventsByDate = useMemo(() => {
    const built = buildEventsByDate(eventsFilteredByContact);
    return filterEventsByDateMap(built, hiddenEventTypes);
  }, [eventsFilteredByContact, hiddenEventTypes]);

  const eventDotsByDay = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [day, arr] of eventsByDate.entries()) out[day] = arr.length;
    return out;
  }, [eventsByDate]);

  const agendaDayItemsForAnchor = useMemo(() => {
    const arr = eventsByDate.get(formatDateLocal(anchorDate));
    return (arr ?? []).slice().sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [anchorDate, eventsByDate]);

  const visibleDayKeys = useMemo(() => visibleDays.map((d) => formatDateLocal(d)), [visibleDays]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return eventsFilteredByContact
      .filter((ev) => visibleDayKeys.includes(formatDateLocal(new Date(ev.startAt))))
      .filter((ev) => !hiddenEventTypes.has(ev.eventType ?? "schuzka"))
      .filter((ev) => {
        const title = (ev.title ?? "").toLowerCase();
        const contact = (ev.contactName ?? "").toLowerCase();
        return title.includes(q) || contact.includes(q);
      })
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [eventsFilteredByContact, visibleDayKeys, hiddenEventTypes, searchQuery]);

  const contactForSelected = useMemo(() => {
    if (!selectedEvent?.contactId) return null;
    return contacts.find((c) => c.id === selectedEvent.contactId) ?? null;
  }, [contacts, selectedEvent]);

  useEffect(() => {
    const dateStr = searchParams.get("date");
    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      setAnchorDate(startOfDayLocal(new Date(`${dateStr}T12:00:00`)));
    }
  }, [searchParams, setAnchorDate]);

  useEffect(() => {
    const raw = searchParams.get("event") ?? searchParams.get("eventId");
    if (!raw?.trim()) return;
    const id = raw.trim();
    let cancelled = false;
    void getEvent(id).then((ev) => {
      if (cancelled) return;
      if (!ev) {
        showToast("Událost nebyla nalezena", "error");
        router.replace("/portal/calendar", { scroll: false });
        return;
      }
      setSelectedEvent(ev);
      setSelectedEventId(ev.id);
      setAnchorDate(startOfDayLocal(new Date(ev.startAt)));
      router.replace("/portal/calendar", { scroll: false });
    });
    return () => {
      cancelled = true;
    };
  }, [searchParams, router, setAnchorDate, showToast]);

  useEffect(() => {
    if (searchParams.get("new") !== "1") {
      newParamHandled.current = false;
      return;
    }
    if (newParamHandled.current) return;
    newParamHandled.current = true;
    if (canWriteCalendar) {
      const cid = searchParams.get("contactId");
      setFormInitial({
        ...EMPTY_FORM,
        ...(cid ? { contactId: cid } : {}),
      });
      setSaveError(null);
      setFormOpen(true);
    }
    router.replace("/portal/calendar", { scroll: false });
  }, [searchParams, router, canWriteCalendar]);

  const goToday = useCallback(() => {
    goTodayBase();
    setScrollSignal((s) => s + 1);
  }, [goTodayBase]);

  const bumpScroll = useCallback(() => setScrollSignal((s) => s + 1), []);

  const handleSelectDayFromHeader = useCallback(
    (day: Date) => {
      setAnchorDate(startOfDayLocal(day));
      setScrollSignal((s) => s + 1);
    },
    [setAnchorDate],
  );

  const onNavigatePeriod = useCallback(
    (direction: -1 | 1) => {
      if (direction < 0) goPrev();
      else goNext();
    },
    [goPrev, goNext],
  );

  const toggleEventTypeHidden = useCallback((typeId: string) => {
    setHiddenEventTypes((prev) => {
      const next = new Set(prev);
      if (next.has(typeId)) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
  }, []);

  const onEventClick = useCallback((ev: EventRow) => {
    setSelectedEvent(ev);
    setSelectedEventId(ev.id);
  }, []);

  const handleEventMove = useCallback(
    async (eventId: string, targetDateStr: string, startMinutesFromMidnight: number) => {
      if (!canWriteCalendar) return;
      const ev = events.find((item) => item.id === eventId);
      if (!ev || ev.allDay) return;
      const oldStart = new Date(ev.startAt);
      const oldEnd = ev.endAt
        ? new Date(ev.endAt)
        : new Date(oldStart.getTime() + DEFAULT_EVENT_DURATION_MS);
      const durationMs = Math.max(15 * 60_000, oldEnd.getTime() - oldStart.getTime());
      const [yy, mm, dd] = targetDateStr.split("-").map(Number);
      const newStart = new Date(
        yy,
        mm - 1,
        dd,
        Math.floor(startMinutesFromMidnight / 60),
        startMinutesFromMidnight % 60,
        0,
        0,
      );
      const newEnd = new Date(newStart.getTime() + durationMs);
      const delta = newStart.getTime() - oldStart.getTime();
      try {
        await updateEvent(eventId, {
          startAt: newStart.toISOString(),
          endAt: newEnd.toISOString(),
          ...(ev.reminderAt != null && {
            reminderAt: new Date(new Date(ev.reminderAt).getTime() + delta).toISOString(),
          }),
        });
        showToast("Aktivita přesunuta", "success");
        reload();
      } catch {
        showToast("Nepodařilo se přesunout aktivitu", "error");
      }
    },
    [canWriteCalendar, events, reload, showToast],
  );

  const handleEventResize = useCallback(
    async (eventId: string, targetDateStr: string, endMinutesFromMidnight: number) => {
      if (!canWriteCalendar) return;
      const ev = events.find((item) => item.id === eventId);
      if (!ev || ev.allDay) return;
      const start = new Date(ev.startAt);
      const [yy, mm, dd] = targetDateStr.split("-").map(Number);
      const proposedEnd = new Date(
        yy,
        mm - 1,
        dd,
        Math.floor(endMinutesFromMidnight / 60),
        endMinutesFromMidnight % 60,
        0,
        0,
      );
      const minEnd = new Date(start.getTime() + 15 * 60_000);
      const nextEnd = proposedEnd.getTime() <= minEnd.getTime() ? minEnd : proposedEnd;
      try {
        await updateEvent(eventId, { endAt: nextEnd.toISOString() });
        showToast("Délka aktivity upravena", "success");
        reload();
      } catch {
        showToast("Nepodařilo se upravit délku aktivity", "error");
      }
    },
    [canWriteCalendar, events, reload, showToast],
  );

  const handleDragCreate = useCallback(
    (dateStr: string, startMinutesFromMidnight: number, endMinutesFromMidnight: number) => {
      if (!canWriteCalendar) return;
      const [yy, mm, dd] = dateStr.split("-").map(Number);
      const start = new Date(
        yy,
        mm - 1,
        dd,
        Math.floor(startMinutesFromMidnight / 60),
        startMinutesFromMidnight % 60,
        0,
        0,
      );
      const end = new Date(
        yy,
        mm - 1,
        dd,
        Math.floor(endMinutesFromMidnight / 60),
        endMinutesFromMidnight % 60,
        0,
        0,
      );
      setFormInitial({
        ...EMPTY_FORM,
        startAt: formatDateTimeLocal(start),
        endAt: formatDateTimeLocal(end),
      });
      setSaveError(null);
      setFormOpen(true);
    },
    [canWriteCalendar],
  );

  const onSlotClick = useCallback(
    (dateStr: string, hour: number) => {
      if (!canWriteCalendar) return;
      const date = new Date(`${dateStr}T00:00:00`);
      date.setHours(hour, 0, 0, 0);
      const end = new Date(date.getTime() + DEFAULT_EVENT_DURATION_MS);
      setFormInitial({
        ...EMPTY_FORM,
        startAt: formatDateTimeLocal(date),
        endAt: formatDateTimeLocal(end),
      });
      setSaveError(null);
      setFormOpen(true);
    },
    [canWriteCalendar],
  );

  const openEditForm = useCallback(
    (ev: EventRow) => {
      if (!canWriteCalendar) return;
      setFormInitial(eventToFormData(ev));
      setSaveError(null);
      setFormOpen(true);
    },
    [canWriteCalendar],
  );

  const handleSave = useCallback(
    async (form: EventFormData, id?: string) => {
      if (!canWriteCalendar) return;
      setSaving(true);
      setSaveError(null);
      try {
        const startIso = localDateTimeInputToUtcIso(form.startAt);
        const endIso = localDateTimeInputToUtcIso(form.endAt);
        if (!startIso) {
          setSaveError("Neplatný začátek události.");
          return;
        }
        const reminderAtIso = reminderIsoBeforeStartUtc(startIso, form.reminderMinutes) ?? null;
        const allDayYmd =
          form.allDay
            ? {
                allDayStartYmd: form.startAt.slice(0, 10),
                allDayEndYmd: (form.endAt || form.startAt).slice(0, 10),
              }
            : {};
        if (id) {
          await updateEvent(id, {
            title: form.title,
            eventType: form.eventType,
            startAt: startIso,
            ...(endIso ? { endAt: endIso } : {}),
            allDay: form.allDay,
            ...allDayYmd,
            location: form.location,
            contactId: form.contactId || undefined,
            opportunityId: form.opportunityId || undefined,
            reminderAt: reminderAtIso,
            status: form.status || undefined,
            notes: form.notes,
            meetingLink: form.meetingLink,
          });
          showToast("Aktivita uložena", "success");
        } else {
          await createEvent({
            title: form.title,
            eventType: form.eventType,
            startAt: startIso,
            endAt: endIso || undefined,
            allDay: form.allDay,
            ...allDayYmd,
            location: form.location,
            contactId: form.contactId || undefined,
            opportunityId: form.opportunityId || undefined,
            reminderAt: reminderIsoBeforeStartUtc(startIso, form.reminderMinutes),
            status: form.status || undefined,
            notes: form.notes,
            meetingLink: form.meetingLink,
          });
          showToast("Aktivita vytvořena", "success");
        }
        setFormOpen(false);
        setFormInitial(null);
        setSelectedEvent(null);
        setSelectedEventId(null);
        reload();
      } catch {
        setSaveError("Nepodařilo se uložit. Zkuste to znovu.");
      } finally {
        setSaving(false);
      }
    },
    [reload, showToast, canWriteCalendar],
  );

  const handleUndoDelete = useCallback(() => {
    if (!undoRef.current) return;
    clearTimeout(undoRef.current.timer);
    const id = undoRef.current.eventId;
    undoRef.current = null;
    setOptimisticDeleteIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    dismissToast();
    showToast("Smazání zrušeno", "success");
  }, [dismissToast, showToast]);

  const handleDelete = useCallback(
    (ev: EventRow) => {
      if (!canWriteCalendar) return;
      setSelectedEvent(null);
      setSelectedEventId(null);

      const eventId = ev.id;
      setOptimisticDeleteIds((prev) => new Set(prev).add(eventId));

      const timer = setTimeout(async () => {
        try {
          await deleteEvent(eventId);
          reload();
        } catch {
          showToast("Smazání selhalo", "error");
          reload();
        } finally {
          setOptimisticDeleteIds((prev) => {
            const next = new Set(prev);
            next.delete(eventId);
            return next;
          });
          if (undoRef.current?.eventId === eventId) undoRef.current = null;
        }
      }, UNDO_TIMEOUT_MS);

      undoRef.current = { eventId, timer };
      showToast("Událost bude smazána. Klepnutím zrušíte.", "info");
    },
    [reload, showToast, canWriteCalendar],
  );

  const handleMarkDone = useCallback(
    async (ev: EventRow) => {
      if (!canWriteCalendar) return;
      try {
        await updateEvent(ev.id, { status: "done" });
        showToast("Označeno jako hotovo", "success");
        setSelectedEvent(null);
        setSelectedEventId(null);
        reload();
      } catch {
        showToast("Chyba při změně stavu", "error");
      }
    },
    [reload, showToast, canWriteCalendar],
  );

  const handleChangeEventType = useCallback(
    async (eventId: string, nextType: string) => {
      if (!canWriteCalendar) return;
      try {
        await updateEvent(eventId, { eventType: nextType });
        setSelectedEvent((current) =>
          current && current.id === eventId ? { ...current, eventType: nextType } : current,
        );
        showToast("Typ aktivity upraven", "success");
        reload();
      } catch {
        showToast("Nepodařilo se změnit typ aktivity", "error");
      }
    },
    [canWriteCalendar, reload, showToast],
  );

  const handleFollowUp = useCallback(
    async (ev: EventRow, type: "event" | "task") => {
      if (!canWriteCalendar) return;
      const title = `Follow-up: ${ev.title}`;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      try {
        await createFollowUp(ev.id, type, {
          title,
          startAt: type === "event" ? tomorrow.toISOString() : undefined,
          contactId: ev.contactId || undefined,
        });
        showToast(type === "event" ? "Follow-up vytvořen" : "Úkol vytvořen", "success");
        setSelectedEvent(null);
        setSelectedEventId(null);
        reload();
      } catch {
        showToast("Nepodařilo se vytvořit", "error");
      }
    },
    [reload, showToast, canWriteCalendar],
  );

  const segmentedWeekMonth = view === "month" ? "month" : "week";
  const showTimeGridUi = view !== "agenda" && view !== "month";
  const skeletonCols = view === "agenda" || view === "month" ? 7 : visibleDays.length;
  const skeletonTimeW = dc === "phone" ? 44 : 52;
  const calendarChromePad = dc === "phone" ? "px-5 sm:px-6" : "px-3 sm:px-4";
  const calendarGridBleed =
    dc === "phone" ? "-mx-5 w-[calc(100%+2.5rem)] sm:-mx-6 sm:w-[calc(100%+3rem)]" : "-mx-3 w-[calc(100%+1.5rem)] sm:mx-0 sm:w-auto";

  return (
    <div
      className={`flex min-h-[50vh] w-full min-w-0 flex-1 flex-col overflow-x-hidden pb-[var(--aidv-mobile-screen-pad-bottom)] ${calendarChromePad}`}
    >
      <CalendarMobileToolbar
        anchorDate={anchorDate}
        segmentedValue={segmentedWeekMonth}
        onSegmentChange={(seg) => {
          setView(seg);
        }}
        onOpenDrawer={() => setDrawerOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
        onRefresh={reload}
        refreshing={refreshing}
      />

      <div className="mb-2 min-h-[40px]">
        {googleConnected === false ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950">
            <span>Google Kalendář není připojen.</span>
            <a
              href="/api/integrations/google-calendar/connect"
              className="text-indigo-600 underline underline-offset-2"
            >
              Připojit
            </a>
          </div>
        ) : null}
        {googleConnected === true && googleEmail ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-1.5 text-[11px] font-bold text-emerald-900">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
            <span className="truncate">Google: {googleEmail}</span>
          </div>
        ) : null}
      </div>

      <CalendarDayTasksStrip
        dateStr={formatDateLocal(anchorDate)}
        onOpenTasks={() => router.push("/portal/tasks")}
      />

      {view !== "month" && view !== "agenda" ? (
        <div className="mb-3">
          <CalendarWeekDayStrip
            weekDays={visibleDays}
            anchorDate={anchorDate}
            todayStr={todayStr}
            onPickDay={handleSelectDayFromHeader}
          />
        </div>
      ) : null}

      {error ? <ErrorState title={error} onRetry={reload} /> : null}

      {loading ? (
        showTimeGridUi || view === "month" ? (
          <CalendarGridSkeleton columnCount={skeletonCols} timeColWidth={skeletonTimeW} />
        ) : (
          <div className="flex min-h-[200px] flex-1 items-center justify-center text-sm text-[color:var(--wp-text-secondary)]">
            Načítám agendu…
          </div>
        )
      ) : (
        <div
          className={
            refreshing && !loading ? "opacity-50 transition-opacity duration-200" : "transition-opacity duration-200"
          }
        >
          {showTimeGridUi ? (
            <div className={`${calendarGridBleed} mb-4 max-w-none sm:mb-0`}>
              <CalendarTimeGrid
                visibleDays={visibleDays}
                eventsByDate={eventsByDate}
                todayStr={todayStr}
                firstDayOfWeek={firstDayOfWeek}
                deviceClass={dc}
                settings={settings}
                selectedEventId={selectedEventId}
                onSlotClick={onSlotClick}
                onEventClick={onEventClick}
                onEventMove={handleEventMove}
                onEventResize={handleEventResize}
                onDragCreate={handleDragCreate}
                scrollSignal={scrollSignal}
              />
            </div>
          ) : null}
          {view === "month" ? (
            <div className="space-y-3">
              <CalendarMiniMonth
                anchorDate={anchorDate}
                firstDayOfWeek={firstDayOfWeek}
                todayStr={todayStr}
                eventDotsByDay={eventDotsByDay}
                onPickDay={(d) => handleSelectDayFromHeader(d)}
              />
              <MobileCard className="p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--wp-text-tertiary)]">
                  Aktivity ({formatMonthYear(anchorDate)})
                </p>
                <p className="mt-1 text-xs font-semibold text-[color:var(--wp-text-secondary)]">
                  Den {formatDisplayDateCs(formatDateLocal(anchorDate)) ?? formatDateLocal(anchorDate)}
                </p>
                {agendaDayItemsForAnchor.length === 0 ? (
                  <p className="mt-3 text-sm text-[color:var(--wp-text-secondary)]">
                    Žádné položky dle načtených dat CRM.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {agendaDayItemsForAnchor.map((ev) => (
                      <li key={ev.id}>
                        <button
                          type="button"
                          className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/40 px-3 py-2.5 text-left transition-colors active:bg-[color:var(--wp-surface-muted)]"
                          onClick={() => onEventClick(ev)}
                        >
                          <span className="text-[11px] font-black uppercase tracking-wide text-indigo-700">
                            {new Date(ev.startAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="mt-1 block text-sm font-bold text-[color:var(--wp-text)]">{ev.title}</span>
                          {ev.contactName ? (
                            <span className="mt-0.5 block text-xs text-[color:var(--wp-text-secondary)]">
                              {ev.contactName}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </MobileCard>
            </div>
          ) : null}
          {view === "agenda" ? (
            <CalendarAgendaView
              visibleDays={visibleDays}
              eventsByDate={eventsByDate}
              todayStr={todayStr}
              selectedEventId={selectedEventId}
              settings={settings}
              onEventClick={onEventClick}
            />
          ) : null}
        </div>
      )}

      <CalendarDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        anchorDate={anchorDate}
        setAnchorDate={setAnchorDate}
        firstDayOfWeek={firstDayOfWeek}
        todayStr={todayStr}
        view={view}
        setView={setView}
        hiddenEventTypes={hiddenEventTypes}
        toggleEventTypeHidden={toggleEventTypeHidden}
        onOpenSettings={() => setSettingsOpen(true)}
        scrollSignalBump={bumpScroll}
        onNavigatePeriod={onNavigatePeriod}
        onOpenGlobalAppMenu={onOpenGlobalAppMenu}
        googleConnected={googleConnected === true}
        onSyncCalendar={handleGoogleSync}
        syncBusy={syncBusy}
        contacts={contacts}
        contactFilterId={contactFilterId}
        onContactFilterChange={setContactFilterId}
      />

      <CalendarSettingsWizard
        deviceClass={dc}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialSettings={settings ?? DEFAULT_SETTINGS}
        onSave={(next) => {
          saveCalendarSettings(next);
          setSettings(next);
          showToast("Nastavení kalendáře uloženo", "success");
        }}
      />

      <CalendarSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        results={searchResults}
        rangeLabel={`${visibleDayKeys[0] ?? ""} – ${visibleDayKeys[visibleDayKeys.length - 1] ?? ""}`}
        onPickEvent={(ev) => {
          onEventClick(ev);
          setSearchOpen(false);
          setSearchQuery("");
        }}
      />

      {selectedEvent && !formOpen ? (
        <CalendarEventDetail
          ev={selectedEvent}
          onClose={() => {
            setSelectedEvent(null);
            setSelectedEventId(null);
          }}
          onEdit={() => openEditForm(selectedEvent)}
          onDelete={() => handleDelete(selectedEvent)}
          onFollowUpEvent={() => handleFollowUp(selectedEvent, "event")}
          onFollowUpTask={() => handleFollowUp(selectedEvent, "task")}
          onMarkDone={() => handleMarkDone(selectedEvent)}
          onOpenContact={(id) => router.push(`/portal/contacts/${id}`)}
          onOpenPipeline={() => router.push("/portal/pipeline")}
          canWriteCalendar={canWriteCalendar}
          contactPhone={contactForSelected?.phone}
          contactEmail={contactForSelected?.email}
          eventTypeColors={settings?.eventTypeColors}
          onChangeType={(nextType) => handleChangeEventType(selectedEvent.id, nextType)}
          deviceClass={dc}
        />
      ) : null}

      {formOpen && formInitial ? (
        dc === "phone" ? (
          <BottomSheet
            open
            compact={false}
            reserveMobileBottomNav
            title={formInitial.id ? "Upravit aktivitu" : "Nová aktivita"}
            onClose={() => {
              if (!saving) {
                setFormOpen(false);
                setFormInitial(null);
              }
            }}
            footer={
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={saving}
                  className="min-h-[48px] rounded-xl border border-[color:var(--wp-surface-card-border)] text-sm font-bold text-[color:var(--wp-text-secondary)]"
                  onClick={() => {
                    if (!saving) {
                      setFormOpen(false);
                      setFormInitial(null);
                    }
                  }}
                >
                  Zrušit
                </button>
                <button
                  type="button"
                  disabled={saving || !canWriteCalendar}
                  className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-black text-white disabled:opacity-50"
                  onClick={() => {
                    const el = document.getElementById("portal-calendar-event-form") as HTMLFormElement | null;
                    el?.requestSubmit();
                  }}
                >
                  {saving ? (
                    "Ukládám…"
                  ) : (
                    <>
                      <Check size={16} aria-hidden />
                      Uložit
                    </>
                  )}
                </button>
              </div>
            }
          >
            <CalendarEventForm
              presentation="sheet"
              deviceClass={dc}
              initial={formInitial}
              contacts={contacts}
              opportunities={opportunities}
              eventTypeColors={settings?.eventTypeColors}
              saving={saving}
              saveError={saveError}
              onSave={handleSave}
              onClose={() => {
                setFormOpen(false);
                setFormInitial(null);
              }}
            />
          </BottomSheet>
        ) : (
          <CalendarEventForm
            deviceClass={dc}
            initial={formInitial}
            contacts={contacts}
            opportunities={opportunities}
            eventTypeColors={settings?.eventTypeColors}
            saving={saving}
            saveError={saveError}
            onSave={handleSave}
            onClose={() => {
              setFormOpen(false);
              setFormInitial(null);
            }}
          />
        )
      ) : null}

      {toast ? (
        <div
          className={undoRef.current ? "cursor-pointer" : undefined}
          onClick={() => {
            if (undoRef.current) handleUndoDelete();
          }}
        >
          <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
        </div>
      ) : null}
    </div>
  );
}
