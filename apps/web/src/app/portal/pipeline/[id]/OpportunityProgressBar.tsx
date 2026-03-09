"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOpportunityStage, closeOpportunity } from "@/app/actions/pipeline";
import type { OpportunityStageInfo } from "@/app/actions/pipeline";

export function OpportunityProgressBar({
  opportunityId,
  stages,
  currentStageId,
  closedAt,
}: {
  opportunityId: string;
  stages: OpportunityStageInfo[];
  currentStageId: string;
  closedAt: Date | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleStageChange(stageId: string) {
    if (closedAt) return;
    startTransition(async () => {
      await updateOpportunityStage(opportunityId, stageId);
      router.refresh();
    });
  }

  function handleClose(won: boolean) {
    startTransition(async () => {
      await closeOpportunity(opportunityId, won);
      router.refresh();
    });
  }

  if (closedAt) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-sm text-slate-500">
          Obchod uzavřen {new Date(closedAt).toLocaleDateString("cs-CZ")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0 flex-wrap">
      {stages.map((stage) => {
        const isActive = stage.id === currentStageId;
        return (
          <button
            key={stage.id}
            type="button"
            onClick={() => handleStageChange(stage.id)}
            disabled={pending}
            className={`px-3 py-1.5 text-xs font-medium rounded-l first:rounded-l last:rounded-r border border-slate-200 transition-colors ${
              isActive
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-600 hover:bg-slate-50 border-slate-200"
            }`}
            title={stage.name}
          >
            {stage.name}
          </button>
        );
      })}
      <span className="inline-flex ml-1 gap-1">
        <button
          type="button"
          onClick={() => handleClose(true)}
          disabled={pending}
          className="px-2 py-1.5 text-xs font-medium rounded bg-green-100 text-green-800 hover:bg-green-200"
        >
          Výhra
        </button>
        <button
          type="button"
          onClick={() => handleClose(false)}
          disabled={pending}
          className="px-2 py-1.5 text-xs font-medium rounded bg-red-100 text-red-800 hover:bg-red-200"
        >
          Prohra
        </button>
      </span>
    </div>
  );
}
