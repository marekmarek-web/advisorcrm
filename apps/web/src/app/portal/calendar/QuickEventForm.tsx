"use client";

import { useState, useEffect, useRef } from "react";
import { Calendar as CalendarIcon, Phone, Mail, Coffee, X } from "lucide-react";
import type { ContactRow } from "@/app/actions/contacts";

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
  { id: "ukol", label: "Úkol", icon: CheckSquare, color: "text-emerald-700 hover:bg-emerald-50 border-slate-200" },
  { id: "telefonat", label: "Telefonát", icon: Phone, color: "text-rose-600 hover:bg-rose-50 border-slate-200" },
  { id: "mail", label: "E-mail", icon: Mail, color: "text-slate-600 hover:bg-slate-100 border-slate-200" },
  { id: "kafe", label: "Kafe", icon: Coffee, color: "text-amber-700 hover:bg-amber-50 border-slate-200" },
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
}

export function QuickEventForm({
  initialStart,
  initialEnd,
  initialValues,
  contacts,
  onSave,
  onClose,
  anchorRef,
}: QuickEventFormProps) {
  const [form, setForm] = useState<QuickEventFormValues>(() => ({
    ...DEFAULT_VALUES,
    ...initialValues,
    startAt: initialValues?.startAt ?? initialStart,
    endAt: initialValues?.endAt ?? initialEnd ?? addHour(initialStart),
    eventType: initialValues?.eventType ?? "schuzka",
    title: initialValues?.title ?? "",
    contactId: initialValues?.contactId ?? "",
    notes: initialValues?.notes ?? "",
    location: (initialValues as QuickEventFormValues)?.location ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
    await onSave({ ...form, title }, initialValues?.id);
    setSaving(false);
    onClose();
  }

  return (
    <div
      ref={ref}
      className="bg-white rounded-2xl shadow-2xl w-full max-w-[600px] flex flex-col overflow-hidden border border-slate-100"
      role="dialog"
      aria-label={initialValues?.id ? "Rychlá úprava události" : "Nová aktivita"}
    >
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <h2 className="text-lg font-bold text-slate-900">{initialValues?.id ? "Upravit aktivitu" : "Nová aktivita"}</h2>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-200" aria-label="Zavřít">
          <X size={18} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="p-6 space-y-6 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2">
            {ACTIVITY_TYPES.map((type) => {
              const Icon = type.icon;
              const isActive = form.eventType === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, eventType: type.id }))}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                    isActive ? type.color : "text-slate-600 hover:bg-slate-50 border-slate-200 shadow-sm"
                  }`}
                >
                  <Icon size={16} className={isActive && type.id !== "schuzka" ? "" : isActive ? "text-white/80" : "text-slate-400"} />
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
            className="w-full text-xl font-bold text-slate-800 placeholder:text-slate-400 border-b-2 border-slate-200 hover:border-slate-300 focus:border-indigo-500 py-2 outline-none transition-colors bg-transparent"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Začátek</label>
              <input
                type="datetime-local"
                value={form.startAt}
                onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Konec</label>
              <input
                type="datetime-local"
                value={form.endAt}
                onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Kontakt</label>
              <select
                value={form.contactId}
                onChange={(e) => setForm((f) => ({ ...f, contactId: e.target.value }))}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">— žádný —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Místo</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Adresa / odkaz"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Poznámka</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Volitelné"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving || !form.startAt}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md transition-colors disabled:opacity-50"
          >
            {saving ? "Ukládám…" : initialValues?.id ? "Uložit" : "Vytvořit"}
          </button>
          <button type="button" onClick={onClose} className="text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors px-4 py-2">
            Zavřít
          </button>
        </div>
      </form>
    </div>
  );
}

function addHour(iso: string): string {
  const d = new Date(iso);
  d.setHours(d.getHours() + 1);
  return d.toISOString().slice(0, 16);
}
