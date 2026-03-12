"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, PanelRightClose, PanelRightOpen, Plus } from "lucide-react";
import { listEvents, createEvent, updateEvent, deleteEvent, createFollowUp, type EventRow } from "@/app/actions/events";
import { getContactsList, type ContactRow } from "@/app/actions/contacts";
import { getOpenOpportunitiesList } from "@/app/actions/pipeline";
import { getTasksForDate, completeTask, reopenTask, createTask, type TaskRow } from "@/app/actions/tasks";
import { getUnreadConversationsCount } from "@/app/actions/messages";
import { BaseModal } from "@/app/components/BaseModal";
import { useToast } from "@/app/components/Toast";
import { CalendarSettingsModal } from "@/app/components/calendar/CalendarSettingsModal";
import {
  loadCalendarSettings,
  saveCalendarSettings,
  type CalendarSettings,
} from "@/app/portal/calendar/calendar-settings";
import { formatDateLocal } from "@/app/portal/calendar/date-utils";
import { getEventCategory } from "@/app/portal/calendar/event-categories";
import { WeekDayGrid } from "@/app/portal/calendar/WeekDayGrid";
import { CalendarContextPanel } from "@/app/portal/calendar/CalendarContextPanel";
import { CalendarLeftPanel } from "@/app/portal/calendar/CalendarLeftPanel";
import { QuickEventForm, type QuickEventFormValues } from "@/app/portal/calendar/QuickEventForm";
import { CALENDAR_EVENT_CATEGORIES } from "@/app/portal/calendar/event-categories";

type ViewMode = "day" | "month" | "week" | "workweek";

const DAY_NAMES_MON = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const DAY_NAMES_SUN = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];

function getDayNames(firstDayOfWeek: 0 | 1): string[] {
  return firstDayOfWeek === 1 ? DAY_NAMES_MON : DAY_NAMES_SUN;
}

function startOfWeek(d: Date, firstDayOfWeek: 0 | 1): Date {
  const day = d.getDay();
  let diff: number;
  if (firstDayOfWeek === 1) {
    diff = d.getDate() - day + (day === 0 ? -6 : 1);
  } else {
    diff = d.getDate() - day;
  }
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

const formatDate = formatDateLocal;

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

const MONTH_NAMES = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];
function formatMonthYear(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

interface EventFormData {
  title: string;
  eventType: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string;
  contactId: string;
  opportunityId: string;
  reminderMinutes: number;
  status: string;
  notes: string;
  meetingLink: string;
}

const REMINDER_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Žádná" },
  { value: 15, label: "15 min před" },
  { value: 60, label: "1 h před" },
  { value: 1440, label: "1 den před" },
];

const EMPTY_FORM: EventFormData = { title: "", eventType: "schuzka", startAt: "", endAt: "", allDay: false, location: "", contactId: "", opportunityId: "", reminderMinutes: 0, status: "", notes: "", meetingLink: "" };

type OpportunityOption = { id: string; title: string; contactId: string | null };

const DAY_NAMES_FULL = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];

