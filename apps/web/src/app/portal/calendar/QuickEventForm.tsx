"use client";

import { useState, useEffect, useRef } from "react";
import { Calendar as CalendarIcon, Phone, Mail, Coffee, X } from "lucide-react";
import type { ContactRow } from "@/app/actions/contacts";
import { ContactSearchInput } from "@/app/components/ContactSearchInput";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";
import clsx from "clsx";
import {
  addMsToLocalDateTime,
  DEFAULT_EVENT_DURATION_MS,
  formatDateTimeLocal,
} from "@/app/portal/calendar/date-utils";
import { EventFormDateTimeSection } from "@/app/portal/calendar/EventFormDateTimeSection";

function CheckSquare({ size, className }: { size: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

/** Kalendar.txt: Schůzka, Úkol, Telefonát, E-mail, Kafe → eventType */
const ACTIVITY_TYPES = [
  { id: "schuzka", label: "Schůzka", icon: CalendarIcon, color: "bg-indigo-500 text-white border-indigo-500" },
  { id: "ukol", label: "Úkol", icon: CheckSquare, color: "text-emerald-700 hover:bg-emerald-50 border-[color:var(--wp-surface-card-border)]" },
  { id: "telefonat", label: "Telefonát", icon: Phone, color: "text-rose-600 hover:bg-rose-50 border-[color:var(--wp-surface-card-border)]" },
  { id: "mail", label: "E-mail", icon: Mail, color: "text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] border-[color:var(--wp-surface-card-border)]" },
  { id: "kafe", label: "Kafe", icon: Coffee, color: "text-amber-700 hover:bg-amber-50 border-[color:var(--wp-surface-card-border)]" },
] as const;

export interface QuickEventFormValues {
  title: string;
  eventType: string;
  startAt: string;
  endAt: string;
  contactId: string;
  notes: string;
  location: string;
}

const DEFAULT_VALUES: QuickEventFormValues = {
  title: "",
  eventType: "schuzka",
  startAt: "",
  endAt: "",
  contactId: "",
  notes: "",
  location: "",
};

export interface QuickEventFormProps {
  /** Prefilled start (ISO datetime string or date + hour) */
  initialStart: string;
  /** Prefilled end (optional) */
  initialEnd?: string;
  /** For edit mode: existing values */
  initialValues?: Partial<QuickEventFormValues> & { id?: string };
  contacts: ContactRow[];
  onSave: (values: QuickEventFormValues, id?: string) => Promise<void>;
  onClose: () => void;
  /** Anchor for positioning (e.g. slot element); if not provided, form is centered */
  anchorRef?: React.RefObject<HTMLElement | null>;
  /** Custom colors per event type (from calendar settings); when set, type buttons use these when active */
  eventTypeColors?: Record<string, string>;
}

export function QuickEventForm({
  initialStart,
  initialEnd,
  initialValues,
  contacts,
  onSave,
  onClose,
  anchorRef,
  eventTypeColors,
}: QuickEventFormProps) {
  const [form, setForm] = useState<QuickEventFormValues>(() => ({
    ...DEFAULT_VALUES,
    ...initialValues,
    startAt: initialValues?.startAt ?? initialStart,
    endAt:
      initialValues?.endAt ??
      initialEnd ??
      addMsToLocalDateTime(initialStart, DEFAULT_EVENT_DURATION_MS),
    eventType: initialValues?.eventType ?? "schuzka",
    title: initialValues?.title ?? "",
    contactId: initialValues?.contactId ?? "",
    notes: initialValues?.notes ?? "",
    location: (initialValues as QuickEventFormValues)?.location ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const qLabelClass = "block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1.5";
  const qInputClass =
    "w-full px-3 py-2.5 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100 text-[color:var(--wp-text)]";

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node) && (!anchorRef?.current || !anchorRef.current.contains(e.target as Node))) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, anchorRef]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const title = form.title.trim() || "Nová schůzka";
    if (!form.startAt) return;
    setSaving(true);
    try {
      await onSave({ ...form, title }, initialValues?.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={ref}
      className="bg-[color:var(--wp-surface-card)] rounded-2xl shadow-2xl w-full max-w-[600px] flex flex-col overflow-hidden border border-[color:var(--wp-surface-card-border)]"
      role="dialog"
      aria-label={initialValues?.id ? "Rychlá úprava události" : "Nová aktivita"}
    >
      <div className="px-6 py-4 border-b border-[color:var(--wp-surface-card-border)] flex items-center justify-between bg-[color:var(--wp-surface-muted)]/50">
        <h2 className="text-lg font-bold text-[color:var(--wp-text)]">{initialValues?.id ? "Upravit aktivitu" : "Nová aktivita"}</h2>
        <button type="button" onClick={onClose} className="text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text-secondary)] p-1 rounded-md hover:bg-[color:var(--wp-surface-card-border)]" aria-label="Zavřít">
          <X size={18} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ACTIVITY_TYPES.map((type) => {
              const Icon = type.icon;
              const isActive = form.eventType === type.id;
              const customColor = eventTypeColors?.[type.id];
              const useInlineColor = isActive && Boolean(customColor);
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, eventType: type.id }))}
                  className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-2 py-2.5 text-center text-xs font-bold shadow-none ring-0 transition-colors sm:text-sm ${
                    useInlineColor
                      ? "border-[color:var(--wp-border-strong)] text-[color:var(--wp-text)]"
                      : isActive
                        ? type.color
                        : "border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
                  }`}
                  style={useInlineColor ? { backgroundColor: customColor, borderColor: customColor } : undefined}
                >
                  <Icon
                    size={16}
                    className={
                      useInlineColor
                        ? "text-[color:var(--wp-text)]"
                        : isActive && type.id !== "schuzka"
                          ? ""
                          : isActive
                            ? "text-white/80"
                            : "text-[color:var(--wp-text-tertiary)]"
                    }
                  />
                  {type.label}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Název aktivity…"
            className="w-full text-xl font-bold text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] border-b-2 border-[color:var(--wp-surface-card-border)] hover:border-[color:var(--wp-border-strong)] focus:border-indigo-500 py-2 outline-none transition-colors bg-transparent"
            autoFocus
          />
          <EventFormDateTimeSection
            startAt={form.startAt}
            endAt={form.endAt}
            allDay={false}
            onChangeStart={(v) => setForm((f) => ({ ...f, startAt: v }))}
            onChangeEnd={(v) => setForm((f) => ({ ...f, endAt: v }))}
            onChangeAllDay={() => {}}
            hideAllDay
            eLabelClass={qLabelClass}
            eInputClass={qInputClass}
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1.5">Kontakt</label>
              <ContactSearchInput
                value={form.contactId}
                contacts={contacts}
                onChange={(contactId) => setForm((f) => ({ ...f, contactId }))}
                placeholder="Vyhledat klienta…"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1.5">Místo</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Adresa / odkaz"
                className="w-full px-3 py-2.5 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1.5">Poznámka</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Volitelné"
              className="w-full px-3 py-2.5 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-sm font-medium outline-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] flex justify-between flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving || !form.startAt}
            className={clsx(portalPrimaryButtonClassName, "px-6 py-2.5 disabled:opacity-50")}
          >
            {saving ? "Ukládám…" : initialValues?.id ? "Uložit" : "Vytvořit"}
          </button>
          <button type="button" onClick={onClose} className="text-sm font-bold text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)] transition-colors px-4 py-2">
            Zavřít
          </button>
        </div>
      </form>
    </div>
  );
}

