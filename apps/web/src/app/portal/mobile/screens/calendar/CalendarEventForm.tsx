"use client";

import { useEffect, useState } from "react";
import {
  AlignLeft,
  Bell,
  Briefcase,
  Check,
  Clock,
  Link2,
  MapPin,
  User,
  X,
} from "lucide-react";
import type { ContactRow } from "@/app/actions/contacts";
import { ContactSearchInput } from "@/app/components/ContactSearchInput";
import {
  CALENDAR_EVENT_CATEGORIES,
  EVENT_STATUSES,
  type EventCategoryId,
} from "@/app/portal/calendar/event-categories";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";
import { useKeyboardAware } from "@/lib/ui/useKeyboardAware";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";

export interface EventFormData {
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

export const EMPTY_FORM: EventFormData = {
  title: "",
  eventType: "schuzka",
  startAt: "",
  endAt: "",
  allDay: false,
  location: "",
  contactId: "",
  opportunityId: "",
  reminderMinutes: 30,
  status: "scheduled",
  notes: "",
  meetingLink: "",
};

const REMINDER_OPTIONS = [
  { value: 0, label: "Žádná" },
  { value: 15, label: "15 min před" },
  { value: 30, label: "30 min před" },
  { value: 60, label: "1 h před" },
  { value: 1440, label: "1 den před" },
] as const;

const EVENT_PILL_STYLES: Record<string, { active: string; inactive: string }> = {
  schuzka:   { active: "bg-indigo-600 text-white shadow-lg shadow-indigo-200",  inactive: "bg-indigo-50 text-indigo-600" },
  telefonat: { active: "bg-rose-500 text-white shadow-lg shadow-rose-200",      inactive: "bg-rose-50 text-rose-500" },
  kafe:      { active: "bg-amber-500 text-white shadow-lg shadow-amber-200",    inactive: "bg-amber-50 text-amber-600" },
  mail:      { active: "bg-purple-600 text-white shadow-lg shadow-purple-200",  inactive: "bg-purple-50 text-purple-600" },
  ukol:      { active: "bg-emerald-600 text-white shadow-lg shadow-emerald-200", inactive: "bg-emerald-50 text-emerald-600" },
  priorita:  { active: "bg-red-600 text-white shadow-lg shadow-red-200",        inactive: "bg-red-50 text-red-600" },
};

const PRIMARY_TYPES = ["schuzka", "telefonat", "kafe", "mail", "ukol", "priorita"];

const SECONDARY_TYPES: EventCategoryId[] = CALENDAR_EVENT_CATEGORIES.filter(
  (t) => !PRIMARY_TYPES.includes(t.id),
).map((t) => t.id);

export type OpportunityOption = { id: string; title: string; contactId: string | null };

export function CalendarEventForm({
  deviceClass = "phone",
  initial,
  contacts,
  opportunities,
  saving,
  saveError,
  onSave,
  onClose,
}: {
  deviceClass?: DeviceClass;
  initial: EventFormData & { id?: string };
  contacts: ContactRow[];
  opportunities: OpportunityOption[];
  saving: boolean;
  saveError: string | null;
  onSave: (form: EventFormData, id?: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<EventFormData>(() => {
    if (!initial.startAt) {
      const now = new Date();
      now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
      const end = new Date(now.getTime() + 60 * 60 * 1000);
      const fmt = (d: Date) => d.toISOString().slice(0, 16);
      return { ...initial, startAt: fmt(now), endAt: fmt(end) };
    }
    return initial;
  });
  const [validationErrors, setValidationErrors] = useState<{ title?: boolean; startAt?: boolean }>({});
  const [showMoreTypes, setShowMoreTypes] = useState(() =>
    SECONDARY_TYPES.includes(initial.eventType as EventCategoryId),
  );
  const { keyboardInset } = useKeyboardAware();
  const largeScreen = deviceClass === "tablet" || deviceClass === "desktop";

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    setShowMoreTypes(SECONDARY_TYPES.includes(initial.eventType as EventCategoryId));
  }, [initial.eventType, initial.id]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors: { title?: boolean; startAt?: boolean } = {};
    if (!form.title.trim()) errors.title = true;
    if (!form.startAt) errors.startAt = true;
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    onSave(form, initial.id);
  }

  const labelClass = "block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 ml-1";
  const inputClass =
    "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-slate-800 placeholder:text-slate-400";

  const filteredOpportunities = opportunities.filter(
    (o) => !form.contactId || o.contactId === form.contactId,
  );

  return (
    <div
      className={
        largeScreen
          ? "fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
          : "fixed inset-0 z-[100] flex flex-col bg-white"
      }
      role="presentation"
      onClick={largeScreen ? onClose : undefined}
    >
      <div
        className={
          largeScreen
            ? "flex max-h-[min(92vh,820px)] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[24px] bg-white shadow-2xl sm:rounded-2xl"
            : "flex min-h-0 flex-1 flex-col"
        }
        onClick={(e) => e.stopPropagation()}
      >
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-black text-slate-900">
            {initial.id ? "Upravit aktivitu" : "Nová aktivita"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zavřít"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 transition-colors active:bg-slate-100"
          >
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        <div
          className="flex-1 space-y-5 overflow-y-auto px-4 py-5"
          style={keyboardInset ? { paddingBottom: `${keyboardInset + 80}px` } : undefined}
        >
          <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
            {CALENDAR_EVENT_CATEGORIES.filter((t) => PRIMARY_TYPES.includes(t.id)).map((t) => {
              const isActive = form.eventType === t.id;
              const ps = EVENT_PILL_STYLES[t.id] ?? {
                active: "bg-slate-700 text-white shadow-lg",
                inactive: "bg-slate-100 text-slate-600",
              };
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      eventType: t.id,
                      reminderMinutes: t.id === "ukol" || t.id === "priorita" ? 15 : 30,
                    }))
                  }
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition-all active:scale-[0.97] ${
                    isActive ? ps.active : ps.inactive
                  }`}
                >
                  <span className="text-base">{t.icon}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
          {showMoreTypes ? (
            <div className="flex flex-wrap gap-2">
              {CALENDAR_EVENT_CATEGORIES.filter((t) => SECONDARY_TYPES.includes(t.id)).map((t) => {
                const isActive = form.eventType === t.id;
                const ps = EVENT_PILL_STYLES[t.id] ?? {
                  active: "bg-slate-700 text-white shadow-lg",
                  inactive: "bg-slate-100 text-slate-600",
                };
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        eventType: t.id,
                        reminderMinutes: t.id === "ukol" || t.id === "priorita" ? 15 : 30,
                      }))
                    }
                    className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all active:scale-[0.97] ${
                      isActive ? ps.active : ps.inactive
                    }`}
                  >
                    <span>{t.icon}</span>
                    {t.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setShowMoreTypes((v) => !v)}
            className="text-left text-xs font-bold text-indigo-600 underline-offset-2 hover:underline"
          >
            {showMoreTypes ? "Méně typů…" : "Další typy…"}
          </button>

          <input
            value={form.title}
            onChange={(e) => {
              setForm((f) => ({ ...f, title: e.target.value }));
              if (validationErrors.title) setValidationErrors((v) => ({ ...v, title: false }));
            }}
            placeholder="Název aktivity…"
            className={`w-full border-0 border-b-2 bg-transparent py-3 text-xl font-black text-slate-900 outline-none transition-colors placeholder:text-slate-300 ${
              validationErrors.title ? "border-red-400" : "border-slate-200 focus:border-indigo-500"
            }`}
            autoFocus
          />

          <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-slate-400" />
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">Kdy</span>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-bold text-slate-600">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Celý den
            </label>

            <div className="space-y-3">
              <div>
                <label className={labelClass}>Začátek</label>
                <input
                  type="datetime-local"
                  step={300}
                  value={form.startAt}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, startAt: e.target.value }));
                    if (validationErrors.startAt) setValidationErrors((v) => ({ ...v, startAt: false }));
                  }}
                  className={`${inputClass} ${validationErrors.startAt ? "!border-red-400 !ring-red-100" : ""}`}
                />
              </div>
              <div>
                <label className={labelClass}>Konec</label>
                <input
                  type="datetime-local"
                  step={300}
                  value={form.endAt}
                  onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className={labelClass}>
                <User size={12} className="mr-1 inline" />
                Klient
              </label>
              <ContactSearchInput
                value={form.contactId}
                contacts={contacts}
                onChange={(contactId) => setForm((f) => ({ ...f, contactId, opportunityId: "" }))}
                placeholder="Vyhledat klienta…"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                <Briefcase size={12} className="mr-1 inline" />
                Obchod
              </label>
              <select
                value={form.opportunityId}
                onChange={(e) => setForm((f) => ({ ...f, opportunityId: e.target.value }))}
                className={inputClass}
              >
                <option value="">— žádný —</option>
                {filteredOpportunities.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className={labelClass}>
                <MapPin size={12} className="mr-1 inline" />
                Místo
              </label>
              <input
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Adresa / místo"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                <Link2 size={12} className="mr-1 inline" />
                Online odkaz
              </label>
              <input
                value={form.meetingLink}
                onChange={(e) => setForm((f) => ({ ...f, meetingLink: e.target.value }))}
                placeholder="https://…"
                className={inputClass}
                type="url"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>
              <AlignLeft size={12} className="mr-1 inline" />
              Poznámka
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Poznámky k události…"
              className={`${inputClass} min-h-[80px] resize-none`}
              rows={3}
            />
          </div>

          <div>
            <label className={labelClass}>Stav události</label>
            <div className="flex flex-wrap gap-2">
              {EVENT_STATUSES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, status: s.id }))}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors active:scale-[0.97] ${
                    (form.status || "scheduled") === s.id
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>
              <Bell size={12} className="mr-1 inline" />
              Připomenutí
            </label>
            <div className="flex flex-wrap gap-2">
              {REMINDER_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, reminderMinutes: o.value }))}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors active:scale-[0.97] ${
                    form.reminderMinutes === o.value
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {saveError ? (
            <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-600">
              {saveError}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3 border-t border-slate-200 bg-white px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[48px] flex-1 items-center justify-center rounded-xl border border-slate-200 text-sm font-bold text-slate-600 transition-colors active:scale-[0.98]"
          >
            Zrušit
          </button>
          <CreateActionButton
            type="submit"
            disabled={!form.title.trim() || !form.startAt}
            isLoading={saving}
            icon={Check}
            className="min-h-[48px] min-w-0 flex-1 shadow-lg"
          >
            {saving ? "Ukládám…" : initial.id ? "Uložit" : "Vytvořit"}
          </CreateActionButton>
        </div>
      </form>
      </div>
    </div>
  );
}
