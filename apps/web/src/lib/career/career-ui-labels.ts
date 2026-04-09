/**
 * Jednotné krátké štítky pro kariérní evaluaci — Team Overview tabulka i detail člena.
 */

import type { EvaluationCompleteness, ProgressEvaluation } from "./types";

export function careerProgressShortLabel(pe: ProgressEvaluation): string {
  switch (pe) {
    case "not_configured":
      return "Nenastaveno";
    case "data_missing":
      return "Chybí data";
    case "unknown":
      return "Nejasné";
    case "on_track":
      return "Na dobré cestě";
    case "close_to_promotion":
      return "Blízko postupu";
    case "blocked":
      return "Potřebuje pozornost";
    case "promoted_ready":
      return "K potvrzení";
    default:
      return pe;
  }
}

export function careerCompletenessShortLabel(ec: EvaluationCompleteness): string {
  switch (ec) {
    case "full":
      return "Kompletní";
    case "partial":
      return "Částečně";
    case "low_confidence":
      return "Nízká jistota";
    case "manual_required":
      return "Ruční ověření";
    default:
      return ec;
  }
}
