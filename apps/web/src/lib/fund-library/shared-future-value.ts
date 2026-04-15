/**
 * Sdílený server-side odhad budoucí hodnoty (FV) u investičních produktů.
 * Vstupy výhradně z kanonických polí smlouvy (`resolvedFundId`, `resolvedFundCategory`, `fvSourceType`, platby, horizont).
 * Žádné parsování PDF ani názvů souborů — obecná produktová logika.
 *
 * Pořadí zdroje sazby: fondová knihovna → fallback podle kategorie → ruční sazba (analýza) → nedostupné.
 */

import type { ResolvedFundCategory, FvSourceType } from "db";
import { BASE_FUNDS } from "@/lib/analyses/financial/fund-library/base-funds";
import type { BaseFund } from "@/lib/analyses/financial/fund-library/types";
import { fundUsesBrandLogoPath } from "@/lib/analyses/financial/fund-library/fund-report-asset-resolver";
import { displayNameForResolvedFundId } from "@/lib/fund-library/fund-resolution";

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

/** Jednotné zobrazení v UI — `heuristic-fallback` z DB mapujeme na `category-fallback`. */
export type SharedFvSourceType = "fund-library" | "category-fallback" | "manual" | "unavailable";

export type SharedFvProjectionState = "complete" | "partial" | "unavailable";

export const SHARED_FV_DISCLAIMER =
  "Orientační nezaručený výpočet na základě modelových předpokladů. Skutečný vývoj může být výrazně odlišný; nejedná se o záruku výnosu ani budoucí hodnoty.";

export type SharedFvInputs = PortalFvInputs & {
  /** Aktuální hodnota portfolia, pokud je v evidenci — nepoužívá se k doplnění chybějícího vstupu pro FV. */
  currentValue?: number | null | undefined;
};

export type SharedFvOutput = {
  /** Efektivní modelová sazba po případném posunu (analýza). Null, pokud sazbu nelze stanovit. */
  expectedAnnualRatePercent: number | null;
  sourceType: SharedFvSourceType;
  /** Krátká česká vysvětlivka zdroje modelace (bez interních technických kódů). */
  sourceLabel: string;
  /** Efektivní měsíční příspěvek po přepočtu z ročního; u čistě jednorázové investice null. */
  monthlyContribution: number | null;
  currentValue: number | null | undefined;
  horizonYears: number | null;
  projectedFutureValue: number | null;
  disclaimer: string;
  projectionState: SharedFvProjectionState;
};

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

function resolveHorizonYearsFromPortalInput(input: PortalFvInputs): number | null {
  const ex = input.horizonYearsExplicit;
  if (ex != null && Number.isFinite(ex)) {
    const y = Math.round(ex);
    if (y > 0 && y <= 80) return y;
  }
  return parseInvestmentHorizonYears(input.investmentHorizon ?? null);
}

function resolveSharedSourcePresentation(
  fvSourceType: FvSourceType,
  adjustedRatePercent: number | null,
  resolvedFundId: string | null,
  resolvedFundCategory: ResolvedFundCategory | null,
): Pick<SharedFvOutput, "sourceType" | "sourceLabel" | "expectedAnnualRatePercent"> {
  if (adjustedRatePercent == null) {
    if (fvSourceType === "fund-library") {
      return {
        sourceType: "unavailable",
        sourceLabel:
          "U fondu v knihovně chybí platná modelová roční sazba pro výpočet — nelze stanovit orientační budoucí hodnotu.",
        expectedAnnualRatePercent: null,
      };
    }
    if (fvSourceType === "heuristic-fallback") {
      return {
        sourceType: "unavailable",
        sourceLabel:
          resolvedFundCategory === "unknown" || !resolvedFundCategory
            ? "Nelze rozpoznat kategorii pro obecný model (odhad) — chybí platný fallback."
            : "Pro vybranou kategorii nelze použít obecný model sazby.",
        expectedAnnualRatePercent: null,
      };
    }
    return {
      sourceType: "unavailable",
      sourceLabel: "Chybí platná modelová roční sazba pro ruční režim.",
      expectedAnnualRatePercent: null,
    };
  }

  if (fvSourceType === "fund-library") {
    const fundName = displayNameForResolvedFundId(resolvedFundId);
    return {
      sourceType: "fund-library",
      sourceLabel: fundName
        ? `Odhad vychází z modelové roční sazby u fondu „${fundName}“ v evidenci produktů.`
        : "Odhad vychází z modelové roční sazby uvedené u fondu v evidenci produktů.",
      expectedAnnualRatePercent: adjustedRatePercent,
    };
  }
  if (fvSourceType === "heuristic-fallback") {
    return {
      sourceType: "category-fallback",
      sourceLabel: "Odhad vychází z obecné kategorie investice (zjednodušený model).",
      expectedAnnualRatePercent: adjustedRatePercent,
    };
  }
  return {
    sourceType: "manual",
    sourceLabel: "Odhad vychází z modelové roční sazby zadané v analýze (krok strategie).",
    expectedAnnualRatePercent: adjustedRatePercent,
  };
}

