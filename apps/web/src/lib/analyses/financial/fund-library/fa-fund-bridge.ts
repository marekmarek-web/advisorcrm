/**
 * Most mezi kanonickým `productKey` (BaseFundKey), legacy `FUND_DETAILS` / `FUND_LOGOS`
 * a HTML/PDF výstupy — primárně data z centrálního katalogu (`BaseFund`).
 */

import { FUND_DETAILS, FUND_LOGOS } from "@/lib/analyses/financial/constants";
import type { FundDetail, HoldingWeight } from "@/lib/analyses/financial/types";
import { getBaseFundByKey, getBaseFundFromProductKey } from "./helpers";
import {
  FUND_PLACEHOLDER_GALLERY_PATH,
  FUND_PLACEHOLDER_HERO_PATH,
} from "./fund-report-asset-resolver";
import type { BaseFundKey } from "./legacy-fund-key-map";
import { mapLegacyFundKey } from "./legacy-fund-key-map";
import type { BaseFund, OfficialFundPerformance } from "./types";

/** Kanonický klíč → klíč v `FUND_DETAILS` / `FUND_LOGOS` (jen kde existuje bohatý profil). */
const CANONICAL_TO_LEGACY_DETAIL: Partial<Record<BaseFundKey, string>> = {
  ishares_core_msci_world: "ishares",
  fidelity_target_2040: "fidelity2040",
  conseq_globalni_akciovy_ucastnicky: "conseq",
  creif: "creif",
  atris: "atris",
  penta: "penta",
};

function formatOfficialPerformanceSummary(o: OfficialFundPerformance | null | undefined): string {
  if (!o) return "";
  const lines: string[] = [];
  const add = (label: string, v: string | null | undefined) => {
    if (v == null || !String(v).trim()) return;
    lines.push(`${label}: ${String(v).trim()}`);
  };
  add("YTD", o.ytd);
  add("1 rok", o.oneYear);
  add("3 roky (p.a.)", o.threeYearPA);
  add("5 let (p.a.)", o.fiveYearPA);
  add("10 let (p.a.)", o.tenYearPA);
  add("Od založení (p.a.)", o.sinceInceptionPA);
  if (o.asOf?.trim()) lines.push(`K datu: ${o.asOf.trim()}`);
  return lines.join("\n");
}

/** Řádky typu „NVIDIA 5.04 %“ → struktura pro grafy v reportu. */
export function parseTopHoldingsFromCatalogLines(rows: string[] | undefined): HoldingWeight[] {
  if (!rows?.length) return [];
  const out: HoldingWeight[] = [];
  for (const line of rows) {
    const t = line.trim();
    const m = t.match(/^(.+?)\s+([\d]+[.,]\d+|[\d]+)\s*%?\s*$/);
    if (!m) continue;
    const name = m[1].replace(/\s+$/, "").trim();
    const w = parseFloat(m[2].replace(",", "."));
    if (!Number.isFinite(w) || name.length < 1) continue;
    out.push({ name, weight: w });
  }
  return out.slice(0, 15);
}

function holdingsCountFromParameters(p: Record<string, string> | undefined): number | undefined {
  if (!p) return undefined;
  const raw = p.holdingsCount;
  if (!raw) return undefined;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return undefined;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : undefined;
}

function resolveMorningstarFromFund(fund: BaseFund): { rating?: number; label?: string } {
  const pr = fund.performance?.morningstarRating;
  if (typeof pr === "number" && pr >= 1 && pr <= 5) return { rating: pr, label: `${pr} / 5` };
  const s = fund.morningstarRating?.trim();
  if (s) {
    const n = parseInt(s, 10);
    if (n >= 1 && n <= 5 && String(n) === s) return { rating: n, label: `${n} / 5` };
    return { label: s };
  }
  return {};
}

function pickRichText(catalog: string, legacy: string): string {
  const ct = catalog?.trim();
  if (ct && ct !== "—") return catalog;
  const lt = legacy?.trim();
  if (lt && lt !== "—") return legacy;
  return ct || lt || "—";
}

function mergeAwards(catalog?: string, legacy?: string): string | undefined {
  const parts = [catalog, legacy]
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
  if (parts.length === 0) return undefined;
  return [...new Set(parts)].join(" · ");
}

/** Hero + 3× galerie vždy vyplněné (placeholdery), aby HTML/PDF nespoléhaly na optional řetězce. */
function ensureFundDetailReportAssets(d: FundDetail): FundDetail {
  const hero = d.heroImage?.trim() || FUND_PLACEHOLDER_HERO_PATH;
  const galleryIn = (d.galleryImages ?? []).map((x) => String(x).trim()).filter(Boolean);
  const gallery = [...galleryIn];
  while (gallery.length < 3) gallery.push(FUND_PLACEHOLDER_GALLERY_PATH);
  return { ...d, heroImage: hero, galleryImages: gallery.slice(0, 3) };
}

