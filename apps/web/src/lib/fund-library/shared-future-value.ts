/**
 * Sdílený server-side odhad budoucí hodnoty (FV) u investičních produktů.
 *
 * Tento modul:
 *   - resolvuje roční sazbu z `BASE_FUNDS` (fondová knihovna) nebo fallbacku
 *     podle kategorie,
 *   - pak deleguje veškerou matematiku na `shared-future-value-pure.ts`,
 *   - kvůli transitivnímu importu `BASE_FUNDS` **nesmí** být importován
 *     z klientských bundlů (viz `ClientMobileClient.tsx` — tam se používá
 *     čistý modul s předvyřešenou sazbou).
 */

import type { ResolvedFundCategory, FvSourceType } from "db";
import { BASE_FUNDS } from "@/lib/analyses/financial/fund-library/base-funds";
import type { BaseFund } from "@/lib/analyses/financial/fund-library/types";
import { fundUsesBrandLogoPath } from "@/lib/analyses/financial/fund-library/fund-report-asset-resolver";
import { displayNameForResolvedFundId } from "@/lib/fund-library/fund-resolution";
import {
  computeSharedFutureValueFromRate,
  futureValueOfLumpSum,
  futureValueOfMonthlyContributions,
  parseInvestmentHorizonYears,
  SHARED_FV_DISCLAIMER,
  type PortalFvInputs,
  type SharedFvInputs,
  type SharedFvOutput,
  type SharedFvProjectionState,
  type SharedFvSourceType,
} from "@/lib/fund-library/shared-future-value-pure";

export {
  SHARED_FV_DISCLAIMER,
  futureValueOfLumpSum,
  futureValueOfMonthlyContributions,
  parseInvestmentHorizonYears,
};
export type {
  PortalFvInputs,
  SharedFvInputs,
  SharedFvOutput,
  SharedFvProjectionState,
  SharedFvSourceType,
};

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
 * Vrátí modelovou roční sazbu (%) pro daný vstup — jediný server-side zdroj
 * pravdy pro resolving. Klient by neměl tuto funkci volat (drží celé
 * `BASE_FUNDS` v paměti).
 */
export function resolveSharedFvAnnualRatePercent(
  fvSourceType: FvSourceType | null | undefined,
  resolvedFundId: string | null | undefined,
  resolvedFundCategory: ResolvedFundCategory | null | undefined,
  manualAnnualRatePercent: number | null | undefined,
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

  if (fvSourceType === "manual") {
    const m = manualAnnualRatePercent;
    if (m == null || !Number.isFinite(m) || m <= 0) return null;
    return m;
  }

  return null;
}

/**
 * Vrátí fallback sazbu pro zadanou kategorii — používá se, když klientský
 * kód dostal jen kategorii (ne konkrétní `resolvedFundId`) a chce odhad.
 * Exportováno kvůli precomputu v serverové cestě pro klientský bundle.
 */
export function heuristicRateForCategory(category: ResolvedFundCategory | null | undefined): number | null {
  if (!category) return null;
  return HEURISTIC_ANNUAL_RATE_PERCENT[category] ?? null;
}

/**
 * Jednotný výstup FV pro portál, detail klienta a finanční analýzu.
 * Nehalucinuje chybějící horizont ani příspěvek — `projectedFutureValue` zůstává null a `projectionState` je partial / unavailable.
 */
export function computeSharedFutureValue(input: SharedFvInputs): SharedFvOutput {
  const rate = resolveSharedFvAnnualRatePercent(
    input.fvSourceType ?? null,
    input.resolvedFundId ?? null,
    input.resolvedFundCategory ?? null,
    input.manualAnnualRatePercent ?? null,
  );
  return computeSharedFutureValueFromRate({
    ...input,
    resolvedAnnualRatePercent: rate,
    resolvedFundDisplayName: displayNameForResolvedFundId(input.resolvedFundId ?? null),
  });
}

export type PortalFvResult = {
  amount: number;
  horizonYears: number;
  sourceExplanation: string;
};

/**
 * Výsledná modelová sazba (% p.a.) po zohlednění volitelné úpravy (např. konzervativnější režim analýzy).
 * Používá stejnou logiku jako výpočet FV u portfolia / evidence.
 */
export function resolvePortalFvAnnualRatePercentAdjusted(input: PortalFvInputs): number | null {
  const base = resolveSharedFvAnnualRatePercent(
    input.fvSourceType ?? null,
    input.resolvedFundId ?? null,
    input.resolvedFundCategory ?? null,
    input.manualAnnualRatePercent ?? null,
  );
  if (base == null) return null;
  const adj = input.annualRateAdjustmentPercentPoints ?? 0;
  return Math.max(0.01, base + adj);
}

/**
 * Vypočítá FV pro klientský portál / další konzumenty kanonického read modelu.
 * Vrací null, pokud chybí kterýkoliv vstup nutný k zodpovědnému odhadu.
 */
export function computePortalInvestmentFutureValue(input: PortalFvInputs): PortalFvResult | null {
  const shared = computeSharedFutureValue(input);
  if (shared.projectionState !== "complete" || shared.projectedFutureValue == null || shared.horizonYears == null) {
    return null;
  }
  return {
    amount: shared.projectedFutureValue,
    horizonYears: shared.horizonYears,
    sourceExplanation: shared.sourceLabel,
  };
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