/**
 * Jednotný výstup FV pro portál, detail klienta a finanční analýzu.
 * Nehalucinuje chybějící horizont ani příspěvek — `projectedFutureValue` zůstává null a `projectionState` je partial / unavailable.
 */
export function computeSharedFutureValue(input: SharedFvInputs): SharedFvOutput {
  const disclaimer = SHARED_FV_DISCLAIMER;
  const currentValue = input.currentValue ?? null;

  const fvSourceType = input.fvSourceType ?? null;
  if (fvSourceType !== "fund-library" && fvSourceType !== "heuristic-fallback" && fvSourceType !== "manual") {
    return {
      expectedAnnualRatePercent: null,
      sourceType: "unavailable",
      sourceLabel:
        "Nelze stanovit orientační sazbu — chybí platný zdroj (fondová knihovna, kategorie podle evidence, nebo ruční sazba).",
      monthlyContribution: null,
      currentValue,
      horizonYears: null,
      projectedFutureValue: null,
      disclaimer,
      projectionState: "unavailable",
    };
  }

  const baseRate = resolveAnnualRatePercent(
    fvSourceType,
    input.resolvedFundId ?? null,
    input.resolvedFundCategory ?? null,
    input.manualAnnualRatePercent ?? null,
  );
  const adjustedRate =
    baseRate != null && Number.isFinite(baseRate)
      ? Math.max(0.01, baseRate + (input.annualRateAdjustmentPercentPoints ?? 0))
      : null;

  const presentation = resolveSharedSourcePresentation(
    fvSourceType,
    adjustedRate,
    input.resolvedFundId ?? null,
    input.resolvedFundCategory ?? null,
  );

  const horizonYears = resolveHorizonYearsFromPortalInput(input);

  let monthly = input.monthlyContribution ?? null;
  if (monthly == null || monthly <= 0) {
    const annual = input.annualContribution ?? null;
    if (annual != null && annual > 0) monthly = annual / 12;
  }
  const lump = input.lumpContribution ?? null;
  const useLumpPath =
    lump != null &&
    lump > 0 &&
    (monthly == null || monthly <= 0) &&
    !(input.annualContribution != null && input.annualContribution > 0);

  const effectiveMonthly = monthly != null && monthly > 0 ? monthly : null;

  if (presentation.expectedAnnualRatePercent == null || presentation.sourceType === "unavailable") {
    return {
      expectedAnnualRatePercent: null,
      sourceType: "unavailable",
      sourceLabel: presentation.sourceLabel,
      monthlyContribution: effectiveMonthly,
      currentValue,
      horizonYears,
      projectedFutureValue: null,
      disclaimer,
      projectionState: "unavailable",
    };
  }

  const rate = presentation.expectedAnnualRatePercent;

  if (horizonYears == null) {
    return {
      expectedAnnualRatePercent: rate,
      sourceType: presentation.sourceType,
      sourceLabel: presentation.sourceLabel,
      monthlyContribution: effectiveMonthly,
      currentValue,
      horizonYears: null,
      projectedFutureValue: null,
      disclaimer,
      projectionState: "partial",
    };
  }

  if (!useLumpPath && (effectiveMonthly == null || effectiveMonthly <= 0)) {
    return {
      expectedAnnualRatePercent: rate,
      sourceType: presentation.sourceType,
      sourceLabel: presentation.sourceLabel,
      monthlyContribution: effectiveMonthly,
      currentValue,
      horizonYears,
      projectedFutureValue: null,
      disclaimer,
      projectionState: "partial",
    };
  }

  if (useLumpPath && (lump == null || lump <= 0)) {
    return {
      expectedAnnualRatePercent: rate,
      sourceType: presentation.sourceType,
      sourceLabel: presentation.sourceLabel,
      monthlyContribution: null,
      currentValue,
      horizonYears,
      projectedFutureValue: null,
      disclaimer,
      projectionState: "partial",
    };
  }

  let fv: number | null;
  if (useLumpPath) {
    fv = futureValueOfLumpSum(lump!, horizonYears, rate);
  } else {
    const raw = futureValueOfMonthlyContributions(effectiveMonthly!, horizonYears, rate);
    fv = raw == null ? null : Math.round(raw);
  }

  if (fv == null || !Number.isFinite(fv) || fv <= 0) {
    return {
      expectedAnnualRatePercent: rate,
      sourceType: presentation.sourceType,
      sourceLabel: presentation.sourceLabel,
      monthlyContribution: effectiveMonthly,
      currentValue,
      horizonYears,
      projectedFutureValue: null,
      disclaimer,
      projectionState: "partial",
    };
  }

  return {
    expectedAnnualRatePercent: rate,
    sourceType: presentation.sourceType,
    sourceLabel: presentation.sourceLabel,
    monthlyContribution: effectiveMonthly,
    currentValue,
    horizonYears,
    projectedFutureValue: fv,
    disclaimer,
    projectionState: "complete",
  };
}

