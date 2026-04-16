"use client";

import React, { useEffect, useMemo, useState } from "react";
import { X, UserRoundSearch, Check } from "lucide-react";
import type { ClientMatchCandidate } from "@/lib/ai-review/types";
import { ContactPicker, type ContactPickerValue } from "@/app/components/upload/ContactPicker";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Volá se po potvrzení — typicky `selectMatchedClient` + obnovení dokumentu */
  onConfirm: (clientId: string) => Promise<void>;
  candidates: ClientMatchCandidate[];
  title?: string;
};

function scoreLabel(score: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, score)) * 100);
  return `${pct} % shoda`;
}

export function ReviewAttachClientDialog({ open, onClose, onConfirm, candidates, title }: Props) {
  const [selected, setSelected] = useState<ContactPickerValue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...candidates].sort((a, b) => b.score - a.score),
    [candidates]
  );

  useEffect(() => {
    if (!open) {
      setError(null);
      setBusy(false);
      return;
    }
    const top = sorted[0];
    if (!top) {
      setSelected(null);
      return;
    }
    const strong = sorted.length === 1 || top.score >= 0.85;
    if (strong) {
      setSelected({
        id: top.clientId,
        name: (top.displayName ?? "").trim() || "Navržený klient",
      });
    } else {
      setSelected(null);
    }
  }, [open, sorted]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (!selected?.id) {
      setError("Vyberte klienta ze seznamu nebo z navržených shod.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onConfirm(selected.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Připojení klienta selhalo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-attach-client-title"
    >
      <div className="absolute inset-0" aria-hidden onClick={() => !busy && onClose()} />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-xl">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[color:var(--wp-surface-card-border)]">
          <div className="min-w-0">
            <h2
              id="review-attach-client-title"
              className="text-base font-black text-[color:var(--wp-text)] tracking-tight flex items-center gap-2"
            >
              <UserRoundSearch className="shrink-0 text-indigo-500" size={20} />
              {title ?? "Připojit k existujícímu klientovi"}
            </h2>
            <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1 leading-relaxed">
              Zůstáváte v kontextu revize dokumentu. Po potvrzení se klient uloží k této revizi.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => !busy && onClose()}
            className="shrink-0 rounded-xl p-2 text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-muted)] disabled:opacity-50"
            aria-label="Zavřít"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Vyhledávání — vždy jako první */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">
              Vyhledat a vybrat klienta
            </p>
            <ContactPicker value={selected} onChange={setSelected} label="Klient z CRM" />
          </div>

          {sorted.length > 0 ? (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">
                Navržené shody z párování
              </p>
              <ul className="space-y-2">
                {sorted.map((c) => {
                  const active = selected?.id === c.clientId;
                  const name = (c.displayName ?? "").trim() || "Klient bez jména";
                  return (
                    <li key={c.clientId}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelected({
                            id: c.clientId,
                            name,
                          })
                        }
                        className={`w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          active
                            ? "border-indigo-400 bg-indigo-50/80"
                            : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/40 hover:bg-[color:var(--wp-surface-muted)]"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">{name}</p>
                          <p className="text-[11px] text-[color:var(--wp-text-secondary)]">{scoreLabel(c.score)}</p>
                        </div>
                        {active ? <Check className="text-indigo-600 shrink-0" size={18} /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {error ? (
            <p className="text-sm font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => !busy && onClose()}
              className="min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-4 text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] disabled:opacity-50"
            >
              Zrušit
            </button>
            <button
              type="button"
              disabled={busy || !selected?.id}
              onClick={() => void handleConfirm()}
              className="min-h-[44px] rounded-xl bg-indigo-600 px-5 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Ukládám…" : "Potvrdit výběr"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
