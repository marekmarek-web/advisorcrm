"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, CheckCircle2, LayoutList } from "lucide-react";
import { getPipelineByContact } from "@/app/actions/pipeline";
import { useContactTab } from "./ContactTabLayout";
import type { StageWithOpportunities } from "@/app/actions/pipeline";
import { PipelineBoard } from "@/app/dashboard/pipeline/PipelineBoard";
import { PipelineBoardSkeleton } from "@/app/dashboard/pipeline/PipelineBoardSkeleton";
import { createActionButtonClassName } from "@/lib/ui/button-presets";

type ContactOption = { id: string; firstName: string; lastName: string };

const btnPrimaryClass = `${createActionButtonClassName} px-6 py-2.5 rounded-[var(--wp-radius-sm)] normal-case tracking-normal shadow-lg shadow-indigo-900/20 disabled:hover:translate-y-0`;

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
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
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
        if (!cancelled) {
          setLoading(false);
          const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
          if (process.env.NODE_ENV !== "production") {
            console.info("[perf] contact-pipeline-load-ms", Math.round(t1 - t0), { contactId });
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [contactId, retry]);

  const contactsForCreate: ContactOption[] = [
    { id: contactId, firstName: contactFirstName ?? "", lastName: contactLastName ?? "" },
  ];

  const firstStageId = stages[0]?.id ?? null;
  const totalOpportunities = stages.reduce((sum, s) => sum + s.opportunities.length, 0);
  const isEmpty = totalOpportunities === 0 && stages.length > 0;
  const noStages = stages.length === 0;

  const header = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-4 py-4 shrink-0">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--wp-text)" }}>
          Obchody
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--wp-text-muted)" }}>
          Případy a obchody navázané na tohoto klienta.
        </p>
      </div>
      {!noStages && (
        <button
          type="button"
          onClick={() => firstStageId && setOpenCreateStageId(firstStageId)}
          disabled={!firstStageId || loading}
          className={btnPrimaryClass}
        >
          <Plus size={18} /> Nový obchod
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      {header}
      <div className="flex-1 min-h-0 px-4 pb-4 w-full">
        {loading && <PipelineBoardSkeleton />}

        {!loading && loadError && (
          <div className="rounded-[var(--wp-radius-sm)] border-2 border-slate-200 bg-slate-50/50 p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)]">
            <p className="text-slate-700 text-sm mb-4">{loadError}</p>
            <button type="button" onClick={() => setRetry((r) => r + 1)} className={btnPrimaryClass}>
              Zkusit znovu
            </button>
          </div>
        )}

        {!loading && !loadError && noStages && (
          <div className="flex flex-col items-center justify-center rounded-[var(--wp-radius-sm)] border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 min-h-[200px]">
            <LayoutList size={40} className="text-slate-300 mb-3" />
            <h2 className="text-lg font-bold text-slate-800 mb-1">Pipeline není nastavená</h2>
            <p className="text-sm text-slate-500 text-center mb-4">
              Nastavte stupně pipeline v modulu Obchody.
            </p>
            <Link href="/portal/pipeline" className={`${btnPrimaryClass} no-underline`}>
              Přejít do Obchodů
            </Link>
          </div>
        )}

        {!loading && !loadError && !noStages && isEmpty && !openCreateStageId && (
          <div className="flex flex-col items-center justify-center rounded-[var(--wp-radius-sm)] border-2 border-dashed border-slate-200 bg-white/50 p-8 min-h-[200px]">
            <CheckCircle2 size={40} className="text-slate-300 mb-3" />
            <h2 className="text-lg font-bold text-slate-800 mb-1">Tento klient zatím nemá žádný obchod</h2>
            <p className="text-sm text-slate-500 text-center mb-4">
              Vytvořte první obchod a přiřaďte ho do příslušného stupně.
            </p>
            <button
              type="button"
              onClick={() => firstStageId && setOpenCreateStageId(firstStageId)}
              disabled={!firstStageId}
              className={btnPrimaryClass}
            >
              <Plus size={18} /> Vytvořit první obchod
            </button>
            <p className="text-xs text-slate-400 mt-4 text-center">
              Později zde budete moci založit obchod z AI příležitosti.
            </p>
          </div>
        )}

        {!loading && !loadError && !noStages && (!isEmpty || openCreateStageId) && (
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
