"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { getMeetingNotesForBoard } from "@/app/actions/meeting-notes";
import { getContactsList, type ContactRow } from "@/app/actions/contacts";
import { NotesVisionBoard } from "@/app/portal/notes/NotesVisionBoard";
import { ErrorState, LoadingSkeleton } from "@/app/shared/mobile-ui/primitives";

export function NotesMobileScreen() {
  const [notes, setNotes] = useState<Awaited<ReturnType<typeof getMeetingNotesForBoard>>>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refetch = useCallback(() => {
    startTransition(async () => {
      setError(null);
      try {
        const [n, c] = await Promise.all([getMeetingNotesForBoard(), getContactsList()]);
        setNotes(n);
        setContacts(c);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nepodařilo se načíst zápisky.");
      }
    });
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  if (pending && notes.length === 0 && contacts.length === 0) {
    return <LoadingSkeleton variant="card" rows={5} />;
  }
  if (error) {
    return <ErrorState title={error} onRetry={refetch} />;
  }

  return (
    <div className="portal-notes-board-light -mx-4 -mt-4 flex min-h-[60vh] w-full flex-1 flex-col">
      <NotesVisionBoard
        initialNotes={notes}
        contacts={contacts}
        initialSearchQuery=""
        initialNoteId={null}
      />
    </div>
  );
}
