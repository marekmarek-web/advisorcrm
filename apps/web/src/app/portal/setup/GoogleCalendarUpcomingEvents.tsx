"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, Calendar, MapPin, Plus, Pencil, Trash2, User } from "lucide-react";
import { BaseModal } from "@/app/components/BaseModal";
import { useToast } from "@/app/components/Toast";
import { getContactsList, type ContactRow } from "@/app/actions/contacts";
import { getOpenOpportunitiesList } from "@/app/actions/pipeline";

export type CalendarEventItem = {
  id: string;
  title: string;
  start: string;
  end: string;
  location: string | null;
  allDay: boolean;
  contactId?: string | null;
  opportunityId?: string | null;
  contactName?: string | null;
};

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "short", year: "numeric" });
}

function formatEventTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

function EventSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Načítám události">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-3 p-3 rounded-xl bg-slate-50 animate-pulse">
          <div className="w-10 h-10 rounded-lg bg-slate-200 shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-4 w-3/4 rounded bg-slate-200" />
            <div className="h-3 w-1/2 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function toDatetimeLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

function defaultStart(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

function defaultEnd(): Date {
  const d = defaultStart();
  d.setHours(d.getHours() + 1);
  return d;
}

export function GoogleCalendarUpcomingEvents() {
  const toast = useToast();
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    start: toDatetimeLocal(defaultStart()),
    end: toDatetimeLocal(defaultEnd()),
    description: "",
    location: "",
    contactId: "",
    opportunityId: "",
  });
  const [contactsList, setContactsList] = useState<ContactRow[]>([]);
  const [opportunitiesList, setOpportunitiesList] = useState<{ id: string; title: string; contactId: string | null }[]>([]);
  const [filterContactId, setFilterContactId] = useState<string>("");
  const [editOpen, setEditOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(createForm);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/events");
      const data = (await res.json()) as { events?: CalendarEventItem[]; error?: string; detail?: string };
      if (!res.ok) {
        setError(data.error ?? data.detail ?? "Načtení událostí se nepovedlo.");
        setEvents([]);
        return;
      }
      setEvents(data.events ?? []);
    } catch {
      setError("Načtení událostí se nepovedlo.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    getContactsList().then(setContactsList).catch(() => setContactsList([]));
    getOpenOpportunitiesList().then(setOpportunitiesList).catch(() => setOpportunitiesList([]));
  }, []);

  if (loading) {
    return (
      <div className="mt-4 pt-4 border-t border-slate-100">
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Nadcházející události</h4>
        <EventSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 pt-4 border-t border-slate-100">
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Nadcházející události</h4>
        <p className="text-sm text-amber-700 font-medium flex items-center gap-2 mb-2">
          <AlertCircle size={16} className="shrink-0" aria-hidden /> {error}
        </p>
        <button type="button" onClick={fetchEvents} className="wp-btn min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-bold hover:bg-slate-200">
          Zkusit znovu
        </button>
      </div>
    );
  }

  const openEdit = useCallback((ev: CalendarEventItem) => {
    setEditingEventId(ev.id);
    const startLocal = ev.start ? toDatetimeLocal(new Date(ev.start)) : toDatetimeLocal(defaultStart());
    const endLocal = ev.end ? toDatetimeLocal(new Date(ev.end)) : toDatetimeLocal(defaultEnd());
    setEditForm({
      title: ev.title,
      start: startLocal,
      end: endLocal,
      description: "",
      location: ev.location ?? "",
      contactId: ev.contactId ?? "",
      opportunityId: ev.opportunityId ?? "",
    });
    setEditOpen(true);
    setEditLoading(true);
    fetch(`/api/calendar/events/${encodeURIComponent(ev.id)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          toast.showToast(data.error ?? "Načtení události se nepovedlo.", "error");
          return null;
        }
        return res.json() as Promise<{ description?: string } | null>;
      })
      .then((data) => {
        if (data?.description != null) setEditForm((prev) => ({ ...prev, description: data.description ?? "" }));
      })
      .catch(() => toast.showToast("Načtení události se nepovedlo.", "error"))
      .finally(() => setEditLoading(false));
  }, [toast]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEventId) return;
    const title = editForm.title.trim();
    if (!title) {
      toast.showToast("Vyplňte název události.", "error");
      return;
    }
    const startIso = new Date(editForm.start).toISOString();
    const endIso = new Date(editForm.end).toISOString();
    if (new Date(editForm.end).getTime() <= new Date(editForm.start).getTime()) {
      toast.showToast("Čas konce musí být po čase začátku.", "error");
      return;
    }
    setEditSaving(true);
    try {
      const res = await fetch(`/api/calendar/events/${encodeURIComponent(editingEventId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          start: startIso,
          end: endIso,
          description: editForm.description.trim() || undefined,
          location: editForm.location.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) {
        toast.showToast(data.error ?? data.detail ?? "Uložení změn se nepovedlo.", "error");
        return;
      }
      toast.showToast("Událost byla upravena.", "success");
      setEditOpen(false);
      setEditingEventId(null);
      fetchEvents();
    } catch {
      toast.showToast("Uložení změn se nepovedlo.", "error");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = useCallback(
    async (ev: CalendarEventItem) => {
      if (!window.confirm("Opravdu chcete smazat tuto událost z Google Kalendáře?")) return;
      setDeletingId(ev.id);
      try {
        const res = await fetch(`/api/calendar/events/${encodeURIComponent(ev.id)}`, { method: "DELETE" });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          toast.showToast(data.error ?? "Smazání události se nepovedlo.", "error");
          return;
        }
        toast.showToast("Událost byla smazána.", "success");
        fetchEvents();
      } catch {
        toast.showToast("Smazání události se nepovedlo.", "error");
      } finally {
        setDeletingId(null);
      }
    },
    [fetchEvents, toast]
  );

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = createForm.title.trim();
    if (!title) {
      toast.showToast("Vyplňte název události.", "error");
      return;
    }
    const startIso = new Date(createForm.start).toISOString();
    const endIso = new Date(createForm.end).toISOString();
    if (new Date(createForm.end).getTime() <= new Date(createForm.start).getTime()) {
      toast.showToast("Čas konce musí být po čase začátku.", "error");
      return;
    }
    setCreateSaving(true);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          start: startIso,
          end: endIso,
          description: createForm.description.trim() || undefined,
          location: createForm.location.trim() || undefined,
          contactId: createForm.contactId.trim() || undefined,
          opportunityId: createForm.opportunityId.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { id?: string; error?: string; detail?: string };
      if (!res.ok) {
        toast.showToast(data.error ?? data.detail ?? "Vytvoření události se nepovedlo.", "error");
        return;
      }
      toast.showToast("Událost byla vytvořena v Google Kalendáři.", "success");
      setCreateOpen(false);
      setCreateForm({ title: "", start: toDatetimeLocal(defaultStart()), end: toDatetimeLocal(defaultEnd()), description: "", location: "", contactId: "", opportunityId: "" });
      fetchEvents();
    } catch {
      toast.showToast("Vytvoření události se nepovedlo.", "error");
    } finally {
      setCreateSaving(false);
    }
  };

  const labelClass = "block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1";
  const inputClass =
    "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all text-slate-800 placeholder:text-slate-400 min-h-[44px]";

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Nadcházející události</h4>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="gcal-filter-contact" className="sr-only">Filtrovat podle klienta</label>
          <select
            id="gcal-filter-contact"
            value={filterContactId}
            onChange={(e) => setFilterContactId(e.target.value)}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium text-slate-800 focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
          >
            <option value="">Všichni klienti</option>
            {contactsList.map((c) => (
              <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
            ))}
          </select>
          <button
          type="button"
          onClick={() => {
            setCreateForm({ title: "", start: toDatetimeLocal(defaultStart()), end: toDatetimeLocal(defaultEnd()), description: "", location: "", contactId: "", opportunityId: "" });
            setCreateOpen(true);
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors min-h-[40px]"
        >
          <Plus size={14} /> Vytvořit událost
        </button>
        </div>
      </div>
      {(() => {
        const filtered = filterContactId ? events.filter((ev) => ev.contactId === filterContactId) : events;
        return filtered.length === 0 ? (
        <p className="text-sm text-slate-500 font-medium">
          {filterContactId ? "Žádné události pro vybraného klienta." : "Žádné nadcházející události."}
        </p>
      ) : (
        <ul className="space-y-2" role="list">
          {filtered.map((ev) => (
            <li key={ev.id} className="flex gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 items-start">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 shrink-0" aria-hidden>
                <Calendar size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800 truncate">{ev.title}</p>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                  {formatEventDate(ev.start)}
                  {!ev.allDay && ` · ${formatEventTime(ev.start)}${ev.end ? ` – ${formatEventTime(ev.end)}` : ""}`}
                  {ev.allDay && " · celý den"}
                </p>
                {ev.location && (
                  <p className="text-xs font-medium text-slate-500 mt-1 flex items-center gap-1">
                    <MapPin size={12} className="shrink-0" /> {ev.location}
                  </p>
                )}
                {ev.contactId && (ev.contactName || ev.contactId) && (
                  <p className="text-xs font-medium text-slate-600 mt-1 flex items-center gap-1">
                    <User size={12} className="shrink-0 text-indigo-500" />
                    <Link href={`/portal/contacts/${ev.contactId}`} className="text-indigo-600 hover:text-indigo-800 hover:underline truncate">
                      {ev.contactName ?? "Klient"}
                    </Link>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(ev)}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 hover:text-indigo-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  title="Upravit událost"
                  aria-label="Upravit událost"
                >
                  <Pencil size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(ev)}
                  disabled={deletingId === ev.id}
                  className="p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-60"
                  title="Smazat událost"
                  aria-label="Smazat událost"
                >
                  {deletingId === ev.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                </button>
              </div>
            </li>
          ))}
        </ul>
      );
      })()}

      <BaseModal open={createOpen} onClose={() => !createSaving && setCreateOpen(false)} title="Nová událost v Google Kalendáři" maxWidth="md">
        <form onSubmit={handleCreateSubmit} className="flex flex-col">
          <div className="px-5 py-4 space-y-4 overflow-y-auto max-h-[70vh]">
            <div>
              <label htmlFor="gcal-event-title" className={labelClass}>Název *</label>
              <input
                id="gcal-event-title"
                type="text"
                required
                maxLength={500}
                placeholder="Např. Schůzka s klientem"
                value={createForm.title}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="gcal-event-start" className={labelClass}>Začátek *</label>
                <input
                  id="gcal-event-start"
                  type="datetime-local"
                  required
                  value={createForm.start}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, start: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="gcal-event-end" className={labelClass}>Konec *</label>
                <input
                  id="gcal-event-end"
                  type="datetime-local"
                  required
                  value={createForm.end}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, end: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label htmlFor="gcal-event-location" className={labelClass}>Místo</label>
              <input
                id="gcal-event-location"
                type="text"
                placeholder="Např. Kancelář, videohovor"
                value={createForm.location}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, location: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="gcal-event-contact" className={labelClass}>Klient / Lead</label>
              <select
                id="gcal-event-contact"
                value={createForm.contactId}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, contactId: e.target.value, opportunityId: "" }))}
                className={inputClass}
              >
                <option value="">— Nepřiřazeno —</option>
                {contactsList.map((c) => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.email ? ` (${c.email})` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="gcal-event-opportunity" className={labelClass}>Obchod / příležitost</label>
              <select
                id="gcal-event-opportunity"
                value={createForm.opportunityId}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, opportunityId: e.target.value }))}
                className={inputClass}
              >
                <option value="">— Nepřiřazeno —</option>
                {opportunitiesList
                  .filter((o) => !createForm.contactId || o.contactId === createForm.contactId)
                  .map((o) => (
                    <option key={o.id} value={o.id}>{o.title}{o.contactId ? ` · ${contactsList.find((c) => c.id === o.contactId)?.firstName ?? ""} ${contactsList.find((c) => c.id === o.contactId)?.lastName ?? ""}` : ""}</option>
                  ))}
              </select>
            </div>
            <div>
              <label htmlFor="gcal-event-description" className={labelClass}>Poznámka</label>
              <textarea
                id="gcal-event-description"
                rows={3}
                placeholder="Volitelný popis nebo poznámky"
                value={createForm.description}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
                className={`${inputClass} min-h-[80px] resize-y`}
              />
            </div>
          </div>
          <div className="px-5 py-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <button type="button" onClick={() => setCreateOpen(false)} disabled={createSaving} className="wp-btn min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-bold hover:bg-slate-200 disabled:opacity-60">
              Zrušit
            </button>
            <button type="submit" disabled={createSaving} className="wp-btn wp-btn-primary min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2">
              {createSaving ? <Loader2 size={16} className="animate-spin shrink-0" /> : null}
              {createSaving ? "Vytvářím…" : "Vytvořit událost"}
            </button>
          </div>
        </form>
      </BaseModal>

      <BaseModal open={editOpen} onClose={() => !editSaving && !editLoading && setEditOpen(false)} title="Upravit událost" maxWidth="md">
        {editLoading ? (
          <div className="px-5 py-8 flex items-center justify-center gap-2 text-slate-500">
            <Loader2 size={20} className="animate-spin shrink-0" /> Načítám událost…
          </div>
        ) : (
          <form onSubmit={handleEditSubmit} className="flex flex-col">
            <div className="px-5 py-4 space-y-4 overflow-y-auto max-h-[70vh]">
              <div>
                <label htmlFor="gcal-edit-title" className={labelClass}>Název *</label>
                <input
                  id="gcal-edit-title"
                  type="text"
                  required
                  maxLength={500}
                  placeholder="Např. Schůzka s klientem"
                  value={editForm.title}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="gcal-edit-start" className={labelClass}>Začátek *</label>
                  <input
                    id="gcal-edit-start"
                    type="datetime-local"
                    required
                    value={editForm.start}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, start: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="gcal-edit-end" className={labelClass}>Konec *</label>
                  <input
                    id="gcal-edit-end"
                    type="datetime-local"
                    required
                    value={editForm.end}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, end: e.target.value }))}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="gcal-edit-location" className={labelClass}>Místo</label>
                <input
                  id="gcal-edit-location"
                  type="text"
                  placeholder="Např. Kancelář, videohovor"
                  value={editForm.location}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, location: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="gcal-edit-description" className={labelClass}>Poznámka</label>
                <textarea
                  id="gcal-edit-description"
                  rows={3}
                  placeholder="Volitelný popis nebo poznámky"
                  value={editForm.description}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                  className={`${inputClass} min-h-[80px] resize-y`}
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button type="button" onClick={() => setEditOpen(false)} disabled={editSaving} className="wp-btn min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 text-slate-800 text-sm font-bold hover:bg-slate-200 disabled:opacity-60">
                Zrušit
              </button>
              <button type="submit" disabled={editSaving} className="wp-btn wp-btn-primary min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2">
                {editSaving ? <Loader2 size={16} className="animate-spin shrink-0" /> : null}
                {editSaving ? "Ukládám…" : "Uložit změny"}
              </button>
            </div>
          </form>
        )}
      </BaseModal>
    </div>
  );
}
