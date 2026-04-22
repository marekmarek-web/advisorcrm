"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { getMeetingNotesList } from "@/app/actions/meeting-notes";
import type { MeetingNoteRow } from "@/app/actions/meeting-notes";

export function ContactLastNotePreview({ contactId }: { contactId: string }) {
  const [notes, setNotes] = useState<MeetingNoteRow[]>([]);

  useEffect(() => {
    getMeetingNotesList(contactId)
      .then((list) => setNotes(list.slice(0, 1)))
      .catch(() => setNotes([]));
  }, [contactId]);

  if (notes.length === 0) return null;

  const last = notes[0];
  const dateLabel = new Date(last.meetingAt).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="bg-amber-50/50 rounded-[var(--wp-radius-card)] border border-amber-100 p-6 flex items-start gap-4">
      <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl flex-shrink-0">
        <FileText size={24} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-1">
          <h3 className="text-sm font-black text-amber-900 uppercase tracking-widest">
            Poslední zápisek
          </h3>
          <span className="text-[10px] font-bold text-amber-700">{dateLabel}</span>
        </div>
        <p className="text-sm font-medium text-amber-900/80 leading-relaxed italic line-clamp-2">
          {last.domain ? `[${last.domain}] ` : ""}
          Zápisek ze schůzky – zobrazit detail v záložce Zápisky.
        </p>
      </div>
      <Link
        href={`/portal/notes?contactId=${contactId}&note=${last.id}`}
        className="w-10 h-10 rounded-full bg-[color:var(--wp-surface-card)] text-amber-600 flex items-center justify-center shadow-sm hover:scale-105 transition-transform flex-shrink-0 border border-amber-200 min-h-[44px] min-w-[44px]"
        aria-label="Otevřít zápisek"
      >
        <Plus size={16} />
      </Link>
    </div>
  );
}
