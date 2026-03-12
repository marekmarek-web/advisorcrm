"use client";

import { useState, useEffect, useRef } from "react";
import { CALENDAR_EVENT_CATEGORIES } from "./event-categories";
import type { ContactRow } from "@/app/actions/contacts";

export interface QuickEventFormValues {
  title: string;
  eventType: string;
  startAt: string;
  endAt: string;
  contactId: string;
  notes: string;
}

const DEFAULT_VALUES: QuickEventFormValues = {
  title: "",
  eventType: "schuzka",
  startAt: "",
  endAt: "",
  contactId: "",
  notes: "",
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

  const categories = CALENDAR_EVENT_CATEGORIES.filter(
    (c) => ["schuzka", "telefonat", "kafe", "mail", "ukol", "priorita", "servis", "interni"].includes(c.id)
  );

  return (
    <div
      ref={ref}
      className="wp-cal-quick-form"
      role="dialog"
      aria-label={initialValues?.id ? "Rychlá úprava události" : "Nová událost"}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setForm((f) => ({ ...f, eventType: c.id }))}
              className={`wp-cal-quick-form-type ${form.eventType === c.id ? "active" : ""}`}
              style={
                form.eventType === c.id
                  ? { backgroundColor: c.color, borderColor: c.color, color: "#fff" }
                  : { borderColor: "var(--wp-border)" }
              }
              title={c.label}
            >
              <span>{c.icon}</span>
            </button>
          ))}
        </div>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Název aktivity…"
          className="wp-cal-quick-form-title"
          autoFocus
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="datetime-local"
            value={form.startAt}
            onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
            className="wp-input wp-cal-quick-form-input"
          />
          <input
            type="datetime-local"
            value={form.endAt}
            onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
            className="wp-input wp-cal-quick-form-input"
          />
        </div>
        <select
          value={form.contactId}
          onChange={(e) => setForm((f) => ({ ...f, contactId: e.target.value }))}
          className="wp-select wp-cal-quick-form-input"
        >
          <option value="">— bez kontaktu</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.firstName} {c.lastName}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Poznámka (volitelné)"
          className="wp-input wp-cal-quick-form-input"
        />
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="wp-btn wp-btn-ghost">
            Zrušit
          </button>
          <button
            type="submit"
            disabled={saving || !form.startAt}
            className="wp-btn wp-btn-primary"
            style={{ background: "var(--wp-cal-accent)", borderColor: "var(--wp-cal-accent)" }}
          >
            {saving ? "Ukládám…" : initialValues?.id ? "Uložit" : "Vytvořit"}
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
