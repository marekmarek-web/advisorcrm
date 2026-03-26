"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Save, Trash2 } from "lucide-react";
import {
  getMeetingNotesByOpportunityId,
  createMeetingNote,
  deleteMeetingNote,
} from "@/app/actions/meeting-notes";
import type { MeetingNoteRowWithContent } from "@/app/actions/meeting-notes";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";

export function OpportunityNotesTab({
  opportunityId,
  contactId,
}: {
  opportunityId: string;
  contactId: string | null;
}) {
  const [list, setList] = useState<MeetingNoteRowWithContent[]>([]);
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

  if (loading) {
    return <p className="text-sm font-medium text-slate-500">Načítání…</p>;
  }

  return (
    <div className="space-y-6 flex flex-col h-full">
      {contactId ? (
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-800">
            <MessageSquare size={16} className="text-indigo-500 shrink-0" aria-hidden />
            Nová poznámka k obchodu
          </div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
            Datum schůzky
          </label>
          <input
            type="datetime-local"
            step={300}
            name="meetingAt"
            className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm font-medium focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
            required
          />
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
            Text
          </label>
          <textarea
            name="body"
            rows={5}
            placeholder="Zapište si detaily z jednání, požadavky klienta…"
            className="w-full min-h-[200px] p-5 border border-slate-200 rounded-2xl bg-slate-50 outline-none focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all text-sm font-medium resize-none shadow-inner"
            required
          />
          <div className="flex justify-end">
            <CreateActionButton type="submit" isLoading={saving} icon={Save}>
              {saving ? "Ukládám…" : "Uložit poznámku"}
            </CreateActionButton>
          </div>
        </form>
      ) : (
        <p className="text-sm font-medium text-slate-500 rounded-2xl border border-slate-100 bg-slate-50 p-5">
          Pro přidání poznámky přiřaďte obchodu klienta.
        </p>
      )}

      {list.length === 0 ? (
        <p className="text-sm font-medium text-slate-500">Žádné poznámky.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((n) => (
            <li
              key={n.id}
              className="rounded-2xl border border-slate-100 bg-white shadow-sm p-4 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                  {new Date(n.meetingAt).toLocaleString("cs-CZ")} · {n.domain}
                </p>
                {n.contentPreview ? (
                  <p className="text-sm font-medium text-slate-800 mt-2 leading-relaxed whitespace-pre-wrap">
                    {n.contentPreview}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500 mt-2">Poznámka bez textu</p>
                )}
                <p className="text-xs text-slate-400 mt-1">{n.contactName}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(n.id)}
                className="min-h-[44px] min-w-[44px] sm:min-w-0 inline-flex items-center justify-center gap-1 rounded-xl text-rose-600 hover:bg-rose-50 font-bold text-xs uppercase tracking-wider shrink-0 self-end sm:self-start px-3"
                aria-label="Smazat poznámku"
              >
                <Trash2 size={16} aria-hidden />
                <span className="sm:hidden">Smazat</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
