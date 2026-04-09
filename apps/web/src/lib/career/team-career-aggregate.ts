/**
 * Agregace kariérního stavu pro blok „Růst týmu“ na Team Overview (čisté funkce).
 */

import { formatCareerTrackLabel } from "./evaluate-career-progress";
import type { CareerTrackId } from "./types";
import type { CareerEvaluationViewModel } from "./career-evaluation-vm";

export type TeamCareerAttentionMember = {
  userId: string;
  displayName: string | null;
  email: string | null;
  score: number;
  reason: string;
  managerProgressLabel: string;
};

export type TeamCareerSummaryBlock = {
  /** Počty podle větve (pouze rozumně známé tracky) */
  byTrack: { trackId: CareerTrackId; label: string; count: number }[];
  /** Počty podle manažerského bucketu */
  byManagerLabel: Record<string, number>;
  /** Vyžaduje doplnění + bez dostatku dat */
  needsAttentionDataCount: number;
  /** manual_required nebo partial completeness */
  manualOrPartialCount: number;
  /** První krok ve větvi + zároveň v adaptačním okně (newcomers list) */
  startersInAdaptationCount: number;
  /** 3–5 členů s nejvyšší prioritou pro 1:1 z pohledu kariéry */
  topAttention: TeamCareerAttentionMember[];
};

function attentionScore(vm: CareerEvaluationViewModel): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  if (vm.progressEvaluation === "data_missing" || vm.progressEvaluation === "not_configured") {
    score += 10;
    reasons.push("chybí kariérní nastavení nebo data");
  }
  if (vm.progressEvaluation === "blocked" || vm.progressEvaluation === "unknown") {
    score += 8;
    reasons.push("konfigurace nebo údaje k ověření");
  }
  if (vm.evaluationCompleteness === "low_confidence") {
    score += 5;
    reasons.push("nízká jistota evaluace");
  }
  if (vm.evaluationCompleteness === "manual_required") {
    score += 2;
    reasons.push("nutné ruční ověření řádu");
  }

  return { score, reason: reasons.join(" · ") || "obecný přehled" };
}

export function buildTeamCareerSummaryBlock(
  rows: {
    userId: string;
    displayName: string | null;
    email: string | null;
    careerEvaluation: CareerEvaluationViewModel;
  }[],
  newcomerUserIds: Set<string>
): TeamCareerSummaryBlock {
  const trackCounts = new Map<CareerTrackId, number>();
  const managerLabelCounts: Record<string, number> = {};

  let needsAttentionDataCount = 0;
  let manualOrPartialCount = 0;
  let startersInAdaptationCount = 0;

  for (const row of rows) {
    const vm = row.careerEvaluation;
    const t = vm.careerTrackId;
    if (t !== "not_set" && t !== "unknown") {
      trackCounts.set(t, (trackCounts.get(t) ?? 0) + 1);
    }

    const ml = vm.managerProgressLabel;
    managerLabelCounts[ml] = (managerLabelCounts[ml] ?? 0) + 1;

    if (ml === "Vyžaduje doplnění" || ml === "Bez dostatku dat") {
      needsAttentionDataCount += 1;
    }
    if (vm.evaluationCompleteness === "manual_required" || vm.evaluationCompleteness === "partial") {
      manualOrPartialCount += 1;
    }

    if (
      newcomerUserIds.has(row.userId) &&
      vm.progressionOrder !== null &&
      vm.progressionOrder <= 0
    ) {
      startersInAdaptationCount += 1;
    }
  }

  const byTrack: { trackId: CareerTrackId; label: string; count: number }[] = Array.from(trackCounts.entries())
    .map(([trackId, count]) => ({
      trackId,
      label: formatCareerTrackLabel(trackId),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const scored = rows.map((row) => {
    const { score, reason } = attentionScore(row.careerEvaluation);
    return {
      userId: row.userId,
      displayName: row.displayName,
      email: row.email,
      score,
      reason,
      managerProgressLabel: row.careerEvaluation.managerProgressLabel,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const topAttention = scored.filter((s) => s.score >= 4).slice(0, 5);

  return {
    byTrack,
    byManagerLabel: managerLabelCounts,
    needsAttentionDataCount,
    manualOrPartialCount,
    startersInAdaptationCount,
    topAttention,
  };
}
