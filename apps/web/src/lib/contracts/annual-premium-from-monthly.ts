/** Měsíční pojistné (řetězec z inputu) → roční částka pro uložení do DB (2 des. místa). */
export function annualPremiumFromMonthlyInput(monthly: string): string {
  const t = monthly.trim();
  if (!t) return "";
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return "";
  return (Math.round(n * 12 * 100) / 100).toFixed(2);
}

/** Text do pill vedle měsíčního vstupu; null = nic nezobrazovat. */
export function annualPremiumPillLabel(monthly: string): string | null {
  const annual = annualPremiumFromMonthlyInput(monthly);
  if (!annual) return null;
  const num = Number(annual);
  return `≈ ${num.toLocaleString("cs-CZ")} Kč / rok`;
}

/** Roční vstup (MAJ) → měsíční částka pro premium_amount (2 des. místa). */
export function monthlyPremiumFromAnnualInput(annual: string): string {
  const t = annual.trim();
  if (!t) return "";
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return "";
  return (Math.round((n / 12) * 100) / 100).toFixed(2);
}

/** Pill vedle ročního vstupu (MAJ); null = nic nezobrazovat. */
export function monthlyPremiumPillLabel(annual: string): string | null {
  const monthly = monthlyPremiumFromAnnualInput(annual);
  if (!monthly) return null;
  const num = Number(monthly);
  return `≈ ${num.toLocaleString("cs-CZ")} Kč / měsíc`;
}
