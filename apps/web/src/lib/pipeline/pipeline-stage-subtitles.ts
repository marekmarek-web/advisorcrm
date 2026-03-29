/**
 * Short subtitles per pipeline column index — aligned with desktop `PipelineBoard` (STAGE_SUBTITLES).
 */
const STAGE_SUBTITLES: Record<number, string> = {
  0: "K volání / Domluvit",
  1: "Schůzka 1 / Sběr podkladů",
  2: "Práce u stolu / Modelace",
  3: "Schůzka 2 / Námitky",
  4: "Podpisy / Čeká na banku",
  5: "Výročí / Cross-sell",
};

export function getPipelineStageSubtitle(stageIndexZeroBased: number): string {
  return STAGE_SUBTITLES[stageIndexZeroBased % 6] ?? "";
}