/* ────────── New Task Modal ────────── */
function NewTaskModal({
  dueDate: initialDueDate,
  onSave,
  onClose,
}: {
  dueDate: string;
  onSave: (title: string, dueDate: string) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDueDate(initialDueDate);
  }, [initialDueDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    try {
      await onSave(t, dueDate);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseModal open onClose={onClose} title="Nový úkol" maxWidth="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Název</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Název úkolu"
            className="wp-input w-full"
            autoFocus
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Datum splnění</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="wp-input w-full"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="wp-btn" style={{ background: "var(--wp-bg)", color: "var(--wp-text)" }}>
            Zrušit
          </button>
          <button type="submit" className="wp-btn wp-btn-primary" disabled={saving || !title.trim()}>
            {saving ? "Vytvářím…" : "Vytvořit"}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}

/* ────────── Event Detail Popover ────────── */
function EventDetailPopover({
  event,
  onEdit,
  onQuickEdit,
  onClose,
}: {
  event: EventRow;
  onEdit: () => void;
  onQuickEdit?: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const typeInfo = getEventCategory(event.eventType);
  const start = new Date(event.startAt);
  const end = event.endAt ? new Date(event.endAt) : null;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="wp-cal-detail" onClick={(e) => e.stopPropagation()}>
      <h2>{event.title}</h2>
      <p>
        {start.toLocaleDateString("cs-CZ", { day: "numeric", month: "long" })}
        {end ? ` – ${end.toLocaleDateString("cs-CZ", { day: "numeric", month: "long" })}` : ""}
        {" · "}
        {formatTime(start)}
        {end ? ` – ${formatTime(end)}` : ""}
      </p>
      {event.contactName && <p style={{ fontWeight: 600 }}>👤 {event.contactName}</p>}
      {event.location && <p>📍 {event.location}</p>}
      <div className="wp-cal-detail-type" style={{ background: typeInfo.color + "18", color: typeInfo.color }}>
        <span>{typeInfo.icon}</span> {typeInfo.label}
      </div>
      <div className="wp-cal-detail-actions">
        <button type="button" className="wp-btn wp-btn-primary" style={{ fontSize: 12, padding: "4px 12px", background: "var(--wp-cal-accent)", borderColor: "var(--wp-cal-accent)" }} onClick={onEdit}>
          Upravit
        </button>
        {onQuickEdit && (
          <button type="button" className="wp-btn wp-btn-ghost" style={{ fontSize: 12, padding: "4px 12px" }} onClick={onQuickEdit}>
            Rychlá úprava
          </button>
        )}
        <button type="button" className="wp-btn wp-btn-ghost" style={{ fontSize: 12, padding: "4px 12px" }} onClick={onClose}>
          Zavřít
        </button>
      </div>
    </div>
  );
}

/* ────────── Event Form Modal ────────── */
function EventFormModal({
  initial,
  contacts,
  opportunities,
  onSave,
  onDelete,
  onFollowUp,
  onClose,
}: {
  initial: EventFormData & { id?: string };
  contacts: ContactRow[];
  opportunities: OpportunityOption[];
  onSave: (form: EventFormData, id?: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onFollowUp?: (id: string, type: "event" | "task") => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<EventFormData>(initial);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.startAt) return;
    setSaving(true);
    await onSave(form, initial.id);
    setSaving(false);
    onClose();
  }

  return (
    <BaseModal open={true} onClose={onClose} title={initial.id ? "Upravit aktivitu" : "Nová aktivita"} maxWidth="2xl">
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="px-5 py-5 space-y-5 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2">
            {CALENDAR_EVENT_CATEGORIES.filter((t) => ["schuzka", "telefonat", "kafe", "mail", "ukol", "priorita"].includes(t.id)).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setForm((f) => ({ ...f, eventType: t.id }))}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                  form.eventType === t.id ? "border-current text-white shadow-sm" : "text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                }`}
                style={form.eventType === t.id ? { backgroundColor: t.color, borderColor: t.color } : { borderColor: "var(--wp-border)" }}
              >
                <span className="text-base">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>

          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Název aktivity…"
            className="wp-search-input"
            style={{ borderBottom: "1px solid var(--wp-border)", padding: "8px 0", fontSize: 18, fontWeight: 500, width: "100%", background: "transparent" }}
            autoFocus
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--wp-text-muted)" }}>Datum a čas</label>
              <input type="datetime-local" value={form.startAt} onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))} className="wp-input" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--wp-text-muted)" }}>Konec</label>
              <input type="datetime-local" value={form.endAt} onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))} className="wp-input" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--wp-text-muted)" }}>Kontakt</label>
              <select value={form.contactId} onChange={(e) => setForm((f) => ({ ...f, contactId: e.target.value, opportunityId: "" }))} className="wp-select">
                <option value="">— žádný</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--wp-text-muted)" }}>Obchod</label>
              <select value={form.opportunityId} onChange={(e) => setForm((f) => ({ ...f, opportunityId: e.target.value }))} className="wp-select">
                <option value="">— žádný</option>
                {opportunities.filter((o) => !form.contactId || o.contactId === form.contactId).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--wp-text-muted)" }}>Místo</label>
              <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Adresa / odkaz" className="wp-input" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--wp-text-muted)" }}>Odkaz na schůzku</label>
              <input value={form.meetingLink} onChange={(e) => setForm((f) => ({ ...f, meetingLink: e.target.value }))} placeholder="https://…" className="wp-input" type="url" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--wp-text-muted)" }}>Stav</label>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="wp-select">
                <option value="">—</option>
                <option value="scheduled">Naplánováno</option>
                <option value="confirmed">Potvrzeno</option>
                <option value="done">Hotovo</option>
                <option value="cancelled">Zrušeno</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--wp-text-muted)" }}>Připomenutí</label>
              <select value={form.reminderMinutes} onChange={(e) => setForm((f) => ({ ...f, reminderMinutes: Number(e.target.value) }))} className="wp-select">
                {REMINDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--wp-text-muted)" }}>Poznámka</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Poznámky k události…" className="wp-input w-full min-h-[80px]" rows={3} />
          </div>

          <label className="flex items-center gap-2.5 text-sm" style={{ color: "var(--wp-text-muted)" }}>
            <input type="checkbox" checked={form.allDay} onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))} className="rounded w-4 h-4" style={{ borderColor: "var(--wp-border)" }} />
            Celý den
          </label>

          {form.contactId && (
            <p className="text-sm">
              <a href="/portal/messages" className="text-[var(--wp-cal-accent)] underline">Otevřít zprávy</a>
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 px-5 py-3 shrink-0" style={{ borderTop: "1px solid var(--wp-border)", background: "var(--wp-bg)" }}>
          <button type="submit" disabled={saving || !form.title.trim() || !form.startAt} className="wp-btn wp-btn-primary" style={{ background: "var(--wp-cal-accent)", borderColor: "var(--wp-cal-accent)" }}>
            {saving ? "Ukládám…" : initial.id ? "Uložit" : "Vytvořit"}
          </button>
          {initial.id && onDelete && (
            <button type="button" onClick={() => onDelete(initial.id!)} className="wp-btn" style={{ color: "var(--wp-danger)", borderColor: "var(--wp-danger)" }}>Smazat</button>
          )}
          {initial.id && onFollowUp && (
            <>
              <button type="button" onClick={() => onFollowUp(initial.id!, "event")} className="wp-btn wp-btn-ghost">+ Follow-up událost</button>
              <button type="button" onClick={() => onFollowUp(initial.id!, "task")} className="wp-btn wp-btn-ghost">Založit návazný úkol</button>
            </>
          )}
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="wp-btn wp-btn-ghost">Zavřít</button>
        </div>
      </form>
    </BaseModal>
  );
}

