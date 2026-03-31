import { COMPANY_RISK_MONTHLY_PREMIUM_MAX_CZK } from './constants';

/**
 * Ochrana před zobrazením nesmyslné „úspory“ při poškozených datech nebo omylem obřích částkách.
 * Stejná logika jako ve wizardu (StepBenefitsRisks) a v exportu HTML/PDF.
 */
export function safeMonthlySavingsCzk(
  current: number | null | undefined,
  proposed: number | null | undefined,
  max = COMPANY_RISK_MONTHLY_PREMIUM_MAX_CZK,
): number | null {
  if (current == null || proposed == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(proposed)) return null;
  if (current < 0 || proposed < 0) return null;
  if (current > max || proposed > max) return null;
  if (current <= proposed) return null;
  const diff = current - proposed;
  if (diff > max) return null;
  return diff;
}
