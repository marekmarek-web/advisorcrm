"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getPipelineByContact } from "@/app/actions/pipeline";
import { updateOpportunityStage } from "@/app/actions/pipeline";
import type { StageWithOpportunities, OpportunityCard } from "@/app/actions/pipeline";

const STAGE_COLORS = ["#00c875", "#fdab3d", "#ff642e", "#579bfc", "#a25ddc", "#037f4c", "#e2445c"];

function getStageColor(index: number): string {
  return STAGE_COLORS[index % STAGE_COLORS.length];
}

export function ContactOpportunityBoard({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [stages, setStages] = useState<StageWithOpportunities[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getPipelineByContact(contactId)
      .then((data) => {
        if (!cancelled) setStages(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [contactId]);

  async function moveTo(opportunityId: string, stageId: string) {
    await updateOpportunityStage(opportunityId, stageId);
    router.refresh();
    const data = await getPipelineByContact(contactId);
    setStages(data);
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Načítám obchody…
      </div>
    );
  }

  const totalOpps = stages.reduce((s, st) => s + st.opportunities.length, 0);
  if (totalOpps === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-slate-500 text-sm">U tohoto klienta zatím nejsou žádné obchody.</p>
        <Link
          href="/portal/pipeline"
          className="inline-block mt-3 text-sm font-medium text-blue-600 hover:underline"
        >
          Přidat obchod na obchodní nástěnce →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-slate-600 text-sm">
        Obchodní nástěnka pro tohoto klienta ({totalOpps} {totalOpps === 1 ? "obchod" : totalOpps < 5 ? "obchody" : "obchodů"}).
      </p>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage, stageIdx) => {
          const stageColor = getStageColor(stageIdx);
          return (
            <div
              key={stage.id}
              className="min-w-[240px] rounded-xl bg-white border border-slate-200 flex-shrink-0 shadow-sm overflow-hidden"
            >
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{ backgroundColor: stageColor }}
              >
                <h3 className="font-semibold text-white text-sm uppercase tracking-wide">
                  {stage.name}{" "}
                  <span className="font-normal opacity-80">({stage.opportunities.length})</span>
                </h3>
              </div>
              <div className="p-2 space-y-2">
                {stage.opportunities.map((opp) => (
                  <OpportunityCardBlock
                    key={opp.id}
                    opp={opp}
                    stages={stages}
                    currentStageId={stage.id}
                    onMoveTo={moveTo}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OpportunityCardBlock({
  opp,
  stages,
  currentStageId,
  onMoveTo,
}: {
  opp: OpportunityCard;
  stages: StageWithOpportunities[];
  currentStageId: string;
  onMoveTo: (opportunityId: string, stageId: string) => void;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 border border-slate-100 hover:border-blue-200 transition-all group">
      <Link
        href={`/portal/pipeline/${opp.id}`}
        className="block"
      >
        <p className="font-semibold text-slate-800 text-sm hover:text-blue-600">{opp.title}</p>
        {opp.expectedValue && (
          <p className="text-sm font-medium text-slate-700 mt-1">
            {Number(opp.expectedValue).toLocaleString("cs-CZ")} Kč
          </p>
        )}
      </Link>
      <div className="mt-2 flex flex-wrap gap-1">
        {stages
          .filter((s) => s.id !== currentStageId)
          .map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onMoveTo(opp.id, s.id)}
              className="text-[10px] px-1.5 py-0.5 rounded-lg border text-slate-500 border-slate-200 hover:text-blue-600 hover:border-blue-300"
            >
              → {s.name}
            </button>
          ))}
      </div>
    </div>
  );
}
