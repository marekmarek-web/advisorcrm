"use client";

import { useState, useEffect } from "react";
import { Plus, CheckCircle2 } from "lucide-react";
import { getPipelineByContact } from "@/app/actions/pipeline";
import { useContactTab } from "./ContactTabLayout";
import type { StageWithOpportunities } from "@/app/actions/pipeline";
import { PipelineBoard } from "@/app/dashboard/pipeline/PipelineBoard";
import { PipelineBoardSkeleton } from "@/app/dashboard/pipeline/PipelineBoardSkeleton";

type ContactOption = { id: string; firstName: string; lastName: string };

export function ContactOpportunityBoard({
  contactId,
  contactFirstName,
  contactLastName,
}: {
  contactId: string;
  contactFirstName?: string;
  contactLastName?: string;
}) {
  const [stages, setStages] = useState<StageWithOpportunities[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [openCreateStageId, setOpenCreateStageId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getPipelineByContact(contactId)
      .then((data) => {
        if (!cancelled) setStages(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setStages([]);
          setLoadError(err instanceof Error ? err.message : "Nepodařilo se načíst obchody.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId, retry]);

  const contactsForCreate: ContactOption[] = [
    { id: contactId, firstName: contactFirstName ?? "", lastName: contactLastName ?? "" },
  ];

  if (loading) {
    return <PipelineBoardSkeleton />;
  }

  if (loadError) {
    return (
      <div className="rounded-[var(--wp-radius-sm)] border border-slate-200 bg-slate-50/50 p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)]">
        <p className="text-slate-700 text-sm mb-4">{loadError}</p>
        <button
          type="button"
          onClick={() => setRetry((r) => r + 1)}
          className="px-6 py-2.5 rounded-[var(--wp-radius-sm)] font-bold bg-[#1a1c2e] text-white hover:bg-[#2a2d4a] shadow-lg shadow-indigo-900/20 transition-all min-h-[44px]"
        >
          Zkusit znovu
        </button>
      </div>
    );
  }

  const totalOpportunities = stages.reduce((sum, s) => sum + s.opportunities.length, 0);
  const isEmpty = totalOpportunities === 0 && stages.length > 0;
  const firstStageId = stages[0]?.id ?? null;

  return (
    <div className="flex flex-col gap-6 w-full">
      {isEmpty && (
        <div className="flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-200 rounded-[var(--wp-radius-sm)] bg-white/50 p-8 min-h-[160px]">
          <CheckCircle2 size={40} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium text-center text-slate-600">Klient zatím nemá žádný obchod</p>
          <p className="text-xs text-center mt-1 text-slate-400">Vytvořte první obchod a přiřaďte ho do příslušného stupně.</p>
          <button
            type="button"
            onClick={() => firstStageId && setOpenCreateStageId(firstStageId)}
            className="mt-4 flex items-center justify-center gap-2 px-5 py-2.5 rounded-[var(--wp-radius-sm)] font-bold bg-[#1a1c2e] text-white hover:bg-[#2a2d4a] shadow-lg shadow-indigo-900/20 transition-all min-h-[44px] disabled:opacity-70 disabled:pointer-events-none"
            disabled={!firstStageId}
          >
            <Plus size={18} /> Vytvořit první obchod
          </button>
        </div>
      )}
      {stages.length === 0 ? (
        <p className="text-sm text-slate-500 py-4">Žádné stupně pipeline. Nastavte pipeline v globálních Obchodech.</p>
      ) : (
        <PipelineBoard
          stages={stages}
          contacts={contactsForCreate}
          contactContext={{ contactId }}
          onMutationComplete={() => getPipelineByContact(contactId).then(setStages)}
          initialOpenCreateStageId={openCreateStageId}
          onOpenCreateConsumed={() => setOpenCreateStageId(null)}
        />
      )}
    </div>
  );
}

/** Lazy wrapper: mountuje board až při aktivní záložce Obchody. */
export function ContactOpportunityBoardLazy({
  contactId,
  contactFirstName,
  contactLastName,
}: {
  contactId: string;
  contactFirstName?: string;
  contactLastName?: string;
}) {
  const activeTabId = useContactTab();
  if (activeTabId !== "obchody") return null;
  return (
    <ContactOpportunityBoard
      contactId={contactId}
      contactFirstName={contactFirstName}
      contactLastName={contactLastName}
    />
  );
}
