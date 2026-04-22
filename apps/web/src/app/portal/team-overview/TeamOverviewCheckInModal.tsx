"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { createTeamEvent } from "@/app/actions/team-events";

export function TeamOverviewCheckInModal({
  open,
  memberName,
  memberUserId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  memberName: string;
  memberUserId: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [review, setReview] = useState("");
  const [actions, setActions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const save = () => {
    if (!memberUserId) return;
    setError(null);
    const start = new Date();
    start.setHours(start.getHours() + 1, 0, 0, 0);
    const notes = [`Hodnocení období:\n${review.trim()}`, `Akční kroky:\n${actions.trim()}`]
      .filter(Boolean)
      .join("\n\n");
    startTransition(async () => {
      const id = await createTeamEvent(
        {
          title: `Check-in: ${memberName}`,
          eventType: "schuzka",
          startAt: start.toISOString(),
          notes: notes || undefined,
        },
        [memberUserId]
      );
      if (!id) {
        setError("Uložení se nepovedlo — zkontrolujte oprávnění kalendáře týmu.");
        return;
      }
      setReview("");
      setActions("");
      onSuccess?.();
      onClose();
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && !pending && onClose()}
    >
      <div className="relative w-full max-w-xl overflow-hidden rounded-[32px] bg-white shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="absolute right-6 top-6 rounded-full bg-[color:var(--wp-surface-muted)] p-2 hover:bg-[color:var(--wp-surface-muted)] disabled:opacity-50"
          aria-label="Zavřít"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="border-b border-[color:var(--wp-surface-card-border)] p-8">
          <h2 className="text-2xl font-black text-[color:var(--wp-text)]">Záznam ze schůzky (Check-in)</h2>
          <p className="mt-1 text-sm font-medium text-[color:var(--wp-text-secondary)]">S členem: {memberName}</p>
        </div>
        <div className="space-y-6 bg-[color:var(--wp-main-scroll-bg)]/50 p-8">
          <div>
            <label className="mb-2 block text-[11px] font-extrabold uppercase tracking-widest text-[color:var(--wp-text-secondary)]">
              Hodnocení uplynulého období
            </label>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              className="min-h-[100px] w-full rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-white p-4 text-sm outline-none ring-slate-900/5 focus:ring-2"
              placeholder="Témata, výkon, signály…"
            />
          </div>
          <div>
            <label className="mb-2 block text-[11px] font-extrabold uppercase tracking-widest text-[color:var(--wp-text-secondary)]">
              Akční kroky na další období
            </label>
            <textarea
              value={actions}
              onChange={(e) => setActions(e.target.value)}
              className="min-h-[100px] w-full rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-white p-4 text-sm outline-none ring-slate-900/5 focus:ring-2"
              placeholder="Dohody, termíny…"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="button"
            onClick={save}
            disabled={pending || !memberUserId}
            className="w-full rounded-2xl bg-[#16192b] py-4 font-black uppercase tracking-widest text-white shadow-lg transition hover:bg-black disabled:opacity-50"
          >
            {pending ? "Ukládám…" : "Uložit check-in"}
          </button>
        </div>
      </div>
    </div>
  );
}
