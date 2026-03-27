import { getMeetingNotesForBoard } from "@/app/actions/meeting-notes";
import { getContactsList } from "@/app/actions/contacts";
import { NotesVisionBoard } from "./NotesVisionBoard";

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; noteId?: string }>;
}) {
  const sp = await searchParams;
  let notes: Awaited<ReturnType<typeof getMeetingNotesForBoard>> = [];
  let contactsList: Awaited<ReturnType<typeof getContactsList>> = [];
  try {
    [notes, contactsList] = await Promise.all([
      getMeetingNotesForBoard(),
      getContactsList(),
    ]);
  } catch {
    notes = [];
    contactsList = [];
  }

  return (
    <div className="portal-notes-board-light flex min-h-0 w-full min-h-[calc(100dvh-11rem)] flex-1 flex-col bg-[color:var(--wp-main-scroll-bg)]">
      <NotesVisionBoard
        initialNotes={notes}
        contacts={contactsList}
        initialSearchQuery={sp.q ?? ""}
        initialNoteId={sp.noteId ?? null}
      />
    </div>
  );
}
