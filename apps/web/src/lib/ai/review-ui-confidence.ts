/**
 * Contract review rows may store confidence as 0–1 (model) or 0–100 (legacy/UI).
 * Mobile and some API consumers expect 0–100 for progress bars and labels.
 */
export function confidenceToPercentForUi(raw: number | null | undefined): number | null {
  if (raw == null || typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw > 0 && raw <= 1) return Math.round(raw * 100);
  if (raw > 1 && raw <= 100) return Math.round(raw);
  return Math.min(100, Math.max(0, Math.round(raw)));
}