/** Budoucí hodnota jednorázového vkladu po N letech, nominální model (složené úročení). */
export function futureValueOfLumpSum(
  lumpAmount: number,
  horizonYears: number,
  annualRatePercent: number,
): number | null {
  if (!(lumpAmount > 0) || !(horizonYears > 0) || !(annualRatePercent > 0)) return null;
  const fv = lumpAmount * Math.pow(1 + annualRatePercent / 100, horizonYears);
  if (!Number.isFinite(fv) || fv <= 0) return null;
  return Math.round(fv);
}

/**
 * Výsledná modelová sazba (% p.a.) po zohlednění volitelné úpravy (např. konzervativnější režim analýzy).
 * Používá stejnou logiku jako výpočet FV u portfolia / evidence.
 */
export function resolvePortalFvAnnualRatePercentAdjusted(input: PortalFvInputs): number | null {
  const base = resolveAnnualRatePercent(
    input.fvSourceType as FvSourceType,
    input.resolvedFundId ?? null,
    input.resolvedFundCategory ?? null,
    input.manualAnnualRatePercent ?? null,
  );
  if (base == null) return null;
  const adj = input.annualRateAdjustmentPercentPoints ?? 0;
  return Math.max(0.01, base + adj);
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
  /**
   * Horizont v celých letech — např. krok strategie ve finanční analýze.
   * Má přednost před parsováním textu v `investmentHorizon`.
   */
  horizonYearsExplicit?: number | null | undefined;
  /** Preferovaná měsíční částka (již po agregaci z pojistného / příspěvku). */
  monthlyContribution: number | null | undefined;
  /** Roční příspěvek — použije se jen když měsíční chybí nebo je 0. */
  annualContribution: number | null | undefined;
  /** Jednorázová investice — pokud je > 0 a chybí pravidelná platba, počítá se FV jednorázového vkladu. */
  lumpContribution?: number | null | undefined;
  /**
   * Modelová roční sazba v % p.a. (např. 7 = 7 %) pro režim `manual`.
   */
  manualAnnualRatePercent?: number | null | undefined;
  /** Posun sazby v procentních bodech (např. -2 u konzervativnějšího režimu). */
  annualRateAdjustmentPercentPoints?: number | null | undefined;
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
