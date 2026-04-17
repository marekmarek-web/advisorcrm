"use client";

import { ArrowLeft, BrainCircuit, Check, Loader2, X, Send } from "lucide-react";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import type { ExtractionDocument } from "@/lib/ai-review/types";

type Props = {
  doc: ExtractionDocument;
  onBack: () => void;
  onDiscard: () => void;
  onApprove: () => void | Promise<void>;
  /** Schválit kontrolu a hned propsat do Aidvisory (když je vyřešený klient). */
  onApproveAndApply?: () => void | Promise<void>;
  onReject?: () => void;
  onApply?: () => void;
  isApproving?: boolean;
  canApproveReject?: boolean;
  /** Má smysl nabídnout kombinované schválení + zápis. */
  canApproveAndApply?: boolean;
  canApply?: boolean;
  isApplied?: boolean;
  actionLoading?: string | null;
};

export function AIReviewTopBar({
  doc,
  onBack,
  onDiscard,
  onApprove,
  onApproveAndApply,
  onReject,
  onApply,
  isApproving,
  canApproveReject,
  canApproveAndApply,
  canApply,
  isApplied,
  actionLoading,
}: Props) {
  return (
    <header className="bg-[color:var(--wp-surface-card)] px-4 md:px-6 py-2 md:py-2.5 border-b border-[color:var(--wp-surface-card-border)] flex items-center justify-between shadow-sm z-20 flex-shrink-0">
      <div className="flex items-center gap-3 md:gap-6 min-w-0">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-bold text-[color:var(--wp-text-secondary)] hover:text-indigo-600 transition-colors shrink-0"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Zpět na seznam</span>
        </button>
        <div className="w-px h-5 bg-[color:var(--wp-surface-card-border)] hidden sm:block" />
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--wp-text-tertiary)] min-w-0">
          <span className="hidden md:inline">AI Extrakce</span>
          <span className="opacity-30 hidden md:inline">/</span>
          <span className="text-indigo-600 flex items-center gap-1.5 truncate">
            <BrainCircuit size={14} className="shrink-0" />
            <span className="truncate">{doc.fileName}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        {!isApplied && (
          <>
            {canApproveReject && (
              <>
                <button
                  type="button"
                  onClick={onReject}
                  disabled={!!actionLoading}
                  className="flex items-center gap-2 px-3 md:px-4 py-2.5 min-h-[44px] md:min-h-0 md:py-2.5 bg-[color:var(--wp-surface-card)] border border-rose-200 text-rose-700 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm hover:bg-rose-50 transition-all disabled:opacity-50"
                >
                  <X size={14} />
                  <span className="hidden sm:inline">Zamítnout</span>
                </button>
                {canApproveAndApply && onApproveAndApply ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void onApproveAndApply()}
                      disabled={!!actionLoading}
                      className="flex items-center gap-2 px-4 md:px-6 py-2.5 min-h-[44px] md:min-h-0 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-60"
                    >
                      {actionLoading === "approveApply" ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Send size={16} />
                      )}
                      <span className="hidden sm:inline">Schválit a propsat do Aidvisory</span>
                      <span className="sm:hidden">Schválit + propsat</span>
                    </button>
                    <button
                      type="button"
                      onClick={onApprove}
                      disabled={!!actionLoading}
                      className="flex items-center gap-2 px-3 md:px-4 py-2.5 min-h-[44px] md:min-h-0 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text)] rounded-xl text-xs font-black uppercase tracking-widest shadow-sm hover:bg-[color:var(--wp-surface-muted)] transition-all disabled:opacity-60"
                    >
                      {isApproving ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Check size={16} />
                      )}
                      <span className="hidden lg:inline">Schválit extrahované údaje</span>
                      <span className="lg:hidden">Schválit</span>
                    </button>
                  </>
                ) : (
                  <CreateActionButton
                    type="button"
                    onClick={onApprove}
                    disabled={!!actionLoading}
                    isLoading={Boolean(isApproving)}
                    icon={Check}
                    className="min-h-[44px] px-4 py-2.5 md:min-h-0 md:px-6"
                  >
                    <span className="hidden sm:inline">Schválit extrahované údaje</span>
                    <span className="sm:hidden">Schválit</span>
                  </CreateActionButton>
                )}
              </>
            )}
            {canApply && (
              <button
                type="button"
                onClick={onApply}
                disabled={!!actionLoading}
                className="flex items-center gap-2 px-4 md:px-6 py-2.5 min-h-[44px] md:min-h-0 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-60"
              >
                {actionLoading === "apply" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                <span className="hidden sm:inline">Propsat do Aidvisory</span>
                <span className="sm:hidden">Propsat</span>
              </button>
            )}
            {!canApproveReject && !canApply && (
              <button
                onClick={onDiscard}
                className="flex items-center gap-2 px-3 md:px-5 py-2 md:py-2.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-xl text-xs font-black uppercase tracking-widest shadow-sm hover:bg-[color:var(--wp-surface-muted)] transition-all"
              >
                <span className="hidden sm:inline">Zahodit</span>
                <span className="sm:hidden">×</span>
              </button>
            )}
          </>
        )}
        {isApplied && (
          <span className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-black uppercase tracking-widest border border-emerald-200">
            <Check size={16} /> Aplikováno
          </span>
        )}
      </div>
    </header>
  );
}
