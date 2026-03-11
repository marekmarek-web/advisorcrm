"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { listEvents, createEvent, updateEvent, deleteEvent, createFollowUp, type EventRow } from "@/app/actions/events";
import { getContactsList, type ContactRow } from "@/app/actions/contacts";
import { getOpenOpportunitiesList } from "@/app/actions/pipeline";
import { getTasksForDate, completeTask, reopenTask, type TaskRow } from "@/app/actions/tasks";
import { BaseModal } from "@/app/components/BaseModal";
import { useToast } from "@/app/components/Toast";
import { CalendarSettingsModal } from "@/app/components/calendar/CalendarSettingsModal";
import {
  loadCalendarSettings,
  saveCalendarSettings,
  type CalendarSettings,
} from "@/app/portal/calendar/calendar-settings";

type ViewMode = "month" | "week" | "workweek";

const EVENT_TYPES = [
  { id: "schuzka", label: "Schůzka", icon: "📅", color: "#579bfc", calClass: "wp-cal-event--primary" },
  { id: "ukol", label: "Úkol", icon: "✅", color: "#00c875", calClass: "wp-cal-event--success" },
  { id: "telefonat", label: "Telefonát", icon: "📞", color: "#fdab3d", calClass: "wp-cal-event--warning" },
  { id: "mail", label: "E-mail", icon: "✉️", color: "#a25ddc", calClass: "wp-cal-event--info" },
  { id: "kafe", label: "Kafe", icon: "☕", color: "#ff642e", calClass: "wp-cal-event--danger" },
] as const;

function getEventTypeInfo(type: string | null) {
  return EVENT_TYPES.find((t) => t.id === type) ?? EVENT_TYPES[0];
}

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7);

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

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
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
}

const REMINDER_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Žádná" },
  { value: 15, label: "15 min před" },
  { value: 60, label: "1 h před" },
  { value: 1440, label: "1 den před" },
];

const EMPTY_FORM: EventFormData = { title: "", eventType: "schuzka", startAt: "", endAt: "", allDay: false, location: "", contactId: "", opportunityId: "", reminderMinutes: 0 };

type OpportunityOption = { id: string; title: string; contactId: string | null };

const DAY_NAMES_FULL = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];

