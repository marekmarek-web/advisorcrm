/**
 * Kanonický view-model kariérní evaluace — jeden výstup pro Team Overview i detail člena.
 */

import {
  evaluateCareerProgress,
  careerListHintShort,
  formatCareerSummaryLine,
} from "./evaluate-career-progress";
import type { CareerEvaluationContext, CareerEvaluationResult } from "./types";

export type CareerEvaluationViewModel = CareerEvaluationResult & {
  /** Stejný jazyk jako v tabulce — program · větev · pozice (z DB + normalizace) */
  summaryLine: string | null;
  /** Krátký hint pod řádek */
  hintShort: string;
  /** Sjednocený manažerský bucket pro souhrny (bez toxických labelů) */
  managerProgressLabel: string;
};

/**
 * Manažerské škatulky pro souhrn týmu — neslučují se s technickým `progressEvaluation`.
 */
export function careerManagerProgressLabel(r: CareerEvaluationResult): string {
  if (r.progressEvaluation === "on_track") {
    if (r.evaluationCompleteness === "low_confidence") return "Bez dostatku dat";
    if (r.evaluationCompleteness === "partial") return "Částečně vyhodnoceno";
    return "Na dobré cestě";
  }
  if (r.progressEvaluation === "data_missing" || r.progressEvaluation === "not_configured") {
    return "Vyžaduje doplnění";
  }
  if (r.progressEvaluation === "blocked" || r.progressEvaluation === "unknown") {
    return "Potřebuje pozornost";
  }
  if (r.progressEvaluation === "close_to_promotion" || r.progressEvaluation === "promoted_ready") {
    return "Částečně vyhodnoceno";
  }
  return "Částečně vyhodnoceno";
}

export function buildCareerEvaluationViewModel(
  ctx: CareerEvaluationContext,
  rawMembership: {
    careerProgram: string | null;
    careerTrack: string | null;
    careerPositionCode: string | null;
  }
): CareerEvaluationViewModel {
  const base = evaluateCareerProgress(ctx);
  return {
    ...base,
    summaryLine: formatCareerSummaryLine(
      rawMembership.careerProgram,
      rawMembership.careerTrack,
      rawMembership.careerPositionCode
    ),
    hintShort: careerListHintShort(base),
    managerProgressLabel: careerManagerProgressLabel(base),
  };
}
