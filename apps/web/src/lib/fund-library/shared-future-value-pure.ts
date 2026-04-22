/**
 * Čistá klientsky bezpečná math-vrstva pro sdílený FV výpočet.
 *
 * Nedotýká se `BASE_FUNDS` ani žádné seed knihovny — vstupem je již
 * vyřešená roční sazba (`annualRatePercent`). To umožňuje:
 *   - **klientskému bundlu** (`ClientMobileClient.tsx`, mobilní portál klienta)
 *     importovat pouze tento soubor a ušetřit stovky kB v JS payloadu,
 *     které by jinak fondová knihovna vtáhla do klientu.
 *   - **serverové cestě** (`shared-future-value.ts`) vyřešit sazbu z
 *     `BASE_FUNDS` / kategorie a delegovat na tuto funkci — jediný zdroj
 *     pravdy pro matematiku.
 *
 * Sémantika výstupu je 1:1 s původním `computeSharedFutureValue`, aby
 * UI tenanti nemuseli nic měnit kromě importu.
 */

import type { ResolvedFundCategory, FvSourceType } from "db";

export type SharedFvSourceType = "fund-library" | "category-fallback" | "manual" | "unavailable";

export type SharedFvProjectionState = "complete" | "partial" | "unavailable";

export const SHARED_FV_DISCLAIMER =
  "Orientační nezaručený výpočet na základě modelových předpokladů. Skutečný vývoj může být výrazně odlišný; nejedná se o záruku výnosu ani budoucí hodnoty.";

export type PortalFvInputs = {
  fvSourceType: FvSourceType | null | undefined;
  resolvedFundId: string | null | undefined;
  resolvedFundCategory: ResolvedFundCategory | null | undefined;
  investmentHorizon: string | null | undefined;
  /** Horizont v celých letech (přebíjí parsování `investmentHorizon`). */
  horizonYearsExplicit?: number | null | undefined;
  monthlyContribution: number | null | undefined;
  annualContribution: number | null | undefined;
  lumpContribution?: number | null | undefined;
  /** Manuální roční sazba (%, např. 7 = 7 %) pro `fvSourceType === "manual"`. */
  manualAnnualRatePercent?: number | null | undefined;
  /** Posun sazby v p.b. (např. −2 u konzervativnějšího režimu analýzy). */
  annualRateAdjustmentPercentPoints?: number | null | undefined;
};

export type SharedFvInputs = PortalFvInputs & {
  currentValue?: number | null | undefined;
};

export type SharedFvOutput = {
  expectedAnnualRatePercent: number | null;
  sourceType: SharedFvSourceType;
  sourceLabel: string;
  monthlyContribution: number | null;
  currentValue: number | null | undefined;
  horizonYears: number | null;
  projectedFutureValue: number | null;
  disclaimer: string;
  projectionState: SharedFvProjectionState;
};

/**
 * Parsuje investiční horizont z běžných textových tvarů v CRM
 * (např. „20 let“, „do roku 2045“).
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
  fundDisplayName: string | null,
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
    return {
      sourceType: "fund-library",
      sourceLabel: fundDisplayName
        ? `Odhad vychází z modelové roční sazby u fondu „${fundDisplayName}“ v evidenci produktů.`
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

export type SharedFvWithRateInputs = SharedFvInputs & {
  /** Základní roční sazba (%), již vyřešená z BASE_FUNDS / kategorie / manual.
   * `null` → sazba není k dispozici, FV vyjde jako `unavailable`. */
  resolvedAnnualRatePercent: number | null | undefined;
  /** Název fondu pro UI, pokud je znám; jinak null. */
  resolvedFundDisplayName?: string | null | undefined;
};

/**
 * Čistá varianta `computeSharedFutureValue` s již vyřešenou sazbou.
 * Klientský kód (např. mobilní portál) volá tuto funkci přímo.
 */
export function computeSharedFutureValueFromRate(input: SharedFvWithRateInputs): SharedFvOutput {
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

  const baseRate = input.resolvedAnnualRatePercent ?? null;
  const adjustedRate =
    baseRate != null && Number.isFinite(baseRate)
      ? Math.max(0.01, baseRate + (input.annualRateAdjustmentPercentPoints ?? 0))
      : null;

  const presentation = resolveSharedSourcePresentation(
    fvSourceType,
    adjustedRate,
    input.resolvedFundId ?? null,
    input.resolvedFundCategory ?? null,
    input.resolvedFundDisplayName ?? null,
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
