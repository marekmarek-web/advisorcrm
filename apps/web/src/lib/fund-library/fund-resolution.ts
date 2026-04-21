/**
 * Fund-library resolution for write-through.
 *
 * Matches extracted fund names/ISINs against BASE_FUNDS catalog.
 * If matched → resolvedFundId + fvSourceType='fund-library'.
 * If not matched → heuristic fallback category + fvSourceType='heuristic-fallback'.
 * If indeterminate → null (FV cannot be computed).
 *
 * Generic: no vendor-specific or filename-specific logic.
 */

import { BASE_FUNDS } from "@/lib/analyses/financial/fund-library/base-funds";
import type { BaseFund } from "@/lib/analyses/financial/fund-library/types";
import type { BaseFundKey } from "@/lib/analyses/financial/fund-library/legacy-fund-key-map";
import type {
  ResolvedFundCategory,
  FvSourceType,
} from "db";

export type FundResolutionResult = {
  resolvedFundId: string | null;
  resolvedFundCategory: ResolvedFundCategory | null;
  fvSourceType: FvSourceType | null;
};

const isinIndex: ReadonlyMap<string, BaseFund> = new Map(
  BASE_FUNDS
    .filter((f) => f.isin && f.isActive)
    .map((f) => [f.isin!.toUpperCase().replace(/\s+/g, ""), f]),
);

function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,\-–—()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const nameIndex: ReadonlyArray<{ normalized: string; fund: BaseFund }> =
  BASE_FUNDS.filter((f) => f.isActive).map((f) => ({
    normalized: normalizeForSearch(f.displayName),
    fund: f,
  }));

const canonicalNameIndex: ReadonlyArray<{ normalized: string; fund: BaseFund }> =
  BASE_FUNDS
    .filter((f) => f.isActive && f.canonicalName)
    .map((f) => ({
      normalized: normalizeForSearch(f.canonicalName!),
      fund: f,
    }));

function matchByIsin(isin: string): BaseFund | undefined {
  const key = isin.toUpperCase().replace(/\s+/g, "");
  return isinIndex.get(key);
}

function matchByName(name: string): BaseFund | undefined {
  const q = normalizeForSearch(name);
  if (!q || q.length < 3) return undefined;

  for (const entry of canonicalNameIndex) {
    if (entry.normalized === q) return entry.fund;
  }
  for (const entry of nameIndex) {
    if (entry.normalized === q) return entry.fund;
  }

  for (const entry of canonicalNameIndex) {
    if (entry.normalized.includes(q) || q.includes(entry.normalized)) return entry.fund;
  }
  for (const entry of nameIndex) {
    if (entry.normalized.includes(q) || q.includes(entry.normalized)) return entry.fund;
  }

  return undefined;
}

const CATEGORY_HEURISTICS: Array<{
  patterns: RegExp;
  category: ResolvedFundCategory;
}> = [
  { patterns: /akci[eíoýáě]|equity|stock|msci|s&p|emerging/i, category: "equity" },
  /** Obecná dynamická strategie — stejná modelová sazba jako akcie (8 % p.a.) v HEURISTIC mapě. */
  { patterns: /dynamick(á|ý|é)?\s+strateg/i, category: "equity" },
  { patterns: /vyvážen|balanced|smíšen/i, category: "balanced" },
  { patterns: /konzervativn|conservative|opatrn/i, category: "conservative" },
  { patterns: /dluhopis|bond[sy]?|úrokový|interest/i, category: "bond" },
  { patterns: /nemovitost|real[_\s]?estate|realit/i, category: "real_estate" },
  { patterns: /dps.*dynamick|dynamick.*dps|penz.*dynamick/i, category: "dps_dynamic" },
  { patterns: /dps.*vyvážen|vyvážen.*dps|penz.*vyvážen/i, category: "dps_balanced" },
  { patterns: /dps.*konzervat|konzervat.*dps|penz.*konzervat/i, category: "dps_conservative" },
  { patterns: /růstov|growth/i, category: "equity" },
];

export function displayNameForResolvedFundId(resolvedFundId: string | null | undefined): string | null {
  if (!resolvedFundId) return null;
  const f = BASE_FUNDS.find((x) => x.baseFundKey === resolvedFundId);
  return f?.displayName ?? null;
}

function classifyFundCategory(name: string, strategy?: string | null): ResolvedFundCategory | null {
  const haystack = [name, strategy ?? ""].join(" ");
  for (const h of CATEGORY_HEURISTICS) {
    if (h.patterns.test(haystack)) return h.category;
  }
  return null;
}