/* ────────── Event Detail Popover ────────── */
function EventDetailPopover({
  event,
  onEdit,
  onClose,
}: {
  event: EventRow;
  onEdit: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const typeInfo = getEventTypeInfo(event.eventType);
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
            {EVENT_TYPES.map((t) => (
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
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--wp-text-muted)" }}>Připomenutí</label>
              <select value={form.reminderMinutes} onChange={(e) => setForm((f) => ({ ...f, reminderMinutes: Number(e.target.value) }))} className="wp-select">
                {REMINDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-sm" style={{ color: "var(--wp-text-muted)" }}>
            <input type="checkbox" checked={form.allDay} onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))} className="rounded w-4 h-4" style={{ borderColor: "var(--wp-border)" }} />
            Celý den
          </label>
        </div>

        <div className="flex items-center gap-3 px-5 py-3 shrink-0" style={{ borderTop: "1px solid var(--wp-border)", background: "var(--wp-bg)" }}>
          <button type="submit" disabled={saving || !form.title.trim() || !form.startAt} className="wp-btn wp-btn-primary" style={{ background: "var(--wp-cal-accent)", borderColor: "var(--wp-cal-accent)" }}>
            {saving ? "Ukládám…" : initial.id ? "Uložit" : "Vytvořit"}
          </button>
          {initial.id && onDelete && (
            <button type="button" onClick={() => onDelete(initial.id!)} className="wp-btn" style={{ color: "var(--wp-danger)", borderColor: "var(--wp-danger)" }}>Smazat</button>
          )}
          {initial.id && onFollowUp && (
            <button type="button" onClick={() => onFollowUp(initial.id!, "event")} className="wp-btn wp-btn-ghost">+ Follow-up</button>
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

  const dayNames = useMemo(() => getDayNames(settings.firstDayOfWeek), [settings.firstDayOfWeek]);

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
    if (mode === "week" || mode === "workweek") return startOfWeek(currentDate, settings.firstDayOfWeek);
    return new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  }, [mode, currentDate, settings.firstDayOfWeek]);

  const rangeEnd = useMemo(() => {
    if (mode === "week" || mode === "workweek") {
      const d = new Date(rangeStart);
      d.setDate(d.getDate() + (mode === "workweek" ? 5 : 7));
      return d;
    }
    return new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  }, [mode, currentDate, rangeStart]);

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
      await updateEvent(id, { title: form.title, eventType: form.eventType, startAt: form.startAt, endAt: form.endAt || undefined, allDay: form.allDay, location: form.location || undefined, reminderAt, contactId: form.contactId || undefined, opportunityId: form.opportunityId || undefined });
      toast.showToast("Aktivita upravena");
    } else {
      await createEvent({ title: form.title, eventType: form.eventType, startAt: form.startAt, endAt: form.endAt || undefined, allDay: form.allDay, location: form.location || undefined, reminderAt, contactId: form.contactId || undefined, opportunityId: form.opportunityId || undefined });
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
    loadEvents();
  }, [events, loadEvents]);

  function navigate(dir: -1 | 1) {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (mode === "week" || mode === "workweek") d.setDate(d.getDate() + dir * (mode === "workweek" ? 5 : 7));
      else d.setMonth(d.getMonth() + dir);
      return d;
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
    setModal({ id: ev.id, title: ev.title, eventType: ev.eventType ?? "schuzka", startAt: start.toISOString().slice(0, 16), endAt: ev.endAt ? new Date(ev.endAt).toISOString().slice(0, 16) : "", allDay: ev.allDay ?? false, location: ev.location ?? "", contactId: ev.contactId ?? "", opportunityId: ev.opportunityId ?? "", reminderMinutes });
    setDetailEvent(null);
  }

  const weekDays = useMemo(() => {
    const result: Date[] = [];
    const d = new Date(rangeStart);
    const count = mode === "workweek" ? 5 : 7;
    for (let i = 0; i < count; i++) { result.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return result;
  }, [rangeStart, mode]);

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
    if (mode === "week" || mode === "workweek") {
      const weekNum = Math.ceil(((rangeStart.getTime() - new Date(rangeStart.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7);
      const suffix = mode === "workweek" ? " (Po–Pá)" : "";
      return settings.showWeekNumbers ? `${weekNum}. týden${suffix}` : `Týden${suffix}`;
    }
    return currentDate.toLocaleDateString("cs-CZ", { month: "long" });
  }, [mode, currentDate, rangeStart, settings.showWeekNumbers]);

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

  const timeColWidth = isMobile ? 40 : 56;
  const viewModesMobile: ViewMode[] = ["week", "month"];

  return (
    <div className="flex flex-col min-h-0 h-full pb-[max(1rem,env(safe-area-inset-bottom))]">
      {/* ── Calendar.txt-style container (settings applied via CSS vars) ── */}
      <div
        className={`wp-cal-container wp-cal-container--today-${settings.todayStyle} wp-cal-container--font-${settings.fontSize} flex flex-col h-full`}
        style={cssVarsFromSettings(settings)}
      >
        {/* Header: compact on mobile */}
        <div className={`wp-cal-header ${isMobile ? "flex flex-col gap-2 md:flex-row md:gap-0" : ""}`}>
          <div className={isMobile ? "flex items-center justify-between gap-2" : ""}>
            <h1 style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="text-base md:text-xl">{headerLabel}{isMobile ? ` · ${yearLabel}` : ""}</span>
              <button type="button" onClick={() => setCurrentDate(new Date())} className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 shrink-0" style={{ fontSize: 11, padding: isMobile ? "10px 12px" : "2px 10px", borderRadius: 20, background: "var(--wp-cal-accent)", color: "#fff", fontWeight: 600 }}>
                Dnes
              </button>
            </h1>
            {!isMobile && <p className="wp-cal-year">{yearLabel}</p>}
          </div>
          <div className={`wp-cal-nav ${isMobile ? "flex flex-wrap items-center gap-1" : ""}`}>
            <button type="button" onClick={() => navigate(-1)} className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 shrink-0 flex items-center justify-center" aria-label="Předchozí">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <button type="button" onClick={() => navigate(1)} className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 shrink-0 flex items-center justify-center" aria-label="Další">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M9 5l7 7-7 7"/></svg>
            </button>
            <div className={`wp-cal-views ${isMobile ? "flex rounded-lg border border-[var(--board-border)] p-0.5 bg-[var(--wp-bg)]" : ""}`}>
              {(isMobile ? viewModesMobile : (["month", "week", "workweek"] as ViewMode[])).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={`wp-cal-view-btn ${mode === m ? "active" : ""} ${isMobile ? "flex-1 min-h-[40px] text-sm rounded-md" : ""}`}>
                  {m === "month" ? "Měsíc" : m === "week" ? "Týden" : "Pracovní týden"}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setSettingsOpen(true)} className="wp-cal-view-btn min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 shrink-0 flex items-center justify-center" aria-label="Nastavení kalendáře" title="Nastavení">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 2.31.49 2.31 1.066 0 1.552-2.308 2.6-4.342 2.6-2.034 0-4.341-1.048-4.341-2.6 0-.576.767-2.006 2.314-1.066 1.53.94 2.573 1.066 2.573-1.066 0-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 2.31.49 2.31 1.066 0 1.552-2.308 2.6-4.342 2.6-2.034 0-4.341-1.048-4.341-2.6 0-.576.767-2.006 2.314-1.066 1.53.94 2.573 1.066 2.573-1.066z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </button>
            <button type="button" onClick={() => openNew(todayStr)} className="wp-cal-new-btn min-h-[44px] md:min-h-0 shrink-0">
              <span style={{ fontSize: 14 }}>+</span> Nová aktivita
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p style={{ color: "var(--wp-text-muted)", fontSize: "var(--wp-fs-sm)" }}>Načítám kalendář…</p>
          </div>
        ) : mode === "month" ? (
          /* ═══ MONTH GRID (Calendar.txt layout) ═══ */
          <div className="wp-cal-grid flex-1">
            {dayNames.map((d) => (
              <span key={d} className="wp-cal-day-name">{d}</span>
            ))}
            {monthDays.map((day, idx) => {
              const ds = formatDate(day);
              const isToday = ds === todayStr;
              const isCurrentMonth = day.getMonth() === currentDate.getMonth();
              const dayEvents = eventsByDate.get(ds) ?? [];
              const isDisabled = !isCurrentMonth;

              return (
                <div
                  key={ds + idx}
                  className={`wp-cal-day ${isDisabled ? "wp-cal-day--disabled" : ""} ${isToday ? `wp-cal-day--today wp-cal-day--today-${settings.todayStyle}` : ""}`}
                  onClick={isDisabled ? undefined : () => openNew(ds)}
                >
                  <span className={isToday ? "wp-cal-day-number" : ""}>{day.getDate()}</span>
                  {!isDisabled && dayEvents.slice(0, 3).map((ev) => {
                    const typeInfo = getEventTypeInfo(ev.eventType);
                    return (
                      <div
                        key={ev.id}
                        className={`wp-cal-event ${typeInfo.calClass}`}
                        onClick={(e) => { e.stopPropagation(); setDetailEvent(detailEvent?.id === ev.id ? null : ev); }}
                        title={`${typeInfo.label}: ${ev.title}${ev.contactName ? ` – ${ev.contactName}` : ""}`}
                        style={{ display: "flex", alignItems: "center", gap: 3 }}
                      >
                        <span style={{ fontWeight: 700, fontSize: 10, flexShrink: 0 }}>{formatTime(new Date(ev.startAt))}</span>
                        <span style={{ fontSize: 10, flexShrink: 0 }}>{typeInfo.icon}</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                          {ev.title}
                          {ev.contactName && <span style={{ opacity: 0.65, fontSize: 10 }}> · {ev.contactName}</span>}
                        </span>
                        {detailEvent?.id === ev.id && (
                          <EventDetailPopover event={ev} onEdit={() => openEdit(ev)} onClose={() => setDetailEvent(null)} />
                        )}
                      </div>
                    );
                  })}
                  {!isDisabled && dayEvents.length > 3 && (
                    <span style={{ fontSize: 10, color: "var(--wp-text-muted)" }}>+{dayEvents.length - 3} dalších</span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ═══ WEEK / WORKWEEK VIEW ═══ */
          <div className={`flex-1 flex overflow-hidden min-h-0 ${isMobile ? "flex-col" : ""}`}>
            <div className={`flex-1 flex flex-col overflow-hidden min-w-0 ${isMobile ? "min-h-[280px]" : ""}`}>
              <div className="wp-cal-week-header shrink-0" style={{ gridTemplateColumns: `${timeColWidth}px repeat(${weekDays.length}, 1fr)` }}>
                <div style={{ borderRight: "1px solid rgba(166,168,179,0.12)" }} />
                {weekDays.map((day) => {
                  const ds = formatDate(day);
                  const isToday = ds === todayStr;
                  const isSelected = ds === selectedDate;
                  const dayIdx = settings.firstDayOfWeek === 0 ? day.getDay() : (day.getDay() === 0 ? 6 : day.getDay() - 1);
                  return (
                    <button
                      key={ds}
                      type="button"
                      onClick={() => setSelectedDate(ds)}
                      className={`wp-cal-week-day-header ${isToday ? `wp-cal-week-day-header--today wp-cal-week-day-header--today-${settings.todayStyle}` : ""} ${isSelected ? "wp-cal-week-day-header--selected" : ""}`}
                    >
                      <span>{dayNames[dayIdx]}</span>
                      <span className="wp-cal-week-day-number">{day.getDate()}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 overflow-auto">
                <div className="wp-cal-week-time-grid" style={{ gridTemplateColumns: `${timeColWidth}px repeat(${weekDays.length}, 1fr)` }}>
                  {HOURS.map((hour) => (
                    <div key={`row-${hour}`} className="contents">
                      <div className="wp-cal-week-time-label">
                        <span>{isMobile ? String(hour) : `${hour}:00`}</span>
                      </div>
                      {weekDays.map((day) => {
                        const ds = formatDate(day);
                        const isToday = ds === todayStr;
                        const dayEvts = (eventsByDate.get(ds) ?? []).filter((ev) => new Date(ev.startAt).getHours() === hour);
                        return (
                          <div
                            key={`${ds}-${hour}`}
                            className={`wp-cal-week-cell ${isToday ? `wp-cal-week-cell--today wp-cal-week-cell--today-${settings.todayStyle}` : ""}`}
                            onClick={() => openNew(ds, hour)}
                          >
                            {dayEvts.map((ev) => {
                              const typeInfo = getEventTypeInfo(ev.eventType);
                              return (
                                <button
                                  key={ev.id}
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setDetailEvent(detailEvent?.id === ev.id ? null : ev); }}
                                  className={`wp-cal-event ${typeInfo.calClass}`}
                                  title={`${typeInfo.label}: ${ev.title}${ev.contactName ? ` – ${ev.contactName}` : ""} – ${formatTime(new Date(ev.startAt))}`}
                                >
                                  <span style={{ fontWeight: 700, fontSize: 10, flexShrink: 0 }}>{formatTime(new Date(ev.startAt))}</span>
                                  <span style={{ fontSize: 10, flexShrink: 0 }}>{typeInfo.icon}</span>
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 0", minWidth: 0 }}>
                                    {ev.title}
                                    {ev.contactName && <span style={{ opacity: 0.65, fontSize: 10 }}> · {ev.contactName}</span>}
                                  </span>
                                  {detailEvent?.id === ev.id && (
                                    <EventDetailPopover event={ev} onEdit={() => openEdit(ev)} onClose={() => setDetailEvent(null)} />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Tasks panel: side on desktop, stacked below on mobile */}
            <div className={`wp-cal-tasks-panel ${isMobile ? "shrink-0 max-h-[40vh] border-t" : ""}`}>
              <div className="wp-cal-tasks-panel-header">
                <h3>
                  Úkoly pro {new Date(selectedDate + "T12:00:00").toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "short" })}
                </h3>
              </div>
              <div className="flex-1 overflow-auto p-3">
                {dayTasksLoading ? (
                  <p style={{ fontSize: "var(--wp-fs-xs)", color: "var(--wp-text-muted)" }}>Načítám…</p>
                ) : dayTasks.length === 0 ? (
                  <p style={{ fontSize: "var(--wp-fs-xs)", color: "var(--wp-text-muted)" }}>Žádné úkoly na tento den.</p>
                ) : (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {dayTasks.map((task) => (
                      <li key={task.id} className="flex items-center gap-2 text-sm" style={{ marginBottom: 6 }}>
                        <button
                          type="button"
                          onClick={() => handleToggleDayTask(task)}
                          className="shrink-0 flex items-center justify-center"
                          style={{
                            width: 16, height: 16, borderRadius: 3,
                            border: task.completedAt ? "none" : "1.5px solid var(--wp-border)",
                            background: task.completedAt ? "var(--wp-success)" : "transparent",
                            color: "#fff", fontSize: 10,
                          }}
                          aria-label={task.completedAt ? "Znovu otevřít" : "Splnit"}
                        >
                          {task.completedAt ? "✓" : ""}
                        </button>
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: task.completedAt ? "line-through" : "none", color: task.completedAt ? "var(--wp-text-muted)" : "var(--wp-text)" }}>
                          {task.title}
                        </span>
                        {task.contactName && <span style={{ fontSize: 10, color: "var(--wp-text-muted)", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={task.contactName}>{task.contactName}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                <a href="/portal/tasks" style={{ display: "block", marginTop: 8, fontSize: "var(--wp-fs-xs)", fontWeight: 500, color: "var(--wp-cal-accent)" }}>
                  Všechny úkoly →
                </a>
              </div>
            </div>
          </div>
        )}
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
