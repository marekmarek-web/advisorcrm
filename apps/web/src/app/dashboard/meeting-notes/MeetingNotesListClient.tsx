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
      <div className="overflow-hidden rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm">
        <h2 className="border-b border-[color:var(--wp-surface-card-border)] p-3 font-semibold text-[color:var(--wp-text)]">
          Poslední zápisky
        </h2>
        {notes.length === 0 ? (
          <p className="p-6 text-sm text-[color:var(--wp-text-tertiary)]">Zatím žádné zápisky.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--wp-border)]">
            {notes.map((n) => (
              <li key={n.id} className="flex items-center justify-between p-3">
                <span className="text-sm text-[color:var(--wp-text)]">
                  {new Date(n.meetingAt).toLocaleDateString("cs-CZ")} – {n.contactName} ({n.domain})
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(n.id)}
                    className="rounded border border-[color:var(--wp-surface-card-border)] px-2 py-0.5 text-xs font-medium hover:bg-[color:var(--wp-surface-muted)]"
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
