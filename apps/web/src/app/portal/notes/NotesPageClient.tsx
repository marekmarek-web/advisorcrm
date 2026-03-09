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
import { MeetingNotesForm } from "@/app/dashboard/meeting-notes/MeetingNotesForm";
import { EmptyState } from "@/app/components/EmptyState";

export function NotesPageClient({
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
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-semibold text-monday-text">Zápisky ze schůzek</h1>
      <p className="text-monday-text-muted text-sm">
        Strukturované zápisky dle šablon (hypo / invest / pojist).
      </p>
      <div id="new-note-form">
        <MeetingNotesForm
          templates={templates}
          contacts={contacts}
          editingNote={editingNote}
          onSaved={handleSaved}
          onCancel={() => setEditingNote(null)}
        />
      </div>
      <div className="rounded-lg border border-monday-border bg-monday-surface overflow-hidden">
        <h2 className="p-3 border-b border-monday-border font-semibold text-monday-text text-sm">
          Poslední zápisky
        </h2>
        {notes.length === 0 ? (
          <EmptyState
            icon="📝"
            title="Zatím žádné zápisky"
            description="Vytvořte zápisek ze schůzky pomocí formuláře nahoře."
            actionLabel="Vytvořit zápisek"
            onAction={() => document.getElementById("new-note-form")?.scrollIntoView({ behavior: "smooth" })}
          />
        ) : (
          <ul className="divide-y divide-monday-border">
            {notes.map((n) => (
              <li key={n.id} className="p-3 flex justify-between items-center text-sm text-monday-text">
                <span>
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
    </div>
  );
}
