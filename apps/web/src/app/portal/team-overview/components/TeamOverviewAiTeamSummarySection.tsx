"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import type { TeamMemberInfo } from "@/app/actions/team-overview";
import type { AiFeedbackVerdict, AiFeedbackActionTaken } from "@/app/actions/ai-feedback";
import type { AiActionType } from "@/lib/ai/actions/action-suggestions";
import { AdvisorAiOutputNotice } from "@/app/components/ai/AdvisorAiOutputNotice";
import { TeamSummaryFeedback, TeamSummaryFollowUp } from "./TeamOverviewAiFeedbackBlocks";

export function TeamOverviewAiTeamSummarySection({
  aiLoading,
  aiError,
  aiSummary,
  aiGenerationId,
  aiFeedbackSubmitted,
  aiFeedbackSaving,
  teamActionSaving,
  teamActionError,
  canCreateAiTeamFollowUp,
  members,
  onLoadLatest,
  onGenerate,
  onSubmitFeedback,
  onCreateFollowUp,
  /** Nižší vizuální váha vedle hlavních bloků first foldu. */
  compact = false,
}: {
  aiLoading: boolean;
  aiError: string | null;
  aiSummary: string | null;
  aiGenerationId: string | null;
  aiFeedbackSubmitted: boolean;
  aiFeedbackSaving: boolean;
  teamActionSaving: boolean;
  teamActionError: string | null;
  canCreateAiTeamFollowUp: boolean;
  members: TeamMemberInfo[];
  onLoadLatest: () => void;
  onGenerate: () => void;
  onSubmitFeedback: (verdict: AiFeedbackVerdict, actionTaken: AiFeedbackActionTaken) => void;
  onCreateFollowUp: (actionType: AiActionType, title: string, memberId: string | null, dueAt?: string) => void;
  compact?: boolean;
}) {
  return (
    <section className={compact ? "mb-0" : "mb-8"}>
      <div
        className={`border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] ${
          compact ? "rounded-lg p-2.5 shadow-none" : "rounded-2xl p-5 shadow-sm"
        }`}
      >
        <div className={`flex flex-wrap items-center justify-between gap-2 ${compact ? "mb-1.5" : "mb-2"}`}>
          <div>
            <h2
              className={`font-bold text-[color:var(--wp-text)] flex items-center gap-2 ${
                compact ? "text-sm" : "text-lg"
              }`}
            >
              <Sparkles className={compact ? "h-4 w-4 text-[color:var(--wp-text-tertiary)]" : "w-5 h-5 text-violet-500"} />
              Shrnutí týmu (AI)
            </h2>
            {!compact ? (
              <>
                <p className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">
                  Volitelný textový podklad z metrik — nenahrazuje vlastní úsudek ani komunikaci s týmem.
                </p>
                <p className="mt-1.5 text-[11px] leading-snug text-[color:var(--wp-text-tertiary)]">
                  Uložené shrnutí nemusí odpovídat aktuálnímu rozsahu a období — po přepnutí v hlavičce znovu vygenerujte.
                </p>
              </>
            ) : (
              <p className="mt-0.5 text-[11px] text-[color:var(--wp-text-tertiary)]">
                Volitelný podklad — po změně rozsahu znovu vygenerujte.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onLoadLatest}
              disabled={aiLoading}
              className={
                compact
                  ? "inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-1.5 text-xs font-medium text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] disabled:opacity-60"
                  : "inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 py-2 text-sm font-medium text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] disabled:opacity-60"
              }
            >
              {aiLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
              Načíst uložené
            </button>
            <button
              type="button"
              onClick={onGenerate}
              disabled={aiLoading}
              className={
                compact
                  ? "inline-flex min-h-[36px] items-center gap-2 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                  : "inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
              }
            >
              {aiLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
              {aiSummary ? "Regenerovat" : "Generovat shrnutí"}
            </button>
          </div>
        </div>
        <AdvisorAiOutputNotice variant="compact" className={compact ? "mb-2" : "mb-3"} />
        {aiError && (
          <p className="mb-3 text-sm text-rose-600" role="alert">
            {aiError}
          </p>
        )}
        {aiSummary ? (
          <>
            <p className="text-[color:var(--wp-text-secondary)] whitespace-pre-wrap">{aiSummary}</p>
            {aiGenerationId && !aiFeedbackSubmitted && (
              <TeamSummaryFeedback onSubmit={onSubmitFeedback} saving={aiFeedbackSaving} disabled={aiFeedbackSaving} />
            )}
            {aiFeedbackSubmitted && <p className="mt-3 text-sm text-emerald-600">Zpětná vazba byla odeslána.</p>}
            {aiGenerationId && canCreateAiTeamFollowUp ? (
              <TeamSummaryFollowUp members={members} onCreate={onCreateFollowUp} saving={teamActionSaving} error={teamActionError} />
            ) : aiGenerationId && !canCreateAiTeamFollowUp ? (
              <p className="mt-4 pt-4 border-t border-[color:var(--wp-surface-card-border)] text-xs text-[color:var(--wp-text-tertiary)]">
                Vytváření follow-up úkolů a schůzek z AI zde není pro vaši roli k dispozici.
              </p>
            ) : null}
          </>
        ) : !aiLoading ? (
          <p className="text-[color:var(--wp-text-secondary)] text-sm">
            Načtěte uložené shrnutí nebo klikněte na „Generovat shrnutí“ — vznikne informativní manažerský podklad z metrik a upozornění, nikoli rada vůči klientům.
          </p>
        ) : null}
      </div>
    </section>
  );
}
