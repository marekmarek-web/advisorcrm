import { Suspense } from "react";
import { getMeetingNotesForBoard } from "@/app/actions/meeting-notes";
import { getContactsList } from "@/app/actions/contacts";
import { NotesVisionBoard } from "./NotesVisionBoard";

export default async function NotesPage() {
  const [notes, contactsList] = await Promise.all([
    getMeetingNotesForBoard(),
    getContactsList(),
  ]);

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      <Suspense fallback={<div className="flex flex-1 items-center justify-center text-slate-500">Načítám…</div>}>
        <NotesVisionBoard initialNotes={notes} contacts={contactsList} />
      </Suspense>
    </div>
  );
}
