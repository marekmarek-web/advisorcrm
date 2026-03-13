"use client";

import { useState, useEffect } from "react";
import {
  getMeetingNotesByOpportunityId,
  createMeetingNote,
  deleteMeetingNote,
} from "@/app/actions/meeting-notes";
import type { MeetingNoteRow } from "@/app/actions/meeting-notes";

export function OpportunityNotesTab({
  opportunityId,
  contactId,
}: {
  opportunityId: string;
  contactId: string | null;
}) {
  const [list, setList] = useState<MeetingNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    getMeetingNotesByOpportunityId(opportunityId)
      .then(setList)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => load(), [opportunityId]);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!contactId) {
      alert("Přiřaďte obchodu klienta pro přidání poznámky.");
      return;
    }
    const form = e.currentTarget;
    const meetingAt = (form.elements.namedItem("meetingAt") as HTMLInputElement)?.value;
    const body = (form.elements.namedItem("body") as HTMLTextAreaElement)?.value;
    if (!meetingAt || !body) return;
    setSaving(true);
    try {
      await createMeetingNote({
        contactId,
        opportunityId,
        meetingAt,
        domain: "obchod",
        content: { body },
      });
      form.reset();
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Chyba");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Smazat poznámku?")) return;
    await deleteMeetingNote(id);
    load();
  }

  if (loading) return <p className="text-sm text-slate-500">Načítání…</p>;

  return (
    <div className="space-y-4">
      {contactId ? (
        <form onSubmit={handleAdd} className="rounded-xl border border-slate-200 p-4 space-y-2">
          <label className="block text-sm font-medium text-slate-700">Datum schůzky</label>
          <input type="datetime-local" step={300} name="meetingAt" className="rounded border border-slate-300 px-2 py-1 text-sm w-full max-w-xs" required />
          <label className="block text-sm font-medium text-slate-700">Poznámka</label>
          <textarea name="body" rows={3} className="rounded border border-slate-300 px-2 py-1 text-sm w-full" required />
          <button type="submit" disabled={saving} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
            {saving ? "Ukládám…" : "Přidat poznámku"}
          </button>
        </form>
      ) : (
        <p className="text-sm text-slate-500">Pro přidání poznámky přiřaďte obchodu klienta.</p>
      )}

      {list.length === 0 ? (
        <p className="text-sm text-slate-500">Žádné poznámky.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((n) => (
            <li key={n.id} className="rounded-xl border border-slate-200 p-3 flex justify-between items-start">
              <div>
                <p className="text-xs text-slate-500">{new Date(n.meetingAt).toLocaleString("cs-CZ")} · {n.domain}</p>
                <p className="text-sm text-slate-800 mt-1">Poznámka (viz detail)</p>
              </div>
              <button type="button" onClick={() => handleDelete(n.id)} className="text-xs text-red-600 hover:underline">
                Smazat
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
