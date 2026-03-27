"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
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
} from "@/app/portal/calendar/date-utils";
import {
  DEFAULT_SETTINGS,
  saveCalendarSettings,
} from "@/app/portal/calendar/calendar-settings";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";
import { ErrorState, FloatingActionButton, Toast, useToast } from "@/app/shared/mobile-ui/primitives";
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
import { CalendarSearch } from "./CalendarSearch";
import { CalendarSettingsWizard } from "./CalendarSettingsWizard";
import { CalendarHeader } from "./CalendarHeader";
import { CalendarTimeGrid } from "./CalendarTimeGrid";
import {
  buildEventsByDate,
  filterEventsByDateMap,
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

function reminderDate(startAt: string, minutes: number): string | null {
  if (!minutes || !startAt) return null;
  return new Date(new Date(startAt).getTime() - minutes * 60_000).toISOString();
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

  const openCreateForm = useCallback(() => {
    if (!canWriteCalendar) return;
    setFormInitial({ ...EMPTY_FORM });
    setSaveError(null);
    setFormOpen(true);
  }, [canWriteCalendar]);

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
        const reminderAtIso = reminderDate(form.startAt, form.reminderMinutes);
        if (id) {
          await updateEvent(id, {
            title: form.title,
            eventType: form.eventType,
            startAt: startIso,
            ...(endIso ? { endAt: endIso } : {}),
            allDay: form.allDay,
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
            location: form.location,
            contactId: form.contactId || undefined,
            opportunityId: form.opportunityId || undefined,
            reminderAt: reminderAtIso || undefined,
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
          dueDate: type === "task" ? tomorrow.toISOString().slice(0, 10) : undefined,
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

  const skeletonCols = view === "agenda" ? 7 : visibleDays.length;
  const skeletonTimeW = dc === "phone" ? 44 : 52;

  const showGrid = view !== "agenda";

  return (
    <div className="flex min-h-[50vh] flex-1 flex-col pb-20">
      <CalendarHeader
        anchorDate={anchorDate}
        view={view}
        onOpenDrawer={() => setDrawerOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
        onRefresh={reload}
        refreshing={refreshing}
      />

      <div className="mx-3 mb-2 min-h-[40px]">
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

      {error ? <ErrorState title={error} onRetry={reload} /> : null}

      {loading ? (
        showGrid ? (
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
          {showGrid ? (
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
              scrollSignal={scrollSignal}
            />
          ) : (
            <CalendarAgendaView
              visibleDays={visibleDays}
              eventsByDate={eventsByDate}
              todayStr={todayStr}
              selectedEventId={selectedEventId}
              settings={settings}
              onEventClick={onEventClick}
            />
          )}
        </div>
      )}

      {canWriteCalendar && !formOpen ? (
        <FloatingActionButton onClick={openCreateForm} label="Nová aktivita" icon={Plus} />
      ) : null}

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
          deviceClass={dc}
        />
      ) : null}

      {formOpen && formInitial ? (
        <CalendarEventForm
          deviceClass={dc}
          initial={formInitial}
          contacts={contacts}
          opportunities={opportunities}
          saving={saving}
          saveError={saveError}
          onSave={handleSave}
          onClose={() => {
            setFormOpen(false);
            setFormInitial(null);
          }}
        />
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
