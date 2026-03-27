"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, PanelRightClose, PanelRightOpen, Plus, Edit2, Trash2, Mail, X, RefreshCw, MapPin, Link2, AlignLeft, User, Briefcase, Bell, Check, Info, Flag, CheckSquare, Calendar } from "lucide-react";
import { listEvents, createEvent, updateEvent, deleteEvent, createFollowUp, type EventRow } from "@/app/actions/events";
import { getContactsList, type ContactRow } from "@/app/actions/contacts";
import { getOpenOpportunitiesList } from "@/app/actions/pipeline";
import { getTasksForDate, completeTask, reopenTask, createTask, type TaskRow } from "@/app/actions/tasks";
import { getUnreadConversationsCount } from "@/app/actions/messages";
// BaseModal no longer used — EventFormModal & NewTaskModal use custom overlays
import { useToast } from "@/app/components/Toast";
import { CalendarSettingsModal } from "@/app/components/calendar/CalendarSettingsModal";
import {
  loadCalendarSettings,
  saveCalendarSettings,
  type CalendarSettings,
} from "@/app/portal/calendar/calendar-settings";
import {
  addMsToLocalDateTime,
  DEFAULT_EVENT_DURATION_MS,
  formatDateLocal,
  formatDateTimeLocal,
  formatTimeQuarterHourDisplay,
  localDateTimeInputToUtcIso,
} from "@/app/portal/calendar/date-utils";
import { getEventCategory } from "@/app/portal/calendar/event-categories";
import { WeekDayGrid } from "@/app/portal/calendar/WeekDayGrid";
import { EventFormDateTimeSection } from "@/app/portal/calendar/EventFormDateTimeSection";
import { EVENT_FORM_PRIMARY_TYPE_ORDER } from "@/app/portal/calendar/event-form-primary-types";
import { CalendarContextPanel } from "@/app/portal/calendar/CalendarContextPanel";
import { CalendarLeftPanel } from "@/app/portal/calendar/CalendarLeftPanel";
import { CALENDAR_EVENT_CATEGORIES } from "@/app/portal/calendar/event-categories";
import { ContactSearchInput } from "@/app/components/ContactSearchInput";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import { useKeyboardAware } from "@/lib/ui/useKeyboardAware";

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
  return formatTimeQuarterHourDisplay(d);
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
  { value: 30, label: "30 min před" },
  { value: 60, label: "1 h před" },
  { value: 1440, label: "1 den před" },
];

function formatEventReminderLabel(ev: EventRow): string {
  if (!ev.reminderAt) return "Bez připomenutí";
  const startMs = new Date(ev.startAt).getTime();
  const remMs = new Date(ev.reminderAt).getTime();
  const diffMin = Math.round((startMs - remMs) / 60000);
  if (diffMin <= 0) return "Bez připomenutí";
  const opt = REMINDER_OPTIONS.find((o) => o.value === diffMin);
  if (opt && opt.value > 0) {
    if (opt.value === 60) return "1 hodinu předem";
    if (opt.value === 1440) return "1 den předem";
    return opt.label.replace(" před", " předem").replace("min ", "minut ");
  }
  if (diffMin < 60) return `${diffMin} minut předem`;
  if (diffMin < 1440) return `${Math.round(diffMin / 60)} hodin předem`;
  return `${Math.round(diffMin / 1440)} dny předem`;
}

const EMPTY_FORM: EventFormData = { title: "", eventType: "schuzka", startAt: "", endAt: "", allDay: false, location: "", contactId: "", opportunityId: "", reminderMinutes: 30, status: "", notes: "", meetingLink: "" };

type OpportunityOption = { id: string; title: string; contactId: string | null };

const DAY_NAMES_FULL = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];

/* ────────── New Task Modal (3-step wizard) ────────── */
const TASK_STEPS = ["Základ", "Kontext", "Detaily"] as const;

