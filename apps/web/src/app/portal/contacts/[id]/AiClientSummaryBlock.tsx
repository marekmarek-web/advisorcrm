"use client";

import { useState } from "react";
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import {
  generateClientSummaryAction,
  getLatestClientGenerations,
  type ClientGenerationItem,
} from "@/app/actions/ai-generations";
import { AdvisorAiOutputNotice } from "@/app/components/ai/AdvisorAiOutputNotice";

export function AiClientSummaryBlock({
  contactId,
  initialSummary,
}: {
  contactId: string;
  initialSummary: ClientGenerationItem | null;
}) {
  const [output, setOutput] = useState<ClientGenerationItem | null>(initialSummary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const result = await generateClientSummaryAction(contactId);
      if (result.ok) {
        const latest = await getLatestClientGenerations(contactId);
        setOutput(latest.clientSummary);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Nepodařilo se vygenerovat shrnutí.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[color:var(--wp-surface-card)] rounded-[24px] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
      <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-[color:var(--wp-surface-card-border)]/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-100 shrink-0">
            <Sparkles size={16} className="text-indigo-600" aria-hidden />
          </div>
          <h2 className="text-base font-black text-[color:var(--wp-text)]">AI shrnutí klienta</h2>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-colors disabled:opacity-50 min-h-[36px]"
        >
          {loading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <RefreshCw size={13} />
          )}
          {loading ? "Generuji…" : output ? "Přegenerovat" : "Vygenerovat"}
        </button>
      </div>
      <div className="p-5 sm:p-6">
        <AdvisorAiOutputNotice className="mb-3" variant="compact" />
        {error && (
          <p className="text-xs text-rose-600 mb-3" role="alert">
            {error}
          </p>
        )}
        {output?.outputText ? (
          <div className="text-sm text-[color:var(--wp-text-secondary)] leading-relaxed whitespace-pre-wrap">
            {output.outputText}
          </div>
        ) : !loading ? (
          <p className="text-xs text-[color:var(--wp-text-tertiary)] italic">
            Klikněte na Vygenerovat pro vytvoření informativního interního souhrnu klienta — co má sjednáno, co platí, kdo k němu patří.
          </p>
        ) : null}
      </div>
    </div>
  );
}