function mergeReportFundDetail(catalog: FundDetail, legacy: FundDetail): FundDetail {
  const parameters = { ...legacy.parameters, ...catalog.parameters };
  const paramsClean = Object.keys(parameters).length > 0 ? parameters : undefined;

  const topHoldings =
    catalog.topHoldings && catalog.topHoldings.length > 0 ? catalog.topHoldings : legacy.topHoldings;
  const countries =
    catalog.countries && catalog.countries.length > 0 ? catalog.countries : legacy.countries;
  const sectors = catalog.sectors && catalog.sectors.length > 0 ? catalog.sectors : legacy.sectors;
  const benefits =
    catalog.benefits && catalog.benefits.length > 0 ? catalog.benefits : legacy.benefits;

  const galleryImages = (
    catalog.galleryImages && catalog.galleryImages.length > 0
      ? catalog.galleryImages
      : legacy.galleryImages
  )?.slice(0, 3);

  const heroImage = catalog.heroImage?.trim() || legacy.heroImage?.trim() || undefined;

  const msLabel =
    catalog.morningstarRatingLabel?.trim() ||
    (catalog.morningstarRating != null ? `${catalog.morningstarRating} / 5` : undefined) ||
    (legacy.morningstarRating != null ? `${legacy.morningstarRating} / 5` : undefined) ||
    null;

  const msNum = catalog.morningstarRating ?? legacy.morningstarRating;

  return {
    ...legacy,
    name: catalog.name || legacy.name,
    manager: catalog.manager || legacy.manager,
    provider: catalog.provider || legacy.provider,
    goal: pickRichText(catalog.goal, legacy.goal),
    assets: pickRichText(catalog.assets, legacy.assets),
    yield: pickRichText(catalog.yield, legacy.yield),
    risks: pickRichText(catalog.risks, legacy.risks),
    liquidity: pickRichText(catalog.liquidity, legacy.liquidity),
    suitable: pickRichText(catalog.suitable, legacy.suitable),
    why: pickRichText(catalog.why, legacy.why),
    description: catalog.description?.trim() || legacy.description,
    strategy: catalog.strategy?.trim() || legacy.strategy,
    benefits,
    parameters: paramsClean,
    topHoldings,
    top10WeightPercent: catalog.top10WeightPercent ?? legacy.top10WeightPercent,
    totalHoldingsCount: catalog.totalHoldingsCount ?? legacy.totalHoldingsCount,
    countries,
    sectors,
    defaultRate: catalog.defaultRate ?? legacy.defaultRate,
    planningRatePercent: catalog.planningRatePercent ?? legacy.planningRatePercent ?? null,
    officialPerformanceSummary: catalog.officialPerformanceSummary || legacy.officialPerformanceSummary,
    factsheetUrl: catalog.factsheetUrl ?? legacy.factsheetUrl,
    factsheetAsOf: catalog.factsheetAsOf ?? legacy.factsheetAsOf,
    verifiedAt: catalog.verifiedAt ?? legacy.verifiedAt,
    morningstarRating: msNum,
    morningstarRatingLabel: msLabel,
    awards: mergeAwards(catalog.awards, legacy.awards),
    riskSRI: catalog.riskSRI ?? legacy.riskSRI,
    horizon: catalog.horizon ?? legacy.horizon,
    currency: catalog.currency ?? legacy.currency,
    minInvestment: catalog.minInvestment ?? legacy.minInvestment,
    category: catalog.category ?? legacy.category,
    summaryLine: catalog.summaryLine?.trim() || legacy.summaryLine?.trim() || undefined,
    heroImage,
    galleryImages,
    galleryType:
      catalog.galleryImages && catalog.galleryImages.length > 0
        ? catalog.galleryType
        : legacy.galleryType,
  };
}