/* ────────── Main Calendar View ────────── */
function cssVarsFromSettings(s: CalendarSettings): React.CSSProperties {
  return {
    "--wp-cal-accent": s.accent,
    "--wp-cal-accent-light": s.accentLight,
  } as React.CSSProperties;
}

export function PortalCalendarView() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState<CalendarSettings>(() => loadCalendarSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const [mode, setMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [events, setEvents] = useState<EventRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<(EventFormData & { id?: string }) | null>(null);
  const [detailEvent, setDetailEvent] = useState<EventRow | null>(null);
  const todayStrInitial = formatDate(new Date());
  const [selectedDate, setSelectedDate] = useState(todayStrInitial);
  const [dayTasks, setDayTasks] = useState<TaskRow[]>([]);
  const [dayTasksLoading, setDayTasksLoading] = useState(false);
  /** When set, new-task modal is open with this due date. */
  const [newTaskModal, setNewTaskModal] = useState<{ dueDate: string } | null>(null);
  const [contextPanelCollapsed, setContextPanelCollapsed] = useState(false);
  const [quickFormSlot, setQuickFormSlot] = useState<{ dateStr: string; hour: number } | null>(null);
  const [quickFormEvent, setQuickFormEvent] = useState<EventRow | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const dayNames = useMemo(() => getDayNames(settings.firstDayOfWeek), [settings.firstDayOfWeek]);

  useEffect(() => {
    getUnreadConversationsCount().then(setUnreadMessagesCount).catch(() => setUnreadMessagesCount(0));
  }, []);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      const todayStr = formatDate(new Date());
      setModal({ ...EMPTY_FORM, startAt: `${todayStr}T09:00`, endAt: `${todayStr}T10:00` });
      window.history.replaceState(null, "", "/portal/calendar");
    }
  }, [searchParams]);

  const loadDayTasks = useCallback((dateStr: string) => {
    setDayTasksLoading(true);
    getTasksForDate(dateStr).then(setDayTasks).catch(() => setDayTasks([])).finally(() => setDayTasksLoading(false));
  }, []);

  useEffect(() => { loadDayTasks(selectedDate); }, [selectedDate, loadDayTasks]);

  const rangeStart = useMemo(() => {
    if (mode === "day") return new Date(selectedDate + "T00:00:00");
    if (mode === "week" || mode === "workweek") return startOfWeek(currentDate, settings.firstDayOfWeek);
    return new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  }, [mode, currentDate, selectedDate, settings.firstDayOfWeek]);

  const rangeEnd = useMemo(() => {
    if (mode === "day") {
      const d = new Date(selectedDate + "T00:00:00");
      d.setDate(d.getDate() + 1);
      return d;
    }
    if (mode === "week" || mode === "workweek") {
      const d = new Date(rangeStart);
      d.setDate(d.getDate() + (mode === "workweek" ? 5 : 7));
      return d;
    }
    return new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  }, [mode, currentDate, rangeStart, selectedDate]);

  const loadEvents = useCallback(() => {
    setLoading(true);
    listEvents({ start: rangeStart.toISOString(), end: rangeEnd.toISOString() }).then(setEvents).catch(() => setEvents([])).finally(() => setLoading(false));
  }, [rangeStart, rangeEnd]);

  useEffect(() => { loadEvents(); }, [loadEvents]);
  useEffect(() => { getContactsList().then(setContacts).catch(() => setContacts([])); }, []);
  const [opportunities, setOpportunities] = useState<OpportunityOption[]>([]);
  useEffect(() => { getOpenOpportunitiesList().then(setOpportunities).catch(() => setOpportunities([])); }, []);

  const handleSave = useCallback(async (form: EventFormData, id?: string) => {
    const start = form.startAt ? new Date(form.startAt) : null;
    const reminderAt = form.reminderMinutes > 0 && start ? new Date(start.getTime() - form.reminderMinutes * 60 * 1000).toISOString() : undefined;
    if (id) {
      await updateEvent(id, { title: form.title, eventType: form.eventType, startAt: form.startAt, endAt: form.endAt || undefined, allDay: form.allDay, location: form.location || undefined, reminderAt, contactId: form.contactId || undefined, opportunityId: form.opportunityId || undefined, status: form.status || undefined, notes: form.notes || undefined, meetingLink: form.meetingLink || undefined });
      toast.showToast("Aktivita upravena");
    } else {
      await createEvent({ title: form.title, eventType: form.eventType, startAt: form.startAt, endAt: form.endAt || undefined, allDay: form.allDay, location: form.location || undefined, reminderAt, contactId: form.contactId || undefined, opportunityId: form.opportunityId || undefined, status: form.status || undefined, notes: form.notes || undefined, meetingLink: form.meetingLink || undefined });
      toast.showToast("Aktivita vytvořena");
    }
    loadEvents();
  }, [loadEvents, toast]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Opravdu smazat?")) return;
    await deleteEvent(id);
    setModal(null);
    toast.showToast("Aktivita smazána");
    loadEvents();
  }, [loadEvents, toast]);

  const handleFollowUp = useCallback(async (sourceId: string, type: "event" | "task") => {
    const source = events.find((e) => e.id === sourceId);
    const title = `Follow-up: ${source?.title ?? ""}`;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    await createFollowUp(sourceId, type, { title, startAt: type === "event" ? tomorrow.toISOString() : undefined, dueDate: type === "task" ? formatDate(tomorrow) : undefined, contactId: source?.contactId || undefined });
    setModal(null);
    setQuickFormEvent(null);
    loadEvents();
  }, [events, loadEvents]);

  const handleQuickSave = useCallback(async (values: QuickEventFormValues, id?: string) => {
    if (id) {
      await updateEvent(id, { title: values.title, eventType: values.eventType, startAt: values.startAt, endAt: values.endAt, contactId: values.contactId || undefined, notes: values.notes || undefined, location: values.location || undefined });
      toast.showToast("Aktivita upravena");
    } else {
      await createEvent({ title: values.title, eventType: values.eventType, startAt: values.startAt, endAt: values.endAt, contactId: values.contactId || undefined, notes: values.notes || undefined, location: values.location || undefined });
      toast.showToast("Aktivita vytvořena");
    }
    setQuickFormSlot(null);
    setQuickFormEvent(null);
    loadEvents();
  }, [loadEvents, toast]);

  const handleMarkEventDone = useCallback(async (ev: EventRow) => {
    await updateEvent(ev.id, { status: "done" });
    toast.showToast("Událost označena jako hotová");
    setDetailEvent(null);
    loadEvents();
  }, [loadEvents, toast]);

  function navigate(dir: -1 | 1) {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (mode === "day") d.setDate(d.getDate() + dir);
      else if (mode === "week" || mode === "workweek") d.setDate(d.getDate() + dir * (mode === "workweek" ? 5 : 7));
      else d.setMonth(d.getMonth() + dir);
      return d;
    });
    if (mode === "day") setSelectedDate((prev) => {
      const d = new Date(prev + "T12:00:00");
      d.setDate(d.getDate() + dir);
      return d.toISOString().slice(0, 10);
    });
  }

  function openNew(dateStr: string, hour?: number) {
    const h = hour ?? 9;
    setModal({ ...EMPTY_FORM, startAt: `${dateStr}T${String(h).padStart(2, "0")}:00`, endAt: `${dateStr}T${String(Math.min(h + 1, 23)).padStart(2, "0")}:00` });
  }

  function openEdit(ev: EventRow) {
    const start = new Date(ev.startAt);
    const reminderAt = ev.reminderAt ? new Date(ev.reminderAt) : null;
    let reminderMinutes = 0;
    if (reminderAt) {
      const diffM = Math.round((start.getTime() - reminderAt.getTime()) / 60000);
      if (diffM <= 15) reminderMinutes = 15;
      else if (diffM <= 60) reminderMinutes = 60;
      else if (diffM <= 1440) reminderMinutes = 1440;
    }
    setModal({ id: ev.id, title: ev.title, eventType: ev.eventType ?? "schuzka", startAt: start.toISOString().slice(0, 16), endAt: ev.endAt ? new Date(ev.endAt).toISOString().slice(0, 16) : "", allDay: ev.allDay ?? false, location: ev.location ?? "", contactId: ev.contactId ?? "", opportunityId: ev.opportunityId ?? "", reminderMinutes, status: ev.status ?? "", notes: ev.notes ?? "", meetingLink: ev.meetingLink ?? "" });
    setDetailEvent(null);
  }

  const weekDays = useMemo(() => {
    if (mode === "day") return [new Date(selectedDate + "T12:00:00")];
    const result: Date[] = [];
    const d = new Date(rangeStart);
    const count = mode === "workweek" ? 5 : 7;
    for (let i = 0; i < count; i++) { result.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return result;
  }, [rangeStart, mode, selectedDate]);

  const monthDays = useMemo(() => {
    if (mode !== "month") return [];
    const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const day = first.getDay();
    const diff = settings.firstDayOfWeek === 1 ? (day === 0 ? 6 : day - 1) : day;
    first.setDate(first.getDate() - diff);
    const result: Date[] = [];
    for (let i = 0; i < 35; i++) { result.push(new Date(first)); first.setDate(first.getDate() + 1); }
    return result;
  }, [mode, currentDate, settings.firstDayOfWeek]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const ev of events) {
      const key = formatDate(new Date(ev.startAt));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [events]);

  const headerLabel = useMemo(() => {
    if (mode === "day") {
      return new Date(selectedDate + "T12:00:00").toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" });
    }
    if (mode === "week" || mode === "workweek") {
      const weekNum = Math.ceil(((rangeStart.getTime() - new Date(rangeStart.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7);
      const suffix = mode === "workweek" ? " (Po–Pá)" : "";
      return settings.showWeekNumbers ? `${weekNum}. týden${suffix}` : `Týden${suffix}`;
    }
    return currentDate.toLocaleDateString("cs-CZ", { month: "long" });
  }, [mode, currentDate, rangeStart, selectedDate, settings.showWeekNumbers]);

  const yearLabel = useMemo(() => currentDate.getFullYear().toString(), [currentDate]);
  const todayStr = formatDate(new Date());

  async function handleToggleDayTask(task: TaskRow) {
    if (task.completedAt) await reopenTask(task.id);
    else await completeTask(task.id);
    loadDayTasks(selectedDate);
  }

  useEffect(() => {
    if (isMobile && mode === "workweek") setMode("week");
  }, [isMobile]);

  const timeColWidth = 60;
  const viewModesMobile: ViewMode[] = ["day", "week", "month"];

  const toolbarTitle = useMemo(() => {
    if (mode === "month") return formatMonthYear(currentDate);
    const weekNum = getWeekNumber(rangeStart);
    return `${weekNum}. týden (${formatMonthYear(currentDate)})`;
  }, [mode, currentDate, rangeStart]);

  return (
    <div className="flex flex-col min-h-0 h-full pb-[max(1rem,env(safe-area-inset-bottom))] bg-[#f1f5f9]">
      <div
        className={`wp-cal-container wp-cal-container--today-${settings.todayStyle} wp-cal-container--font-${settings.fontSize} flex flex-col flex-1 min-h-0`}
        style={cssVarsFromSettings(settings)}
      >
        <div className="flex-1 flex overflow-hidden p-4 gap-4 min-h-0">
          <CalendarLeftPanel
            baseDate={currentDate}
            selectedDate={selectedDate}
            onSelectDate={(dateStr) => {
              setSelectedDate(dateStr);
              const d = new Date(dateStr + "T12:00:00");
              setCurrentDate(d);
            }}
            onToday={() => {
              const today = new Date();
              setCurrentDate(today);
              setSelectedDate(formatDate(today));
            }}
          />

          <main className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden relative min-w-0">
            <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between bg-white z-20 flex-wrap gap-2">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => { const today = new Date(); setCurrentDate(today); setSelectedDate(formatDate(today)); }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors min-h-[44px] sm:min-h-0"
                >
                  Dnes
                </button>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => navigate(-1)} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center" aria-label="Předchozí">
                    <ChevronLeft size={18} />
                  </button>
                  <button type="button" onClick={() => navigate(1)} className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center" aria-label="Další">
                    <ChevronRight size={18} />
                  </button>
                </div>
                <h2 className="text-lg font-black text-slate-900">{toolbarTitle}</h2>
              </div>
              <div className="flex items-center gap-4">
                <div className="bg-slate-100 p-1 rounded-lg flex items-center">
                  {(["workweek", "week", "month"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setMode(m)} className={`px-3 py-1 rounded-md text-xs font-bold transition-all min-h-[40px] sm:min-h-0 ${mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                      {m === "workweek" ? "Pracovní" : m === "week" ? "Týden" : "Měsíc"}
                    </button>
                  ))}
                </div>
                <div className="w-px h-5 bg-slate-200 hidden sm:block" />
                <button type="button" onClick={() => setContextPanelCollapsed((c) => !c)} className={`p-1.5 rounded-lg transition-colors hidden sm:flex ${!contextPanelCollapsed ? "text-indigo-600 bg-indigo-50" : "text-slate-400 hover:bg-slate-100"}`} title="Přepnout postranní panel">
                  {!contextPanelCollapsed ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
                </button>
                <button type="button" onClick={() => openNew(todayStr)} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-sm transition-all active:scale-95 min-h-[44px] sm:min-h-0">
                  <Plus size={16} /> Vytvořit
                </button>
                <button type="button" onClick={() => setSettingsOpen(true)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 sm:block hidden" aria-label="Nastavení">
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 2.31.49 2.31 1.066 0 1.552-2.308 2.6-4.342 2.6-2.034 0-4.341-1.048-4.341-2.6 0-.576.767-2.006 2.314-1.066 1.53.94 2.573 1.066 2.573-1.066 0-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 2.31.49 2.31 1.066 0 1.552-2.308 2.6-4.342 2.6-2.034 0-4.341-1.048-4.341-2.6 0-.576.767-2.006 2.314-1.066 1.53.94 2.573 1.066 2.573-1.066z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-slate-500 text-sm">Načítám kalendář…</p>
              </div>
            ) : mode === "month" ? (
              <div className="flex-1 flex flex-col bg-white overflow-auto min-h-0">
                <div className="grid grid-cols-7 border-b border-slate-200 bg-white z-20 flex-shrink-0">
                  {["PO", "ÚT", "ST", "ČT", "PÁ", "SO", "NE"].map((d, i) => (
                    <div key={i} className="py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-100 last:border-r-0">{d}</div>
                  ))}
                </div>
                <div className="flex-1 grid grid-cols-7 grid-rows-5 bg-slate-100 gap-[1px] min-h-0">
                  {monthDays.map((day, idx) => {
                    const ds = formatDate(day);
                    const isToday = ds === todayStr;
                    const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                    const dayEvents = eventsByDate.get(ds) ?? [];
                    const isPast = ds < todayStr;
                    return (
                      <div
                        key={idx}
                        onClick={() => isCurrentMonth && openNew(ds)}
                        className={`relative p-2 bg-white transition-colors group cursor-pointer min-h-[80px] ${!isCurrentMonth ? "text-slate-300 bg-slate-50/50" : "text-slate-700 hover:bg-slate-50"} ${isPast && isCurrentMonth ? "wp-cal-striped-past opacity-80" : ""}`}
                      >
                        <span className={`absolute top-2 right-2 text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full ${isToday ? "bg-indigo-600 text-white shadow-md" : ""}`}>{day.getDate()}</span>
                        <div className="mt-8 space-y-1">
                          {dayEvents.slice(0, 4).map((ev) => {
                            const typeInfo = getEventCategory(ev.eventType);
                            const customColor = settings.eventTypeColors?.[ev.eventType ?? ""];
                            const useInlineColor = Boolean(customColor);
                            return (
                              <div
                                key={ev.id}
                                onClick={(e) => { e.stopPropagation(); setDetailEvent(detailEvent?.id === ev.id ? null : ev); }}
                                className={`px-1.5 py-0.5 text-[9px] font-bold rounded border truncate hover:shadow-sm transition-shadow ${useInlineColor ? "text-gray-800 border-gray-300" : typeInfo.tailwindClass}`}
                                style={useInlineColor ? { backgroundColor: customColor, borderColor: customColor } : undefined}
                              >
                                {formatTime(new Date(ev.startAt))} {ev.title}
                              </div>
                            );
                          })}
                          {dayEvents.length > 4 && <span className="text-[9px] text-slate-500">+{dayEvents.length - 4}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className={`flex-1 flex flex-col overflow-hidden min-h-0 ${isMobile ? "min-h-[280px]" : ""}`}>
                <WeekDayGrid
                  mode={mode}
                  weekDays={weekDays}
                  dayNames={dayNames}
                  eventsByDate={eventsByDate}
                  selectedDate={selectedDate}
                  todayStr={todayStr}
                  todayStyle={settings.todayStyle}
                  firstDayOfWeek={settings.firstDayOfWeek}
                  timeColWidth={timeColWidth}
                  onSlotClick={(dateStr, hour) => setQuickFormSlot({ dateStr, hour })}
                  onEventClick={(ev) => setDetailEvent(detailEvent?.id === ev.id ? null : ev)}
                  onDaySelect={setSelectedDate}
                  selectedEventId={detailEvent?.id ?? null}
                  isMobile={isMobile}
                  currentTimeLineColor={settings.currentTimeLineColor}
                  currentTimeLineWidth={settings.currentTimeLineWidth}
                  eventTypeColors={settings.eventTypeColors}
                />
              </div>
            )}
          </main>

          {!contextPanelCollapsed && (
            <CalendarContextPanel
              selectedEvent={detailEvent}
              selectedDate={selectedDate}
              dayEvents={eventsByDate.get(selectedDate) ?? []}
              dayTasks={dayTasks}
              dayTasksLoading={dayTasksLoading}
              unreadMessagesCount={unreadMessagesCount}
              onEditEvent={(ev) => openEdit(ev)}
              onQuickEditEvent={(ev) => { setQuickFormEvent(ev); setDetailEvent(null); }}
              onDeleteEvent={async (ev) => { await handleDelete(ev.id); setDetailEvent(null); }}
              onFollowUp={(eventId) => handleFollowUp(eventId, "event")}
              onOpenFullEdit={openEdit}
              onMarkDone={handleMarkEventDone}
              onToggleTask={handleToggleDayTask}
              onAddTask={(dateStr) => setNewTaskModal({ dueDate: dateStr })}
              onRefresh={() => { loadEvents(); loadDayTasks(selectedDate); }}
              collapsed={false}
              onToggleCollapsed={() => setContextPanelCollapsed(true)}
              isMobile={isMobile}
            />
          )}
        </div>
      </div>

      {modal && (
        <EventFormModal
          initial={modal}
          contacts={contacts}
          opportunities={opportunities}
          onSave={handleSave}
          onDelete={modal.id ? handleDelete : undefined}
          onFollowUp={modal.id ? handleFollowUp : undefined}
          onClose={() => setModal(null)}
        />
      )}

      {newTaskModal && (
        <NewTaskModal
          dueDate={newTaskModal.dueDate}
          onSave={async (title, dueDate) => {
            const id = await createTask({ title, dueDate });
            if (id != null) {
              loadDayTasks(selectedDate);
              setNewTaskModal(null);
              toast.showToast("Úkol byl vytvořen.", "success");
            } else {
              toast.showToast("Úkol se nepodařilo vytvořit.", "error");
            }
          }}
          onClose={() => setNewTaskModal(null)}
        />
      )}

      {(quickFormSlot || quickFormEvent) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center wp-cal-modal-overlay bg-slate-900/30 backdrop-blur-sm p-4" onClick={() => { setQuickFormSlot(null); setQuickFormEvent(null); }}>
          <div className="wp-cal-modal-content w-full max-w-[600px]" onClick={(e) => e.stopPropagation()}>
            <QuickEventForm
              initialStart={quickFormSlot ? `${quickFormSlot.dateStr}T${String(quickFormSlot.hour).padStart(2, "0")}:00` : new Date(quickFormEvent!.startAt).toISOString().slice(0, 16)}
              initialEnd={quickFormSlot ? `${quickFormSlot.dateStr}T${String(Math.min(quickFormSlot.hour + 1, 23)).padStart(2, "0")}:00` : quickFormEvent?.endAt ? new Date(quickFormEvent.endAt).toISOString().slice(0, 16) : undefined}
              initialValues={quickFormEvent ? { id: quickFormEvent.id, title: quickFormEvent.title, eventType: quickFormEvent.eventType ?? "schuzka", contactId: quickFormEvent.contactId ?? "", notes: quickFormEvent.notes ?? "", location: quickFormEvent.location ?? "" } : undefined}
              contacts={contacts}
              onSave={handleQuickSave}
              onClose={() => { setQuickFormSlot(null); setQuickFormEvent(null); }}
            />
          </div>
        </div>
      )}

      <CalendarSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialSettings={settings}
        onSave={(next) => {
          saveCalendarSettings(next);
          setSettings(next);
        }}
      />
    </div>
  );
}
