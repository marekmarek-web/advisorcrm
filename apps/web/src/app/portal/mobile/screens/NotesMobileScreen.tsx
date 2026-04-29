"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { MeetingNoteForBoard } from "@/app/actions/meeting-notes";
import { getMeetingNotesForBoard } from "@/app/actions/meeting-notes";
import { getNotesBoardPositions } from "@/app/actions/notes-board-positions";
import { getContactNamePickerRows, type ContactNamePickerRow } from "@/app/actions/contacts";
import { NotesVisionBoard } from "@/app/portal/notes/NotesVisionBoard";
import { ErrorState, LoadingSkeleton } from "@/app/shared/mobile-ui/primitives";
import { getFailedServerActionFriendlyMessage } from "@/lib/observability/production-error-ui";

export function NotesMobileScreen({ seededMeetingNotes = [] }: { seededMeetingNotes?: MeetingNoteForBoard[] }) {
  const [notes, setNotes] = useState<Awaited<ReturnType<typeof getMeetingNotesForBoard>>>(() => seededMeetingNotes);
  const [contacts, setContacts] = useState<ContactNamePickerRow[]>([]);
  const [boardPositions, setBoardPositions] = useState<Awaited<ReturnType<typeof getNotesBoardPositions>>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (seededMeetingNotes.length === 0) return;
    setNotes((prev) => (prev.length === 0 ? seededMeetingNotes : prev));
  }, [seededMeetingNotes]);

  const refetch = useCallback(() => {
    startTransition(async () => {
      setError(null);
      try {
        const [n, c, bp] = await Promise.all([
          getMeetingNotesForBoard(),
          getContactNamePickerRows(),
          getNotesBoardPositions(),
        ]);
        setNotes(n);
        setContacts(c);
        setBoardPositions(bp);
      } catch (e) {
        setError(getFailedServerActionFriendlyMessage(e, "Nepodařilo se načíst zápisky."));
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
    return (
      <ErrorState
        title="Zápisky se nepovedly načíst"
        description={error}
        onRetry={refetch}
      />
    );
  }

  return (
    <div
      className="portal-notes-board-light flex min-h-0 w-full flex-1 flex-col"
      style={{
        paddingRight: "env(safe-area-inset-right, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
      }}
    >
      <NotesVisionBoard
        initialNotes={notes}
        contacts={contacts}
        initialSearchQuery=""
        initialNoteId={null}
        initialBoardPositions={boardPositions}
      />
    </div>
  );
}
