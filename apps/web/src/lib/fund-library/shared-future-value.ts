/**
 * Sdílený server-side odhad budoucí hodnoty (FV) u investičních produktů.
 * Vstupy výhradně z kanonických polí smlouvy (`resolvedFundId`, `resolvedFundCategory`, `fvSourceType`, platby, horizont).
 * Žádné parsování PDF ani názvů souborů — obecná produktová logika.
 */

import type { ResolvedFundCategory, FvSourceType } from "db";
import { BASE_FUNDS } from "@/lib/analyses/financial/fund-library/base-funds";
import type { BaseFund } from "@/lib/analyses/financial/fund-library/types";
import { fundUsesBrandLogoPath } from "@/lib/analyses/financial/fund-library/fund-report-asset-resolver";

const HEURISTIC_ANNUAL_RATE_PERCENT: Record<ResolvedFundCategory, number | null> = {
  equity: 8,
  dps_dynamic: 8,
  balanced: 6,
  conservative: 4,
  bond: 6,
  real_estate: 6,
  dps_balanced: 6,
  dps_conservative: 4,
  unknown: null,
};

const fundByKey: ReadonlyMap<string, BaseFund> = new Map(
  BASE_FUNDS.filter((f) => f.isActive).map((f) => [f.baseFundKey, f]),
);

/**
 * Parsuje investiční horizont z běžných textových tvarů v CRM (např. „20 let“, „do roku 2045“).
 * Vrací null, pokud roky nejde rozumně odvodit — v tom případě se FV nezobrazuje.
 */
export function parseInvestmentHorizonYears(
  horizon: string | null | undefined,
  referenceYear: number = new Date().getFullYear(),
): number | null {
  if (!horizon?.trim()) return null;
  const h = horizon.trim();

  const yearTarget = h.match(/\bdo\s+roku\s+(\d{4})\b/i);
  if (yearTarget) {
    const y = Number(yearTarget[1]);
    if (Number.isFinite(y)) {
      const years = y - referenceYear;
      return years > 0 ? years : null;
    }
  }

  const plusLet = h.match(/\b(\d{1,2})\s*\+\s*let/i);
  if (plusLet) {
    const n = Number(plusLet[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const nLet = h.match(/\b(\d{1,3})\s*let/i);
  if (nLet) {
    const n = Number(nLet[1]);
    return Number.isFinite(n) && n > 0 && n <= 80 ? n : null;
  }

  return null;
}

function resolveAnnualRatePercent(
  fvSourceType: FvSourceType,
  resolvedFundId: string | null,
  resolvedFundCategory: ResolvedFundCategory | null,
): number | null {
  if (fvSourceType === "fund-library" && resolvedFundId) {
    const fund = fundByKey.get(resolvedFundId);
    const rate = fund?.planningRate;
    if (rate != null && Number.isFinite(rate) && rate > 0) return rate;
    return null;
  }

  if (fvSourceType === "heuristic-fallback" && resolvedFundCategory) {
    return HEURISTIC_ANNUAL_RATE_PERCENT[resolvedFundCategory] ?? null;
  }

  return null;
}

/** Budoucí hodnota pravidelných měsíčních vkladů (konec období), nominální model. */
export function futureValueOfMonthlyContributions(
  monthlyAmount: number,
  horizonYears: number,
  annualRatePercent: number,
): number | null {
  if (!(monthlyAmount > 0) || !(horizonYears > 0) || !(annualRatePercent > 0)) return null;
  const months = Math.round(horizonYears * 12);
  if (months < 1) return null;
  const r = annualRatePercent / 100 / 12;
  if (r <= 0) return monthlyAmount * months;
  const factor = (Math.pow(1 + r, months) - 1) / r;
  if (!Number.isFinite(factor)) return null;
  return monthlyAmount * factor;
}

export type PortalFvInputs = {
  fvSourceType: FvSourceType | null | undefined;
  resolvedFundId: string | null | undefined;
  resolvedFundCategory: ResolvedFundCategory | null | undefined;
  investmentHorizon: string | null | undefined;
  /** Preferovaná měsíční částka (již po agregaci z pojistného / příspěvku). */
  monthlyContribution: number | null | undefined;
  /** Roční příspěvek — použije se jen když měsíční chybí nebo je 0. */
  annualContribution: number | null | undefined;
};

export type PortalFvResult = {
  amount: number;
  horizonYears: number;
  /** Krátká česká vysvětlivka zdroje modelace (bez interních technických kódů). */
  sourceExplanation: string;
};

/**
 * Vypočítá FV pro klientský portál / další konzumenty kanonického read modelu.
 * Vrací null, pokud chybí kterýkoliv vstup nutný k zodpovědnému odhadu.
 */
export function computePortalInvestmentFutureValue(input: PortalFvInputs): PortalFvResult | null {
  const { fvSourceType, resolvedFundId, resolvedFundCategory, investmentHorizon } = input;
  if (fvSourceType !== "fund-library" && fvSourceType !== "heuristic-fallback") return null;

  const horizonYears = parseInvestmentHorizonYears(investmentHorizon ?? null);
  if (horizonYears == null) return null;

  let monthly = input.monthlyContribution ?? null;
  if (monthly == null || monthly <= 0) {
    const annual = input.annualContribution ?? null;
    if (annual != null && annual > 0) monthly = annual / 12;
  }
  if (monthly == null || monthly <= 0) return null;

  const rate = resolveAnnualRatePercent(
    fvSourceType,
    resolvedFundId ?? null,
    resolvedFundCategory ?? null,
  );
  if (rate == null) return null;

  const fv = futureValueOfMonthlyContributions(monthly, horizonYears, rate);
  if (fv == null || !Number.isFinite(fv) || fv <= 0) return null;

  const sourceExplanation =
    fvSourceType === "fund-library"
      ? "Odhad vychází z modelové roční sazby uvedené u fondu v evidenci produktů."
      : "Odhad vychází z obecné kategorie investice (zjednodušený model).";

  return { amount: Math.round(fv), horizonYears, sourceExplanation };
}

/**
 * Logo fondu z knihovny — jen pokud je v repozitáři skutečný brand asset (ne generický placeholder).
 */
export function fundLibraryLogoPathForPortal(resolvedFundId: string | null | undefined): string | null {
  if (!resolvedFundId) return null;
  const fund = fundByKey.get(resolvedFundId);
  const path = fund?.assets?.logoPath?.trim();
  if (!path || !fundUsesBrandLogoPath(path)) return null;
  return path;
}
