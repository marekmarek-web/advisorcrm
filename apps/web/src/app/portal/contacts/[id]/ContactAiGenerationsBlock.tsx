"use client";

import { useState } from "react";
import Link from "next/link";
import { Zap, ArrowUpRight, Loader2, RefreshCw } from "lucide-react";
import {
  generateClientSummaryAction,
  generateClientOpportunitiesAction,
  generateNextBestActionAction,
  getLatestClientGenerations,
  type ClientGenerationItem,
} from "@/app/actions/ai-generations";

type InitialData = {
  clientSummary: ClientGenerationItem | null;
  clientOpportunities: ClientGenerationItem | null;
  nextBestAction: ClientGenerationItem | null;
};

type Props = {
  contactId: string;
  initialGenerations: InitialData;
};

const SECTION_CONFIG = {
  clientSummary: {
    title: "AI shrnutí klienta",
    action: generateClientSummaryAction,
    key: "clientSummary" as const,
  },
  clientOpportunities: {
    title: "AI příležitosti",
    action: generateClientOpportunitiesAction,
    key: "clientOpportunities" as const,
  },
  nextBestAction: {
    title: "Next best action",
    action: generateNextBestActionAction,
    key: "nextBestAction" as const,
  },
} as const;

function AiSection({
  contactId,
  title,
  promptKey,
  initialItem,
  onUpdate,
}: {
  contactId: string;
  title: string;
  promptKey: keyof InitialData;
  initialItem: ClientGenerationItem | null;
  onUpdate: (key: keyof InitialData, item: ClientGenerationItem | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<ClientGenerationItem | null>(initialItem);

  const config = SECTION_CONFIG[promptKey];
  const generate = config.action;

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const result =
        promptKey === "clientSummary"
          ? await generateClientSummaryAction(contactId)
          : promptKey === "clientOpportunities"
            ? await generateClientOpportunitiesAction(contactId)
            : await generateNextBestActionAction(contactId);
      if (result.ok) {
        const latest = await getLatestClientGenerations(contactId);
        const item = latest[promptKey];
        setOutput(item);
        onUpdate(promptKey, item);
      } else {
        setError(result.error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <RefreshCw size={14} aria-hidden />
          )}
          {loading ? "Generuji…" : output ? "Přegenerovat" : "Vygenerovat"}
        </button>
      </div>
      {error && (
        <p className="text-xs text-rose-600 mb-2" role="alert">
          {error}
        </p>
      )}
      {output?.outputText ? (
        <div className="text-sm text-slate-700 whitespace-pre-wrap border-t border-slate-200 pt-2 mt-2">
          {output.outputText}
        </div>
      ) : !loading && (
        <p className="text-xs text-slate-500 italic">
          Klikněte na Vygenerovat pro vytvoření výstupu.
        </p>
      )}
    </section>
  );
}

export function ContactAiGenerationsBlock({ contactId, initialGenerations }: Props) {
  const [generations, setGenerations] = useState<InitialData>(initialGenerations);

  const handleUpdate = (key: keyof InitialData, item: ClientGenerationItem | null) => {
    setGenerations((prev) => ({ ...prev, [key]: item }));
  };

  return (
    <div
      className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden p-6"
      style={{ borderRadius: "var(--wp-radius-lg, 24px)" }}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-100">
          <Zap size={16} className="text-indigo-600" aria-hidden />
        </div>
        <h2 className="text-lg font-bold text-slate-900">AI analýza</h2>
      </div>
      <p className="text-sm text-slate-600 mb-4">
        Shrnutí klienta, příležitosti a doporučený další krok na základě dat v CRM.
      </p>
      <div className="space-y-4">
        <AiSection
          contactId={contactId}
          title={SECTION_CONFIG.clientSummary.title}
          promptKey="clientSummary"
          initialItem={generations.clientSummary}
          onUpdate={handleUpdate}
        />
        <AiSection
          contactId={contactId}
          title={SECTION_CONFIG.clientOpportunities.title}
          promptKey="clientOpportunities"
          initialItem={generations.clientOpportunities}
          onUpdate={handleUpdate}
        />
        <AiSection
          contactId={contactId}
          title={SECTION_CONFIG.nextBestAction.title}
          promptKey="nextBestAction"
          initialItem={generations.nextBestAction}
          onUpdate={handleUpdate}
        />
      </div>
      <div className="mt-4 pt-4 border-t border-slate-100">
        <Link
          href="#obchody"
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Založit příležitost <ArrowUpRight size={14} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