/**
 * Resolve a single extracted fund against the fund library.
 * Returns resolution metadata for portfolio_attributes.
 */
export function resolveFund(
  fundName: string | null | undefined,
  fundIsin: string | null | undefined,
  investmentStrategy: string | null | undefined,
): FundResolutionResult {
  if (!fundName && !fundIsin && !investmentStrategy) {
    return { resolvedFundId: null, resolvedFundCategory: null, fvSourceType: null };
  }

  if (fundIsin) {
    const byIsin = matchByIsin(fundIsin);
    if (byIsin) {
      return {
        resolvedFundId: byIsin.baseFundKey,
        resolvedFundCategory: null,
        fvSourceType: "fund-library",
      };
    }
  }

  if (fundName) {
    const byName = matchByName(fundName);
    if (byName) {
      return {
        resolvedFundId: byName.baseFundKey,
        resolvedFundCategory: null,
        fvSourceType: "fund-library",
      };
    }

    const fallbackCategory = classifyFundCategory(fundName, investmentStrategy);
    if (fallbackCategory) {
      return {
        resolvedFundId: null,
        resolvedFundCategory: fallbackCategory,
        fvSourceType: "heuristic-fallback",
      };
    }
  }

  if (investmentStrategy) {
    const strategyCategory = classifyFundCategory("", investmentStrategy);
    if (strategyCategory) {
      return {
        resolvedFundId: null,
        resolvedFundCategory: strategyCategory,
        fvSourceType: "heuristic-fallback",
      };
    }
  }

  return { resolvedFundId: null, resolvedFundCategory: null, fvSourceType: null };
}

/**
 * Resolve funds from portfolio attributes (extracted investment data).
 * Takes the first fund from investmentFunds array + strategy and resolves.
 *
 * **Kept for backward compatibility.** Používá jen první fond — nové volání
 * preferuje `resolveFundsFromPortfolioAttributes` (multi-fund), které vybírá
 * první fund-library hit místo striktně prvního fondu.
 */
export function resolveFundFromPortfolioAttributes(
  attrs: Record<string, unknown>,
): FundResolutionResult {
  return resolveFundsFromPortfolioAttributes(attrs).aggregate;
}

/**
 * F1-4 (BONUS-2): multi-fund resolution.
 *
 * Vrací per-fund resolution + aggregate (rollup) metadata pro celé portfolio.
 * Aggregate preferuje první "fund-library" hit napříč všemi fondy — pokud ani
 * jeden fond není v library, fallback na první heuristic-fallback, a pokud
 * není ani ten, vrací `null`.
 *
 * Důvod: dříve se bralo striktně `funds[0]` a pokud byl první fond mimo
 * library (např. oborový podfond), FV se zaručeně spadalo do heuristic i když
 * druhý fond měl přesný ISIN v library.
 */
export type MultiFundResolutionResult = {
  perFund: Array<FundResolutionResult & { index: number }>;
  aggregate: FundResolutionResult;
};

export function resolveFundsFromPortfolioAttributes(
  attrs: Record<string, unknown>,
): MultiFundResolutionResult {
  const funds =
    (attrs.investmentFunds as Array<{ name?: string; isin?: string }> | undefined) ?? [];
  const strategy = typeof attrs.investmentStrategy === "string" ? attrs.investmentStrategy : null;

  if (!Array.isArray(funds) || funds.length === 0) {
    const strategyOnly = resolveFund(null, null, strategy);
    return {
      perFund: [],
      aggregate: strategyOnly,
    };
  }

  const perFund = funds.map((f, index) => ({
    index,
    ...resolveFund(f?.name ?? null, f?.isin ?? null, strategy),
  }));

  const firstLibraryHit = perFund.find((r) => r.fvSourceType === "fund-library");
  if (firstLibraryHit) {
    return {
      perFund,
      aggregate: {
        resolvedFundId: firstLibraryHit.resolvedFundId,
        resolvedFundCategory: firstLibraryHit.resolvedFundCategory,
        fvSourceType: "fund-library",
      },
    };
  }
  const firstHeuristic = perFund.find((r) => r.fvSourceType === "heuristic-fallback");
  if (firstHeuristic) {
    return {
      perFund,
      aggregate: {
        resolvedFundId: firstHeuristic.resolvedFundId,
        resolvedFundCategory: firstHeuristic.resolvedFundCategory,
        fvSourceType: "heuristic-fallback",
      },
    };
  }
  return {
    perFund,
    aggregate: { resolvedFundId: null, resolvedFundCategory: null, fvSourceType: null },
  };
}
