/** Track fill for portal calculator range inputs; unfilled segment uses theme surface. */
export function calculatorSliderGradient(value: number, min: number, max: number): string {
  const span = max - min;
  const pct = span === 0 ? 0 : ((value - min) / span) * 100;
  return `linear-gradient(90deg, #2563eb 0%, #38bdf8 ${pct}%, var(--wp-surface-muted) ${pct}%)`;
}
