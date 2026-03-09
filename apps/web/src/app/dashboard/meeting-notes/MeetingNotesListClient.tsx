"use client";

import { useState } from "react";
import {
  getMeetingNotesList,
  getMeetingNote,
  deleteMeetingNote,
} from "@/app/actions/meeting-notes";
import type {
  MeetingNoteRow,
  MeetingNoteDetail,
  TemplateRow,
} from "@/app/actions/meeting-notes";
import type { ContactRow } from "@/app/actions/contacts";
import { MeetingNotesForm } from "./MeetingNotesForm";

export function MeetingNotesListClient({
  initialNotes,
  templates,
  contacts,
}: {
  initialNotes: MeetingNoteRow[];
  templates: TemplateRow[];
  contacts: ContactRow[];
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [editingNote, setEditingNote] = useState<MeetingNoteDetail | null>(null);

  async function reload() {
    const fresh = await getMeetingNotesList();
    setNotes(fresh);
  }

  async function handleEdit(noteId: string) {
    const detail = await getMeetingNote(noteId);
    if (detail) setEditingNote(detail);
  }

  async function handleDelete(noteId: string) {
    if (!window.confirm("Opravdu chcete smazat tento zápisek?")) return;
    await deleteMeetingNote(noteId);
    reload();
  }

  function handleSaved() {
    setEditingNote(null);
    reload();
  }

  return (
    <>
      <MeetingNotesForm
        templates={templates}
        contacts={contacts}
        editingNote={editingNote}
        onSaved={handleSaved}
        onCancel={() => setEditingNote(null)}
      />
      <div className="rounded-xl border border-[var(--brand-border)] bg-white overflow-hidden shadow-sm">
        <h2 className="p-3 border-b border-slate-100 font-semibold text-slate-700">
          Poslední zápisky
        </h2>
        {notes.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Zatím žádné zápisky.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {notes.map((n) => (
              <li key={n.id} className="p-3 flex justify-between items-center">
                <span className="text-sm">
                  {new Date(n.meetingAt).toLocaleDateString("cs-CZ")} – {n.contactName} ({n.domain})
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(n.id)}
                    className="text-xs font-medium px-2 py-0.5 rounded border border-[var(--brand-border)] hover:bg-slate-50"
                    style={{ color: "var(--brand-main)" }}
                  >
                    Upravit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(n.id)}
                    className="text-xs font-medium text-red-600 hover:text-red-800 px-2 py-0.5"
                  >
                    Smazat
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
