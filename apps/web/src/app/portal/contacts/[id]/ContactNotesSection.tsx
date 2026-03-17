"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getMeetingNotesList } from "@/app/actions/meeting-notes";
import type { MeetingNoteRow } from "@/app/actions/meeting-notes";
import { EmptyState } from "@/app/components/EmptyState";

export function ContactNotesSection({ contactId }: { contactId: string }) {
  const [notes, setNotes] = useState<MeetingNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setLoadError(null);
    getMeetingNotesList(contactId)
      .then((data) => {
        setNotes(data);
      })
      .catch(() => {
        setNotes([]);
        setLoadError("Nepodařilo se načíst zápisky.");
      })
      .finally(() => setLoading(false));
  }, [contactId, retry]);

  if (loading) {
    return (
      <div className="rounded-[var(--wp-radius-lg)] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Načítám zápisky…</p>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="rounded-[var(--wp-radius-lg)] border border-red-200 bg-red-50 p-6 shadow-sm">
        <p className="text-red-600 text-sm mb-3">{loadError}</p>
        <button
          type="button"
          onClick={() => setRetry((r) => r + 1)}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 min-h-[44px]"
        >
          Zkusit znovu
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-800">Zápisky ze schůzek</h2>
        <Link
          href={`/portal/notes?contactId=${contactId}`}
          className="inline-flex items-center gap-2 rounded-[var(--wp-radius)] bg-[var(--wp-accent)] text-white px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity min-h-[44px]"
        >
          Nový zápisek
        </Link>
      </div>
      <div className="rounded-[var(--wp-radius-lg)] border border-slate-200 bg-white shadow-sm overflow-hidden">
        {notes.length === 0 ? (
          <EmptyState
            icon="📝"
            title="Zatím žádné zápisky"
            description="Zápisky ze schůzek s tímto klientem se zobrazí zde."
            actionLabel="Nový zápisek"
            onAction={() => window.location.assign(`/portal/notes?contactId=${contactId}`)}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {notes.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-2 px-4 py-4 hover:bg-slate-50">
                <Link
                  href={`/portal/notes?note=${n.id}`}
                  className="flex flex-wrap items-center gap-3 min-h-[44px] flex-1 min-w-0"
                >
                  <span className="text-sm font-medium text-slate-800">
                    {new Date(n.meetingAt).toLocaleDateString("cs-CZ", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  {n.domain && (
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {n.domain}
                    </span>
                  )}
                  <span className="text-xs text-slate-400">
                    {new Date(n.createdAt).toLocaleString("cs-CZ")}
                  </span>
                </Link>
                <Link
                  href={`/portal/contacts/${contactId}?meetingNoteId=${n.id}#briefing`}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50 border border-indigo-200"
                >
                  Vygenerovat follow-up
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