function buildDetailFromBaseFund(fund: BaseFund): FundDetail {
  const planningPct = fund.planningRate ?? null;
  const planningDec =
    planningPct != null && Number.isFinite(planningPct)
      ? Math.max(0.01, Math.min(0.25, planningPct / 100))
      : 0.07;

  const officialSummary = formatOfficialPerformanceSummary(fund.officialPerformance ?? undefined);
  const ms = resolveMorningstarFromFund(fund);
  const topFromCatalog = parseTopHoldingsFromCatalogLines(fund.topHoldings);
  const thc = holdingsCountFromParameters(fund.parameters);

  let awardsStr: string | undefined;
  if (fund.awards && fund.awards.length > 0) {
    awardsStr = fund.awards.map((a) => a.trim()).filter(Boolean).join(" · ");
  }
  const perfAwards = fund.performance?.awards?.trim();
  if (perfAwards) {
    awardsStr = awardsStr ? `${awardsStr} · ${perfAwards}` : perfAwards;
  }

  const ap = fund.assets ?? {};
  const galleryRaw = (ap.galleryPaths ?? []).filter((p) => p && String(p).trim()).slice(0, 3);
  const galleryPad = [...galleryRaw];
  while (galleryPad.length < 3) galleryPad.push(FUND_PLACEHOLDER_GALLERY_PATH);
  const gallery = galleryPad.slice(0, 3);
  const hero = ap.heroPath?.trim() || FUND_PLACEHOLDER_HERO_PATH;

  const yieldLine =
    officialSummary.split("\n").find((l) => l.trim().length > 0) ||
    (fund.factsheetUrl ? "Výkonnost dle aktuálního factsheetu (odkaz níže)." : "—");

  const subcat = fund.subcategory?.trim();
  const catBase = (fund.category ?? "").trim() || "—";
  const categoryLabel = subcat ? `${catBase} · ${subcat}` : catBase;

  return {
    name: ((fund.canonicalName?.trim() || fund.displayName || "").trim() || "—"),
    summaryLine: subcat || undefined,
    manager: (fund.manager ?? fund.provider ?? "").trim() || "—",
    provider: fund.provider?.trim() || undefined,
    goal: fund.goal?.trim() || "—",
    assets: fund.strategy?.trim() || fund.category || "—",
    yield: yieldLine,
    risks: fund.risks?.trim() || "—",
    liquidity: fund.liquidity?.trim() || "—",
    suitable: fund.suitable?.trim() || "—",
    why: fund.strategy?.trim() || fund.goal?.trim() || "—",
    defaultRate: planningDec,
    planningRatePercent: planningPct,
    officialPerformanceSummary: officialSummary.trim() || undefined,
    factsheetUrl: fund.factsheetUrl ?? null,
    factsheetAsOf: fund.factsheetAsOf ?? fund.officialPerformance?.asOf ?? null,
    verifiedAt: fund.verifiedAt ?? null,
    morningstarRating: ms.rating,
    morningstarRatingLabel: ms.label ?? null,
    strategy: fund.strategy,
    description: fund.description,
    benefits: fund.benefits?.filter(Boolean),
    parameters: fund.parameters ? { ...fund.parameters } : undefined,
    topHoldings: topFromCatalog.length > 0 ? topFromCatalog : undefined,
    totalHoldingsCount: thc,
    minInvestment: fund.minInvestment ?? undefined,
    riskSRI: fund.riskSRI != null ? `${fund.riskSRI}/7` : undefined,
    horizon: fund.horizon,
    currency: fund.currency,
    awards: awardsStr,
    category: categoryLabel,
    heroImage: hero,
    galleryImages: gallery,
    galleryType: "photo",
  };
}

export function toCanonicalFundKey(raw: string | null | undefined): BaseFundKey | null {
  if (raw == null || !String(raw).trim()) return null;
  return mapLegacyFundKey(String(raw).trim());
}

export function legacyFundDetailKeyForCanonical(key: BaseFundKey): string {
  return CANONICAL_TO_LEGACY_DETAIL[key] ?? key;
}

export function getFaFundPlanningRateDecimal(productKey: string): number {
  const canonical = toCanonicalFundKey(productKey);
  if (!canonical) return 0.07;

  const fund = getBaseFundByKey(canonical);
  if (fund?.planningRate != null && Number.isFinite(fund.planningRate)) {
    return Math.max(0.01, Math.min(0.25, fund.planningRate / 100));
  }

  const legacy = CANONICAL_TO_LEGACY_DETAIL[canonical];
  if (legacy) {
    const d = FUND_DETAILS[legacy]?.defaultRate;
    if (typeof d === "number" && Number.isFinite(d)) return d;
  }

  return 0.07;
}

export function getFaFundLogoUrl(productKey: string): string | undefined {
  const canonical = toCanonicalFundKey(productKey);
  if (!canonical) return undefined;

  const fund = getBaseFundByKey(canonical);
  const catalogLogo = fund?.assets?.logoPath?.trim();
  if (catalogLogo) return catalogLogo;

  const legacy = CANONICAL_TO_LEGACY_DETAIL[canonical];
  if (legacy) {
    const logo = FUND_LOGOS[legacy];
    if (logo && logo.trim()) return logo;
  }

  return undefined;
}

/**
 * Detail pro HTML/PDF: katalog + doplnění z legacy `FUND_DETAILS` tam, kde katalog nemá strukturovaná data.
 */
export function getFaFundDetailForReport(productKey: string): FundDetail | undefined {
  const raw = String(productKey ?? "").trim();
  if (!raw) return undefined;

  const fund = getBaseFundFromProductKey(raw);
  const legacyKey = fund ? CANONICAL_TO_LEGACY_DETAIL[fund.baseFundKey] : undefined;
  const legacyFromCanonical = legacyKey ? FUND_DETAILS[legacyKey] : undefined;
  const legacyDirect = FUND_DETAILS[raw];

  if (!fund) {
    return legacyDirect ? ensureFundDetailReportAssets(legacyDirect) : undefined;
  }

  const fromCatalog = buildDetailFromBaseFund(fund);
  if (legacyFromCanonical) {
    return ensureFundDetailReportAssets(mergeReportFundDetail(fromCatalog, legacyFromCanonical));
  }
  return ensureFundDetailReportAssets(fromCatalog);
}