function NewTaskModal({
  dueDate: initialDueDate,
  contacts = [],
  opportunities = [],
  onSave,
  onClose,
}: {
  dueDate: string;
  contacts?: ContactRow[];
  opportunities?: OpportunityOption[];
  onSave: (title: string, dueDate: string, contactId?: string, opportunityId?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [reminder, setReminder] = useState(30);
  const [priority, setPriority] = useState<"low" | "normal" | "urgent">("normal");
  const [contactId, setContactId] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDueDate(initialDueDate);
  }, [initialDueDate]);

  const canNext = step === 0 ? title.trim().length > 0 : true;

  const handleSubmit = async () => {
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    try {
      await onSave(t, dueDate, contactId || undefined, opportunityId || undefined);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const contactOptions = [
    { id: "", label: "— Bez klienta —" },
    ...contacts.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName}`.trim() || c.id })),
  ];
  const opportunityOptionsForContact = [
    { id: "", label: "— žádný —" },
    ...opportunities
      .filter((o) => !contactId || o.contactId === contactId)
      .map((o) => ({ id: o.id, label: o.title })),
  ];

  const tLabelClass = "block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1.5 ml-1";
  const tInputClass = "w-full px-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] hover:border-emerald-300 rounded-xl text-sm font-bold outline-none focus:bg-[color:var(--wp-surface-card)] focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400 transition-all text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)]";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[color:var(--wp-overlay-scrim)] backdrop-blur-sm p-4 sm:p-6" onClick={onClose}>
      <div className="bg-[color:var(--wp-surface-card)] rounded-[32px] shadow-2xl w-full max-w-[500px] min-h-[500px] flex flex-col overflow-hidden border border-[color:var(--wp-surface-card-border)] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-8 py-5 border-b border-[color:var(--wp-surface-card-border)] flex items-center justify-between bg-[color:var(--wp-surface-muted)]/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <CheckSquare size={18} className="text-emerald-600" />
            </div>
            <h2 className="text-lg font-black text-[color:var(--wp-text)]">Nový úkol</h2>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-[color:var(--wp-surface-muted)] hover:bg-[color:var(--wp-surface-card-border)] flex items-center justify-center transition-colors">
            <X size={16} className="text-[color:var(--wp-text-secondary)]" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-8 pt-5 pb-2">
          <div className="flex items-center gap-0">
            {TASK_STEPS.map((s, i) => (
              <div key={s} className="flex items-center flex-1">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-all ${i <= step ? "bg-emerald-600 text-white" : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-tertiary)]"}`}>
                    {i < step ? <Check size={14} /> : i + 1}
                  </div>
                  <span className={`text-xs font-bold whitespace-nowrap transition-colors ${i <= step ? "text-[color:var(--wp-text)]" : "text-[color:var(--wp-text-tertiary)]"}`}>{s}</span>
                </div>
                {i < TASK_STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-3 rounded-full transition-colors ${i < step ? "bg-emerald-500" : "bg-[color:var(--wp-surface-card-border)]"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-8 py-5 space-y-5">
          {step === 0 && (
            <>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Název úkolu…"
                className="w-full text-2xl font-black text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] border-0 border-b-2 border-[color:var(--wp-surface-card-border)] focus:border-emerald-500 bg-transparent outline-none py-3 transition-colors"
                autoFocus
              />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={tLabelClass}>Datum splnění</label>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={tInputClass} />
                </div>
                <div>
                  <label className={tLabelClass}>Připomenutí</label>
                  <CustomDropdown
                    value={String(reminder)}
                    onChange={(id) => setReminder(Number(id))}
                    options={REMINDER_OPTIONS.map((o) => ({ id: String(o.value), label: o.label }))}
                    placeholder="Připomenutí"
                    icon={Bell}
                  />
                </div>
              </div>
              <div>
                <label className={tLabelClass}>Priorita</label>
                <div className="flex bg-[color:var(--wp-surface-muted)] rounded-xl p-1 gap-1">
                  {([["low", "Nízká"], ["normal", "Běžná"], ["urgent", "Urgentní"]] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPriority(val)}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                        priority === val
                          ? val === "urgent"
                            ? "bg-rose-500 text-white shadow-md"
                            : val === "low"
                              ? "bg-[color:var(--wp-text-secondary)] text-white shadow-md dark:bg-[color:var(--wp-text-tertiary)]"
                              : "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)] shadow-md"
                          : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text-secondary)]"
                      }`}
                    >
                      {val === "urgent" && <Flag size={12} className="inline mr-1" />}
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
                <Info size={16} className="text-blue-500 mt-0.5 shrink-0" aria-hidden />
                <p className="text-sm text-blue-700 font-medium">Přiřaďte úkol ke klientovi nebo obchodu pro lepší sledování.</p>
              </div>
              <div>
                <label className={tLabelClass}><User size={12} className="inline mr-1" />Propojit s klientem (Volitelné)</label>
                <CustomDropdown
                  value={contactId}
                  onChange={(id) => { setContactId(id); setOpportunityId(""); }}
                  options={contactOptions}
                  placeholder="— Bez klienta —"
                  icon={User}
                />
              </div>
              <div>
                <label className={tLabelClass}><Briefcase size={12} className="inline mr-1" />Propojit s obchodem (Volitelné)</label>
                <CustomDropdown
                  value={opportunityId}
                  onChange={setOpportunityId}
                  options={opportunityOptionsForContact}
                  placeholder="— Žádný obchod —"
                  icon={Briefcase}
                  direction="up"
                />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <label className={tLabelClass}><AlignLeft size={12} className="inline mr-1" />Popis</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Popište úkol podrobněji…"
                  className={`${tInputClass} min-h-[120px] resize-none`}
                  rows={5}
                />
              </div>
              <div className="bg-[color:var(--wp-surface-muted)] rounded-xl border border-[color:var(--wp-surface-card-border)] p-4">
                <label className={tLabelClass}>Přiřazení</label>
                <div className="flex items-center gap-3 mt-2">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center">
                    <User size={16} className="text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[color:var(--wp-text)]">Já (aktuální uživatel)</p>
                    <p className="text-xs text-[color:var(--wp-text-tertiary)]">Výchozí přiřazení</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] flex items-center justify-between">
          <button
            type="button"
            onClick={step === 0 ? onClose : () => setStep((s) => s - 1)}
            className="px-5 py-2.5 text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] rounded-xl transition-colors"
          >
            {step === 0 ? "Zrušit" : "Zpět"}
          </button>
          {step < 2 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-lg"
            >
              Další krok
              <ChevronRight size={16} />
            </button>
          ) : (
            <CreateActionButton
              type="button"
              onClick={handleSubmit}
              disabled={!title.trim()}
              isLoading={saving}
              icon={Check}
            >
              {saving ? "Vytvářím…" : "Vytvořit úkol"}
            </CreateActionButton>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────── Event Detail Popup (overlay) ────────── */
function EventDetailPopup({
  event,
  contacts,
  onEdit,
  onDelete,
  onClose,
}: {
  event: EventRow;
  contacts: ContactRow[];
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const start = new Date(event.startAt);
  const end = event.endAt ? new Date(event.endAt) : null;
  const typeInfo = getEventCategory(event.eventType);
  const dateLine = event.allDay
    ? `${start.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })} · Celý den`
    : `${start.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })} · ${formatTime(start)}–${end ? formatTime(end) : "?"}`;
  const dateLineCaption = event.allDay ? "" : "Čas zobrazen po čtvrthodinách";
  const contact = event.contactId ? contacts.find((c) => c.id === event.contactId) : null;
  const mailtoHref = (() => {
    const subject = encodeURIComponent(event.title);
    const body = encodeURIComponent(`${event.title}\n${dateLine}\n${event.location || ""}\n${event.notes || ""}`);
    if (contact?.email) return `mailto:${contact.email}?subject=${subject}&body=${body}`;
    return `mailto:?subject=${subject}&body=${body}`;
  })();

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm dark:bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-[color:var(--wp-surface-muted)] rounded-2xl shadow-xl border border-[color:var(--wp-surface-card-border)] w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2 border-b border-[color:var(--wp-surface-card-border)]">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">Aktivita</p>
            <h2 className="text-lg font-black text-[color:var(--wp-text)] leading-snug break-words">{event.title}</h2>
            <p className="text-xs font-bold text-[color:var(--wp-text-secondary)] mt-1.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 bg-[color:var(--wp-surface-muted)]" style={{ borderLeft: `3px solid ${typeInfo.color}` }}>
                {typeInfo.icon} {typeInfo.label}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button type="button" onClick={onEdit} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors" aria-label="Upravit" title="Upravit">
              <Edit2 size={18} />
            </button>
            <button type="button" onClick={onDelete} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-card)] hover:text-rose-600 transition-colors" aria-label="Smazat" title="Smazat">
              <Trash2 size={18} />
            </button>
            <a href={mailtoHref} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-card)] transition-colors" aria-label="Poslat e-mailem" title="Poslat e-mailem">
              <Mail size={18} />
            </a>
            <button type="button" onClick={onClose} className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-full text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-card)] transition-colors" aria-label="Zavřít">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-5 pb-6 pt-4 space-y-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">Kdy</p>
            <p className="text-sm font-bold text-[color:var(--wp-text)]">{dateLine}</p>
            {dateLineCaption ? <p className="text-xs text-[color:var(--wp-text-tertiary)] mt-1">{dateLineCaption}</p> : null}
          </div>

          <div className="flex items-start gap-3 text-sm text-[color:var(--wp-text-secondary)]">
            <Bell size={18} className="shrink-0 mt-0.5 text-[color:var(--wp-text-tertiary)]" aria-hidden />
            <span>{formatEventReminderLabel(event)}</span>
          </div>

          <div className="flex items-start gap-3 text-sm text-[color:var(--wp-text-secondary)]">
            <Calendar size={18} className="shrink-0 mt-0.5 text-[color:var(--wp-text-tertiary)]" aria-hidden />
            <span>WePlan kalendář</span>
          </div>

          {event.meetingLink && (
            <a
              href={event.meetingLink.startsWith("http") ? event.meetingLink : `https://${event.meetingLink}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 py-2 px-3 bg-[color:var(--wp-surface-card)] text-indigo-700 rounded-xl text-sm font-bold border border-[color:var(--wp-surface-card-border)] hover:border-indigo-200 transition-colors"
            >
              Otevřít odkaz
            </a>
          )}
          {event.location && (
            <div className="flex items-start gap-3">
              <MapPin size={18} className="shrink-0 mt-0.5 text-[color:var(--wp-text-tertiary)]" aria-hidden />
              <p className="text-sm text-[color:var(--wp-text)]">{event.location}</p>
            </div>
          )}
          {event.contactName && (
            <div className="flex items-start gap-3">
              <User size={18} className="shrink-0 mt-0.5 text-[color:var(--wp-text-tertiary)]" aria-hidden />
              <Link href={event.contactId ? `/portal/contacts/${event.contactId}` : "#"} className="text-sm font-bold text-indigo-600 hover:text-indigo-700 break-words">
                {event.contactName}
              </Link>
            </div>
          )}
          {event.notes && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1.5">Poznámka</p>
              <p className="text-sm text-[color:var(--wp-text-secondary)] whitespace-pre-wrap">{event.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────── Event Form Modal (premium design) ────────── */
const EVENT_PILL_STYLES: Record<string, { active: string; inactive: string }> = {
  schuzka:   { active: "bg-indigo-600 text-white shadow-lg shadow-indigo-200",  inactive: "bg-indigo-50 text-indigo-600 hover:bg-indigo-100" },
  telefonat: { active: "bg-rose-500 text-white shadow-lg shadow-rose-200",      inactive: "bg-rose-50 text-rose-500 hover:bg-rose-100" },
  kafe:      { active: "bg-amber-500 text-white shadow-lg shadow-amber-200",    inactive: "bg-amber-50 text-amber-600 hover:bg-amber-100" },
  mail:      { active: "bg-purple-600 text-white shadow-lg shadow-purple-200",  inactive: "bg-purple-50 text-purple-600 hover:bg-purple-100" },
  ukol:      { active: "bg-emerald-600 text-white shadow-lg shadow-emerald-200", inactive: "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" },
  servis:    { active: "bg-teal-600 text-white shadow-lg shadow-teal-200",       inactive: "bg-teal-50 text-teal-700 hover:bg-teal-100" },
  priorita:  { active: "bg-red-600 text-white shadow-lg shadow-red-200",        inactive: "bg-red-50 text-red-600 hover:bg-red-100" },
};

function EventFormModal({
  initial,
  contacts,
  opportunities,
  eventTypeColors,
  onSave,
  onDelete,
  onFollowUp,
  onClose,
}: {
  initial: EventFormData & { id?: string };
  contacts: ContactRow[];
  opportunities: OpportunityOption[];
  eventTypeColors?: Record<string, string>;
  onSave: (form: EventFormData, id?: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onFollowUp?: (id: string, type: "event" | "task") => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<EventFormData>(() => {
    if (!initial.startAt) {
      const now = new Date();
      now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
      const startStr = formatDateTimeLocal(now);
      return {
        ...initial,
        startAt: startStr,
        endAt: addMsToLocalDateTime(startStr, DEFAULT_EVENT_DURATION_MS),
      };
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ title?: boolean; startAt?: boolean }>({});
  const { keyboardInset } = useKeyboardAware();

  const typePills = useMemo(() => {
    const ids: string[] = [...EVENT_FORM_PRIMARY_TYPE_ORDER];
    if (form.eventType && !ids.includes(form.eventType)) ids.push(form.eventType);
    return ids
      .map((id) => CALENDAR_EVENT_CATEGORIES.find((t) => t.id === id))
      .filter((t): t is (typeof CALENDAR_EVENT_CATEGORIES)[number] => Boolean(t));
  }, [form.eventType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors: { title?: boolean; startAt?: boolean } = {};
    if (!form.title.trim()) errors.title = true;
    if (!form.startAt) errors.startAt = true;
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setSaveError("Vyplňte název a datum aktivity.");
      return;
    }
    setValidationErrors({});
    setSaveError(null);
    setSaving(true);
    try {
      await onSave(form, initial.id);
      onClose();
    } catch {
      setSaveError("Nepodařilo se uložit. Zkuste to znovu.");
    } finally {
      setSaving(false);
    }
  }

  const eLabelClass = "block text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1.5 ml-1";
  const eInputClass = "w-full px-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] hover:border-indigo-300 rounded-xl text-sm font-bold outline-none focus:bg-[color:var(--wp-surface-card)] focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)]";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[color:var(--wp-overlay-scrim)] backdrop-blur-sm p-4 sm:p-6" onClick={onClose}>
      <div className="bg-[color:var(--wp-surface-card)] rounded-[32px] shadow-2xl w-full max-w-[640px] flex flex-col overflow-hidden border border-[color:var(--wp-surface-card-border)] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {/* Header */}
          <div className="px-8 py-5 border-b border-[color:var(--wp-surface-card-border)] flex items-center justify-between bg-[color:var(--wp-surface-muted)]/80">
            <h2 className="text-lg font-black text-[color:var(--wp-text)]">
              {initial.id ? "Upravit aktivitu" : "Nová aktivita v kalendáři"}
            </h2>
            <button type="button" onClick={onClose} className="w-9 h-9 rounded-full bg-[color:var(--wp-surface-muted)] hover:bg-[color:var(--wp-surface-card-border)] flex items-center justify-center transition-colors">
              <X size={16} className="text-[color:var(--wp-text-secondary)]" />
            </button>
          </div>

          {/* Scrollable body */}
          <div
            className="flex-1 overflow-y-auto px-8 py-6 space-y-6"
            style={keyboardInset ? { paddingBottom: `${keyboardInset}px` } : undefined}
          >
            {/* Typ aktivity: stejná mřížka jako mobilní formulář (2 sl. telefon, 3 desktop) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {typePills.map((t) => {
                const isActive = form.eventType === t.id;
                const ps = EVENT_PILL_STYLES[t.id] ?? {
                  active: "bg-[color:var(--wp-text-secondary)] text-white shadow-lg dark:bg-[color:var(--wp-text-tertiary)]",
                  inactive:
                    "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-card-border)]",
                };
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        eventType: t.id,
                        reminderMinutes: t.id === "ukol" ? 15 : 30,
                      }))
                    }
                    className={`min-h-[44px] flex flex-col sm:flex-row items-center justify-center gap-1 px-2 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all text-center ${isActive ? ps.active : ps.inactive}`}
                  >
                    <span className="text-base leading-none" aria-hidden>
                      {t.icon}
                    </span>
                    <span className="leading-tight">{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Title */}
            <input
              value={form.title}
              onChange={(e) => { setForm((f) => ({ ...f, title: e.target.value })); if (validationErrors.title) setValidationErrors((v) => ({ ...v, title: false })); }}
              placeholder="Název aktivity…"
              className={`w-full text-2xl sm:text-3xl font-black text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] border-0 border-b-2 ${validationErrors.title ? "border-red-400" : "border-[color:var(--wp-surface-card-border)] focus:border-indigo-500"} bg-transparent outline-none py-3 transition-colors`}
              autoFocus
            />

            <EventFormDateTimeSection
              startAt={form.startAt}
              endAt={form.endAt}
              allDay={form.allDay}
              onChangeStart={(v) => {
                setForm((f) => ({ ...f, startAt: v }));
                if (validationErrors.startAt) setValidationErrors((x) => ({ ...x, startAt: false }));
              }}
              onChangeEnd={(v) => setForm((f) => ({ ...f, endAt: v }))}
              onChangeAllDay={(v) => {
                setForm((f) => {
                  if (v) {
                    const d = f.startAt.slice(0, 10) || formatDate(new Date());
                    const endD = (f.endAt || f.startAt).slice(0, 10) || d;
                    return { ...f, allDay: true, startAt: `${d}T00:00`, endAt: `${endD}T23:59` };
                  }
                  const d = f.startAt.slice(0, 10) || formatDate(new Date());
                  return { ...f, allDay: false, startAt: `${d}T09:00`, endAt: `${d}T10:00` };
                });
              }}
              startInvalid={validationErrors.startAt}
              onClearStartInvalid={() => setValidationErrors((x) => ({ ...x, startAt: false }))}
              eLabelClass={eLabelClass}
              eInputClass={eInputClass}
            />

            {/* Context: Klient + Obchod */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={eLabelClass}><User size={12} className="inline mr-1" />Klient</label>
                <ContactSearchInput
                  value={form.contactId}
                  contacts={contacts}
                  onChange={(contactId) => setForm((f) => ({ ...f, contactId, opportunityId: "" }))}
                  placeholder="Vyhledat klienta…"
                  className={eInputClass}
                />
              </div>
              <div>
                <label className={eLabelClass}><Briefcase size={12} className="inline mr-1" />Obchod</label>
                <CustomDropdown
                  value={form.opportunityId}
                  onChange={(id) => setForm((f) => ({ ...f, opportunityId: id }))}
                  options={[
                    { id: "", label: "— žádný —" },
                    ...opportunities
                      .filter((o) => !form.contactId || o.contactId === form.contactId)
                      .map((o) => ({ id: o.id, label: o.title })),
                  ]}
                  placeholder="— žádný —"
                  icon={Briefcase}
                />
              </div>
            </div>

            {/* Details: Místo + Online odkaz */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={eLabelClass}><MapPin size={12} className="inline mr-1" />Místo</label>
                <input
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="Adresa / místo"
                  className={eInputClass}
                />
              </div>
              <div>
                <label className={eLabelClass}><Link2 size={12} className="inline mr-1" />Online odkaz</label>
                <input
                  value={form.meetingLink}
                  onChange={(e) => setForm((f) => ({ ...f, meetingLink: e.target.value }))}
                  placeholder="https://…"
                  className={eInputClass}
                  type="url"
                />
              </div>
            </div>

            {/* Poznámka */}
            <div>
              <label className={eLabelClass}><AlignLeft size={12} className="inline mr-1" />Poznámka</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Poznámky k události…"
                className={`${eInputClass} min-h-[80px] resize-none`}
                rows={3}
              />
            </div>

            {form.contactId && (
              <p className="text-sm">
                <a href="/portal/messages" className="text-indigo-600 hover:text-indigo-700 underline font-bold">Otevřít zprávy</a>
              </p>
            )}

            {saveError && <p className="text-sm text-red-600 font-medium bg-red-50 px-4 py-2 rounded-xl">{saveError}</p>}
          </div>

          {/* Footer */}
          <div className="px-8 py-5 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">Připomenutí</label>
              <CustomDropdown
                value={String(form.reminderMinutes)}
                onChange={(id) => setForm((f) => ({ ...f, reminderMinutes: Number(id) }))}
                options={REMINDER_OPTIONS.map((o) => ({ id: String(o.value), label: o.label }))}
                placeholder="Připomenutí"
                icon={Bell}
                variant="button"
                direction="up"
              />
            </div>
            <div className="flex-1" />
            {initial.id && onDelete && (
              <button type="button" onClick={() => onDelete(initial.id!)} className="px-4 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors">
                Smazat
              </button>
            )}
            {initial.id && onFollowUp && (
              <>
                <button type="button" onClick={() => onFollowUp(initial.id!, "event")} className="px-3 py-2.5 text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] rounded-xl transition-colors hidden sm:block">
                  + Follow-up
                </button>
                <button type="button" onClick={() => onFollowUp(initial.id!, "task")} className="px-3 py-2.5 text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] rounded-xl transition-colors hidden sm:block">
                  + Úkol
                </button>
              </>
            )}
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] rounded-xl transition-colors">
              Zrušit
            </button>
            <CreateActionButton
              type="submit"
              disabled={!form.title.trim() || !form.startAt}
              isLoading={saving}
              icon={Check}
            >
              {saving ? "Ukládám…" : initial.id ? "Uložit" : "Vytvořit"}
            </CreateActionButton>
          </div>
        </form>
      </div>
    </div>
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
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  const dayNames = useMemo(() => getDayNames(settings.firstDayOfWeek), [settings.firstDayOfWeek]);

  useEffect(() => {
    getUnreadConversationsCount().then(setUnreadMessagesCount).catch(() => setUnreadMessagesCount(0));
  }, []);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      const todayStr = formatDate(new Date());
      const startNew = `${todayStr}T09:00`;
      setModal({
        ...EMPTY_FORM,
        startAt: startNew,
        endAt: addMsToLocalDateTime(startNew, DEFAULT_EVENT_DURATION_MS),
      });
      window.history.replaceState(null, "", "/portal/calendar");
    }
  }, [searchParams]);

  const loadDayTasks = useCallback((dateStr: string) => {
    setDayTasksLoading(true);
    getTasksForDate(dateStr).then(setDayTasks).catch(() => setDayTasks([])).finally(() => setDayTasksLoading(false));
  }, []);

  useEffect(() => { loadDayTasks(selectedDate); }, [selectedDate, loadDayTasks]);

  const rangeStartIso = useMemo(() => {
    if (mode === "day") return new Date(selectedDate + "T00:00:00").toISOString();
    if (mode === "week" || mode === "workweek") return startOfWeek(currentDate, settings.firstDayOfWeek).toISOString();
    return new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
  }, [mode, currentDate, selectedDate, settings.firstDayOfWeek]);

  const rangeEndIso = useMemo(() => {
    if (mode === "day") {
      const d = new Date(selectedDate + "T00:00:00");
      d.setDate(d.getDate() + 1);
      return d.toISOString();
    }
    if (mode === "week" || mode === "workweek") {
      const d = new Date(rangeStartIso);
      d.setDate(d.getDate() + (mode === "workweek" ? 5 : 7));
      return d.toISOString();
    }
    return new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1).toISOString();
  }, [mode, currentDate, rangeStartIso, selectedDate]);

  const rangeStart = useMemo(() => new Date(rangeStartIso), [rangeStartIso]);
  const rangeEnd = useMemo(() => new Date(rangeEndIso), [rangeEndIso]);

  const [calendarLoadError, setCalendarLoadError] = useState(false);
  const [calendarSyncLoading, setCalendarSyncLoading] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const loadEvents = useCallback(() => {
    setLoading(true);
    setCalendarLoadError(false);
    listEvents({ start: rangeStartIso, end: rangeEndIso })
      .then((data) => { setEvents(data); setCalendarLoadError(false); })
      .catch(() => { setEvents([]); setCalendarLoadError(true); })
      .finally(() => setLoading(false));
  }, [rangeStartIso, rangeEndIso]);

  useEffect(() => { loadEvents(); }, [loadEvents]);
  useEffect(() => { getContactsList().then(setContacts).catch(() => setContacts([])); }, []);
  useEffect(() => {
    fetch("/api/calendar/status")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { connected?: boolean };
        setCalendarConnected(Boolean(data.connected));
      })
      .catch(() => {
        setCalendarConnected(null);
      });
  }, []);

  const handleCalendarSync = useCallback(async () => {
    setCalendarSyncLoading(true);
    try {
      // Rozsah bere server (~2 roky zpět, 1 rok dopředu); timeMin/timeMax jen rozšíří okno, nezuží ho.
      const res = await fetch("/api/calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeMin: rangeStartIso,
          timeMax: rangeEndIso,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        detail?: string;
        created?: number;
        updated?: number;
        truncated?: boolean;
      };
      const syncOk = res.ok && data.ok === true;
      if (syncOk) {
        loadEvents();
        toast.showToast(
          data.created !== undefined || data.updated !== undefined
            ? `Synchronizováno: ${data.created ?? 0} nových, ${data.updated ?? 0} upraveno.`
            : "Kalendář byl synchronizován s Google."
        );
        if (data.truncated) {
          toast.showToast(
            "Načteno maximum událostí z Google (limit stránek). Zbytek se nestáhl – zúžte rozsah v API nebo sync opakujte.",
            "info",
            10000
          );
        }
      } else {
        const hint = data.detail ? ` ${data.detail}` : "";
        toast.showToast(`${data.error ?? "Synchronizace se nepovedla."}${hint}`.trim(), "error", 12000);
      }
    } catch {
      toast.showToast("Synchronizace se nepovedla.", "error");
    } finally {
      setCalendarSyncLoading(false);
    }
  }, [rangeStartIso, rangeEndIso, loadEvents, toast]);
  const [opportunities, setOpportunities] = useState<OpportunityOption[]>([]);
  useEffect(() => { getOpenOpportunitiesList().then(setOpportunities).catch(() => setOpportunities([])); }, []);

  const handleSave = useCallback(async (form: EventFormData, id?: string) => {
    const startIso = localDateTimeInputToUtcIso(form.startAt);
    const endIso = localDateTimeInputToUtcIso(form.endAt);
    const startLocal = form.startAt ? new Date(form.startAt) : null;
    const reminderAtIso =
      form.reminderMinutes > 0 && startLocal && !Number.isNaN(startLocal.getTime())
        ? new Date(startLocal.getTime() - form.reminderMinutes * 60 * 1000).toISOString()
        : null;
    if (!startIso) {
      toast.showToast("Neplatný začátek události.", "error");
      return;
    }
    if (id) {
      await updateEvent(id, {
        title: form.title,
        eventType: form.eventType,
        startAt: startIso,
        ...(endIso ? { endAt: endIso } : {}),
        allDay: form.allDay,
        location: form.location || undefined,
        reminderAt: reminderAtIso,
        contactId: form.contactId || undefined,
        opportunityId: form.opportunityId || undefined,
        status: form.status || undefined,
        notes: form.notes || undefined,
        meetingLink: form.meetingLink || undefined,
      });
      toast.showToast("Aktivita upravena");
    } else {
      await createEvent({
        title: form.title,
        eventType: form.eventType,
        startAt: startIso,
        endAt: endIso || undefined,
        allDay: form.allDay,
        location: form.location || undefined,
        reminderAt: reminderAtIso ?? undefined,
        contactId: form.contactId || undefined,
        opportunityId: form.opportunityId || undefined,
        status: form.status || undefined,
        notes: form.notes || undefined,
        meetingLink: form.meetingLink || undefined,
      });
      toast.showToast("Aktivita vytvořena");
    }
    loadEvents();
  }, [loadEvents, toast]);

  function eventRowToCreatePayload(ev: EventRow): Parameters<typeof createEvent>[0] {
    const start = new Date(ev.startAt);
    const end = ev.endAt ? new Date(ev.endAt) : null;
    return {
      title: ev.title,
      eventType: ev.eventType ?? "schuzka",
      startAt: start.toISOString(),
      endAt: end?.toISOString(),
      allDay: ev.allDay ?? false,
      location: ev.location ?? undefined,
      contactId: ev.contactId ?? undefined,
      opportunityId: ev.opportunityId ?? undefined,
      status: ev.status ?? undefined,
      notes: ev.notes ?? undefined,
      meetingLink: ev.meetingLink ?? undefined,
      reminderAt: ev.reminderAt ? new Date(ev.reminderAt).toISOString() : undefined,
    };
  }

  const handleDeleteEvent = useCallback(
    async (ev: EventRow) => {
      const payload = eventRowToCreatePayload(ev);
      await deleteEvent(ev.id);
      setModal(null);
      setDetailEvent(null);
      loadEvents();
      toast.showToast("Událost byla smazána", "success", 6000, {
        actionLabel: "Vrátit zpět",
        onAction: async () => {
          await createEvent(payload);
          loadEvents();
        },
      });
    },
    [loadEvents, toast],
  );

  const handleDeleteById = useCallback(
    async (id: string) => {
      const ev = events.find((e) => e.id === id);
      if (ev) {
        await handleDeleteEvent(ev);
      } else {
        await deleteEvent(id);
        setModal(null);
        setDetailEvent(null);
        loadEvents();
        toast.showToast("Událost byla smazána");
      }
    },
    [events, handleDeleteEvent, loadEvents, toast],
  );

  const handleFollowUp = useCallback(
    async (sourceId: string, type: "event" | "task") => {
      const source = events.find((e) => e.id === sourceId);
      const title = `Follow-up: ${source?.title ?? ""}`;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      try {
        await createFollowUp(sourceId, type, {
          title,
          startAt: type === "event" ? tomorrow.toISOString() : undefined,
          dueDate: type === "task" ? formatDate(tomorrow) : undefined,
          contactId: source?.contactId || undefined,
        });
        setModal(null);
        loadEvents();
        if (type === "task") loadDayTasks(selectedDate);
        toast.showToast("Návazný úkol byl vytvořen.", "success");
      } catch (err) {
        toast.showToast(err instanceof Error ? err.message : "Nepodařilo se vytvořit návazný úkol.", "error");
      }
    },
    [events, loadEvents, loadDayTasks, selectedDate, toast]
  );

  const handleMarkEventDone = useCallback(async (ev: EventRow) => {
    await updateEvent(ev.id, { status: "done" });
    toast.showToast("Událost označena jako hotová");
    setDetailEvent(null);
    loadEvents();
  }, [loadEvents, toast]);

  const handleEventMove = useCallback(
    async (eventId: string, targetDateStr: string, startMinutesFromMidnight: number) => {
      const ev = events.find((e) => e.id === eventId);
      if (!ev || ev.allDay) return;
      const oldStart = new Date(ev.startAt);
      const oldEnd = ev.endAt ? new Date(ev.endAt) : new Date(oldStart.getTime() + DEFAULT_EVENT_DURATION_MS);
      const durationMs = oldEnd.getTime() - oldStart.getTime();
      const [yy, mm, dd] = targetDateStr.split("-").map(Number);
      const newStart = new Date(yy, mm - 1, dd, Math.floor(startMinutesFromMidnight / 60), startMinutesFromMidnight % 60, 0, 0);
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
        toast.showToast("Aktivita přesunuta", "success");
        loadEvents();
      } catch {
        toast.showToast("Nepodařilo se přesunout aktivitu.", "error");
      }
    },
    [events, loadEvents, toast],
  );

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
    const startLocal = `${dateStr}T${String(h).padStart(2, "0")}:00`;
    setModal({
      ...EMPTY_FORM,
      startAt: startLocal,
      endAt: addMsToLocalDateTime(startLocal, DEFAULT_EVENT_DURATION_MS),
    });
  }

  const openEventDetailFromGrid = useCallback(
    (ev: EventRow) => {
      if (detailEvent?.id === ev.id) {
        setDetailEvent(null);
        return;
      }
      setDetailEvent(ev);
      setContextPanelCollapsed(false);
    },
    [detailEvent],
  );

  function openEdit(ev: EventRow) {
    const start = new Date(ev.startAt);
    const reminderAt = ev.reminderAt ? new Date(ev.reminderAt) : null;
    let reminderMinutes = 0;
    if (reminderAt) {
      const diffM = Math.round((start.getTime() - reminderAt.getTime()) / 60000);
      if (diffM <= 15) reminderMinutes = 15;
      else if (diffM <= 30) reminderMinutes = 30;
      else if (diffM <= 60) reminderMinutes = 60;
      else if (diffM <= 1440) reminderMinutes = 1440;
    }
    setModal({
      id: ev.id,
      title: ev.title,
      eventType: ev.eventType ?? "schuzka",
      startAt: formatDateTimeLocal(start),
      endAt: ev.endAt ? formatDateTimeLocal(new Date(ev.endAt)) : "",
      allDay: ev.allDay ?? false,
      location: ev.location ?? "",
      contactId: ev.contactId ?? "",
      opportunityId: ev.opportunityId ?? "",
      reminderMinutes,
      status: ev.status ?? "",
      notes: ev.notes ?? "",
      meetingLink: ev.meetingLink ?? "",
    });
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

  const toolbarMonthYear = formatMonthYear(currentDate);
  const toolbarWeekNum = mode !== "month" ? getWeekNumber(rangeStart) : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--wp-main-scroll-bg)] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div
        className={`wp-cal-container wp-cal-container--today-${settings.todayStyle} wp-cal-container--font-${settings.fontSize} flex flex-col flex-1 min-h-0`}
        style={cssVarsFromSettings(settings)}
      >
        <div className={`flex-1 flex overflow-hidden p-2 sm:p-3 lg:p-2 gap-2 sm:gap-3 lg:gap-2 min-h-0 ${isMobile ? "flex-col" : ""}`}>
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

          <main className="flex-1 bg-[color:var(--wp-surface-card)] rounded-xl sm:rounded-xl lg:rounded-lg shadow-sm border border-[color:var(--wp-surface-card-border)] flex flex-col overflow-hidden relative min-w-0">
            <div className={`px-3 sm:px-4 lg:px-3 py-2 sm:py-2 border-b border-[color:var(--wp-surface-card-border)] flex items-center justify-between bg-[color:var(--wp-surface-card)] z-20 flex-wrap gap-2 lg:gap-2 ${isMobile ? "gap-y-2" : ""}`}>
              <div className="flex items-center gap-2 sm:gap-3 lg:gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => { const today = new Date(); setCurrentDate(today); setSelectedDate(formatDate(today)); }}
                  className="px-2.5 sm:px-3 py-1.5 bg-[color:var(--wp-surface-muted)] hover:bg-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] text-xs font-bold rounded-lg transition-colors min-h-[44px] sm:min-h-0"
                >
                  Dnes
                </button>
                <div className="flex items-center gap-0.5 sm:gap-1">
                  <button type="button" onClick={() => navigate(-1)} className="p-1.5 rounded-md text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-muted)] hover:text-[color:var(--wp-text)] transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center" aria-label="Předchozí">
                    <ChevronLeft size={18} />
                  </button>
                  <button type="button" onClick={() => navigate(1)} className="p-1.5 rounded-md text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-muted)] hover:text-[color:var(--wp-text)] transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center" aria-label="Další">
                    <ChevronRight size={18} />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                  <h2 className="text-base sm:text-lg font-black text-[color:var(--wp-text)] truncate">{toolbarMonthYear}</h2>
                  {toolbarWeekNum != null && (
                    <span className="bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] rounded-md px-1.5 sm:px-2 py-0.5 text-xs sm:text-sm font-medium shrink-0">
                      {toolbarWeekNum}. týden
                    </span>
                  )}
                </div>
                {isMobile && (
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setCurrentDate(new Date(`${e.target.value}T12:00:00`));
                    }}
                    className="min-h-[44px] rounded-lg border border-[color:var(--wp-surface-card-border)] px-3 text-sm font-semibold text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-card)]"
                    aria-label="Vybrat datum"
                  />
                )}
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-2 shrink-0 flex-wrap sm:flex-nowrap">
                <div className="bg-[color:var(--wp-surface-muted)] p-0.5 rounded-lg flex items-center">
                  {isMobile
                    ? viewModesMobile.map((m) => (
                        <button key={m} type="button" onClick={() => setMode(m)} className={`px-2.5 sm:px-3 py-1 rounded-md text-xs font-bold transition-all min-h-[40px] sm:min-h-0 ${mode === m ? "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)] shadow-sm" : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)]"}`}>
                          {m === "day" ? "Den" : m === "week" ? "Týden" : "Měsíc"}
                        </button>
                      ))
                    : (["workweek", "week", "month"] as const).map((m) => (
                        <button key={m} type="button" onClick={() => setMode(m)} className={`px-3 py-1 rounded-md text-xs font-bold transition-all min-h-[40px] sm:min-h-0 ${mode === m ? "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)] shadow-sm" : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)]"}`}>
                          {m === "workweek" ? "Pracovní" : m === "week" ? "Týden" : "Měsíc"}
                        </button>
                      ))}
                </div>
                <div className="w-px h-5 bg-[color:var(--wp-surface-card-border)] hidden sm:block" />
                <button type="button" onClick={() => setContextPanelCollapsed((c) => !c)} className={`min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-1.5 rounded-lg transition-colors ${!contextPanelCollapsed ? "text-indigo-600 bg-indigo-50" : "text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-muted)]"}`} title="Přepnout postranní panel">
                  {!contextPanelCollapsed ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
                </button>
                <button type="button" onClick={handleCalendarSync} disabled={calendarSyncLoading} className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[color:var(--wp-surface-muted)] hover:bg-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-lg text-xs sm:text-sm font-bold transition-all active:scale-95 min-h-[44px] sm:min-h-0 disabled:opacity-60" title="Synchronizovat s Google Kalendářem">
                  <RefreshCw size={16} className={calendarSyncLoading ? "animate-spin" : ""} /> {calendarSyncLoading ? "Sync…" : "Sync s Google"}
                </button>
                <CreateActionButton
                  type="button"
                  onClick={() => openNew(todayStr)}
                  icon={Plus}
                  className="!min-h-[44px] !rounded-lg !px-2.5 !py-1.5 !text-[11px] sm:!min-h-0 sm:!px-3 sm:!text-sm"
                >
                  Vytvořit
                </CreateActionButton>
                <button type="button" onClick={() => setSettingsOpen(true)} className="p-1.5 rounded-lg text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-muted)] sm:block hidden" aria-label="Nastavení">
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 2.31.49 2.31 1.066 0 1.552-2.308 2.6-4.342 2.6-2.034 0-4.341-1.048-4.341-2.6 0-.576.767-2.006 2.314-1.066 1.53.94 2.573 1.066 2.573-1.066 0-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 2.31.49 2.31 1.066 0 1.552-2.308 2.6-4.342 2.6-2.034 0-4.341-1.048-4.341-2.6 0-.576.767-2.006 2.314-1.066 1.53.94 2.573 1.066 2.573-1.066z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                </button>
              </div>
            </div>
            {calendarConnected === false && (
              <div className="mx-3 sm:mx-4 lg:mx-3 mt-2 sm:mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-amber-900">
                  Pro synchronizaci s Google Kalendářem propojte svůj účet.
                </p>
                <Link
                  href="/portal/setup?tab=integrace"
                  className="min-h-[44px] inline-flex items-center rounded-lg px-3 py-2 text-sm font-bold text-amber-900 bg-amber-100 hover:bg-amber-200"
                >
                  Přejít do Nastavení
                </Link>
              </div>
            )}

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[color:var(--wp-text-secondary)] text-sm">Načítám kalendář…</p>
              </div>
            ) : calendarLoadError ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
                <p className="text-sm font-medium text-amber-800">Nepodařilo se načíst události.</p>
                <button
                  type="button"
                  onClick={() => loadEvents()}
                  className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 text-sm font-semibold rounded-lg transition-colors"
                >
                  Zkusit znovu
                </button>
              </div>
            ) : mode === "month" ? (
              <div className="flex-1 flex flex-col bg-[color:var(--wp-surface-card)] overflow-auto min-h-0">
                <div className={`grid grid-cols-7 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] z-20 flex-shrink-0 ${isMobile ? "py-2" : "py-3"}`}>
                  {["PO", "ÚT", "ST", "ČT", "PÁ", "SO", "NE"].map((d, i) => (
                    <div key={i} className="text-center text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] border-r border-[color:var(--wp-surface-card-border)] last:border-r-0">{d}</div>
                  ))}
                </div>
                <div className="flex-1 grid grid-cols-7 grid-rows-5 bg-[color:var(--wp-surface-muted)] gap-[1px] min-h-0">
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
                        className={`relative p-1.5 sm:p-2 bg-[color:var(--wp-surface-card)] transition-colors group cursor-pointer min-h-[64px] sm:min-h-[80px] ${!isCurrentMonth ? "text-[color:var(--wp-text-tertiary)] bg-[color:var(--wp-surface-muted)]/50" : "text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"} ${isPast && isCurrentMonth ? "wp-cal-striped-past opacity-80" : ""}`}
                      >
                        <span className={`absolute top-1 right-1 sm:top-2 sm:right-2 text-xs sm:text-sm font-bold w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full ${isToday ? "bg-indigo-600 text-white shadow-md" : ""}`}>{day.getDate()}</span>
                        <div className="mt-6 sm:mt-8 space-y-0.5 sm:space-y-1">
                          {dayEvents.slice(0, 4).map((ev) => {
                            const typeInfo = getEventCategory(ev.eventType);
                            const customColor = settings.eventTypeColors?.[ev.eventType ?? ""];
                            const useInlineColor = Boolean(customColor);
                            return (
                              <div
                                key={ev.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEventDetailFromGrid(ev);
                                }}
                                className={`px-1 sm:px-1.5 py-0.5 text-[8px] sm:text-[9px] font-bold rounded border truncate hover:shadow-sm transition-shadow ${useInlineColor ? "text-gray-800 border-gray-300" : typeInfo.tailwindClass}`}
                                style={useInlineColor ? { backgroundColor: customColor, borderColor: customColor } : undefined}
                              >
                                {formatTime(new Date(ev.startAt))} {ev.title}
                              </div>
                            );
                          })}
                          {dayEvents.length > 4 && <span className="text-[9px] text-[color:var(--wp-text-secondary)]">+{dayEvents.length - 4}</span>}
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
                  timeColWidth={isMobile ? 48 : timeColWidth}
                  onSlotClick={(dateStr, hour) => openNew(dateStr, hour)}
                  onEventClick={openEventDetailFromGrid}
                  onDaySelect={setSelectedDate}
                  selectedEventId={detailEvent?.id ?? null}
                  isMobile={isMobile}
                  startHour={isMobile ? 8 : undefined}
                  endHour={isMobile ? 21 : undefined}
                  pixelsPerHour={isMobile ? 52 : undefined}
                  currentTimeLineColor={settings.currentTimeLineColor}
                  currentTimeLineWidth={settings.currentTimeLineWidth}
                  eventTypeColors={settings.eventTypeColors}
                  onEventMove={handleEventMove}
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
              onQuickEditEvent={openEdit}
              onDeleteEvent={handleDeleteEvent}
              onFollowUp={(eventId) => handleFollowUp(eventId, "event")}
              onOpenFullEdit={openEdit}
              onMarkDone={handleMarkEventDone}
              onToggleTask={handleToggleDayTask}
              onAddTask={(dateStr) => setNewTaskModal({ dueDate: dateStr })}
              onRefresh={() => { loadEvents(); loadDayTasks(selectedDate); }}
              collapsed={false}
              onToggleCollapsed={() => setContextPanelCollapsed(true)}
              onCloseSelectedEvent={() => setDetailEvent(null)}
              isMobile={isMobile}
            />
          )}
        </div>
      </div>

      {detailEvent && (isMobile || contextPanelCollapsed) && (
        <EventDetailPopup
          event={detailEvent}
          contacts={contacts}
          onEdit={() => openEdit(detailEvent)}
          onDelete={() => handleDeleteEvent(detailEvent)}
          onClose={() => setDetailEvent(null)}
        />
      )}

      {modal && (
        <EventFormModal
          initial={modal}
          contacts={contacts}
          opportunities={opportunities}
          eventTypeColors={settings.eventTypeColors}
          onSave={handleSave}
          onDelete={modal.id ? handleDeleteById : undefined}
          onFollowUp={modal.id ? handleFollowUp : undefined}
          onClose={() => setModal(null)}
        />
      )}

      {newTaskModal && (
        <NewTaskModal
          dueDate={newTaskModal.dueDate}
          contacts={contacts}
          opportunities={opportunities}
          onSave={async (title, dueDate, contactId, opportunityId) => {
            try {
              const id = await createTask({ title, dueDate, contactId, opportunityId });
              if (id != null) {
                loadDayTasks(selectedDate);
                setNewTaskModal(null);
                toast.showToast("Úkol byl vytvořen.", "success");
              } else {
                toast.showToast("Úkol se nepodařilo vytvořit.", "error");
              }
            } catch (err) {
              toast.showToast(err instanceof Error ? err.message : "Úkol se nepodařilo vytvořit.", "error");
            }
          }}
          onClose={() => setNewTaskModal(null)}
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
