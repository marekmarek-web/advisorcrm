"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, MessageSquarePlus, X } from "lucide-react";
import {
  declineAdvisorProposal,
  respondInterestedToAdvisorProposal,
} from "@/app/actions/advisor-proposals-client";

/**
 * Akce klienta na detailu návrhu:
 * - „Chci to probrat s poradcem" → vytvoří standardní požadavek v `/client/requests`
 *   a notifikuje poradce (přes `createClientPortalRequest`).
 * - „Teď mě to nezajímá" → jen označí návrh jako odmítnutý, kdykoli lze vrátit.
 *
 * Compliance: tato reakce klienta je manuální, žádná automatická AI akce.
 */
export function ClientProposalActions({
  proposalId,
  alreadyDeclined,
}: {
  proposalId: string;
  alreadyDeclined: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submitInterested() {
    setError(null);
    startTransition(async () => {
      const res = await respondInterestedToAdvisorProposal(proposalId, note || null);
      if (!res.success) {
        setError(res.error || "Nepodařilo se odeslat reakci.");
        return;
      }
      router.push(`/client/requests`);
      router.refresh();
    });
  }

  function submitDecline() {
    setError(null);
    startTransition(async () => {
      const res = await declineAdvisorProposal(proposalId);
      if (!res.success) {
        setError(res.error || "Nepodařilo se uložit odmítnutí.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {!showNote ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setShowNote(true)}
            disabled={pending}
            className="min-h-[44px] inline-flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors shadow-lg shadow-emerald-500/20"
          >
            <MessageSquarePlus size={16} />
            Chci to probrat s poradcem
          </button>

          {!alreadyDeclined && (
            <button
              type="button"
              onClick={submitDecline}
              disabled={pending}
              className="min-h-[44px] inline-flex items-center gap-2 px-5 py-3 bg-white hover:bg-[color:var(--wp-main-scroll-bg)] disabled:opacity-60 text-[color:var(--wp-text)] rounded-xl text-sm font-bold border border-[color:var(--wp-surface-card-border)]"
            >
              <X size={14} />
              Teď mě to nezajímá
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-sm font-bold text-[color:var(--wp-text)]">
            Doplňte případně poznámku pro poradce (nepovinné)
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Např. preferovaný termín volání, doplňující dotaz…"
            rows={3}
            className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submitInterested}
              disabled={pending}
              className="min-h-[44px] inline-flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors shadow-lg shadow-emerald-500/20"
            >
              <CheckCircle2 size={16} />
              {pending ? "Odesílám…" : "Odeslat poradci"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNote(false);
                setNote("");
              }}
              disabled={pending}
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-3 bg-white text-[color:var(--wp-text)] rounded-xl text-sm font-bold border border-[color:var(--wp-surface-card-border)]"
            >
              Zrušit
            </button>
          </div>
          <p className="text-[11px] text-[color:var(--wp-text-secondary)] leading-relaxed">
            Vytvoří se standardní požadavek v sekci „Požadavky" a poradce obdrží notifikaci.
          </p>
        </div>
      )}
    </div>
  );
}
