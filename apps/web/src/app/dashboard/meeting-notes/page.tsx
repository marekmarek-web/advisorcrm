import { getMeetingNotesList, getNoteTemplates } from "@/app/actions/meeting-notes";
import { getContactsList } from "@/app/actions/contacts";
import { MeetingNotesListClient } from "./MeetingNotesListClient";

export default async function MeetingNotesPage() {
  const [notes, templates, contactsList] = await Promise.all([
    getMeetingNotesList(),
    getNoteTemplates(),
    getContactsList(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: "var(--brand-dark)" }}>
        Zápisky ze schůzek
      </h1>
      <p className="text-slate-600">Strukturované zápisky dle šablon (hypo / invest / pojist).</p>
      <MeetingNotesListClient
        initialNotes={notes}
        templates={templates}
        contacts={contactsList}
      />
    </div>
  );
}
