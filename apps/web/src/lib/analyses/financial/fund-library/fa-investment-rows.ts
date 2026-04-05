/**
 * Řádky investičního kroku FA podle fondové knihovny (tenant + poradce + availability).
 */

import { BASE_FUNDS } from "./base-funds";
import type { BaseFundKey } from "./legacy-fund-key-map";
import { BASE_FUND_KEYS, mapLegacyFundKey } from "./legacy-fund-key-map";
import type { FundAvailabilityTag } from "./types";
import type { InvestmentEntry } from "@/lib/analyses/financial/types";
import type { FundLibrarySetupSnapshot } from "@/lib/fund-library/fund-library-setup-types";
import { getFaFundPlanningRateDecimal } from "./fa-fund-bridge";

/** Typy investice ve strategii — odpovídají skupinám jednorázové / pravidelné / penzijní. */
export const FA_INVESTMENT_TYPES_BY_KEY: Record<BaseFundKey, readonly ("lump" | "monthly" | "pension")[]> = {
  ishares_core_msci_world: ["lump", "monthly"],
  ishares_core_sp_500: ["lump", "monthly"],
  vanguard_ftse_emerging_markets: ["lump", "monthly"],
  ishares_core_global_aggregate_bond: ["lump", "monthly"],
  fidelity_target_2040: ["lump", "monthly"],
  investika_realitni_fond: ["lump", "monthly"],
  monetika: ["lump", "monthly"],
  efektika: ["lump", "monthly"],
  conseq_globalni_akciovy_ucastnicky: ["pension"],
  nn_povinny_konzervativni: ["pension"],
  nn_vyvazeny: ["pension"],
  nn_rustovy: ["pension"],
  creif: ["lump"],
  atris: ["lump", "monthly"],
  penta: ["lump"],
};

const CATALOG_ORDER = [...BASE_FUND_KEYS] as string[];

function sortKeysByAdvisorOrder(order: string[], keys: string[]): string[] {
  const set = new Set(keys);
  const primary = order.filter((k) => set.has(k));
  const rest = keys.filter((k) => !primary.includes(k));
  rest.sort((a, b) => {
    const ia = CATALOG_ORDER.indexOf(a);
    const ib = CATALOG_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return [...primary, ...rest];
}

function defaultYearsForType(type: "lump" | "monthly" | "pension"): number {
  if (type === "pension") return 30;
  if (type === "monthly") return 20;
  return 10;
}

let idSeq = 1;
function nextId(): number {
  idSeq += 1;
  return Date.now() + idSeq;
}

/** Snapshot bez DB: všechny aktivní fondy, vše zapnuté (záloha při chybě serveru). */
export function buildOfflineFundLibrarySnapshot(): FundLibrarySetupSnapshot {
  const catalogKeys = BASE_FUNDS.filter((f) => f.isActive).map((f) => f.baseFundKey);
  const order = sortKeysByAdvisorOrder([...CATALOG_ORDER], [...catalogKeys]);
  return {
    canEditTenantAllowlist: false,
    tenantAllowlist: { allowedBaseFundKeys: null },
    advisorPrefs: { order, enabled: {} },
    effectiveAllowedKeys: catalogKeys,
    catalog: BASE_FUNDS.filter((f) => f.isActive).map((f) => ({
      baseFundKey: f.baseFundKey,
      displayName: f.displayName,
      provider: f.provider,
      category: f.category,
      subcategory: f.subcategory,
      logoPath: f.assets.logoPath,
    })),
  };
}

function fundAvailabilityTag(includeCompany: boolean): FundAvailabilityTag {
  return includeCompany ? "company_fa" : "personal_fa";
}

/**
 * Šablona řádků podle snapshotu (částky 0 — sloučí se v reconcile).
 */
export function buildFaInvestmentTemplate(
  snapshot: FundLibrarySetupSnapshot,
  includeCompany: boolean,
): InvestmentEntry[] {
  const tag = fundAvailabilityTag(includeCompany);
  const catalogByKey = new Map(BASE_FUNDS.map((f) => [f.baseFundKey, f]));

  const candidateKeys = sortKeysByAdvisorOrder(snapshot.advisorPrefs.order, [...snapshot.effectiveAllowedKeys]).filter(
    (k) => snapshot.effectiveAllowedKeys.includes(k),
  );

  const rows: InvestmentEntry[] = [];
  for (const key of candidateKeys) {
    if (snapshot.advisorPrefs.enabled[key] === false) continue;

    const fund = catalogByKey.get(key as BaseFundKey);
    if (!fund?.isActive) continue;
    if (!fund.availability.includes(tag)) continue;

    const modes = FA_INVESTMENT_TYPES_BY_KEY[key as BaseFundKey];
    if (!modes?.length) continue;

    const rate = getFaFundPlanningRateDecimal(key);
    for (const type of modes) {
      rows.push({
        id: nextId(),
        productKey: key,
        type,
        amount: 0,
        years: defaultYearsForType(type),
        annualRate: rate,
        computed: { fv: 0 },
      });
    }
  }

  return rows;
}

function rowShapeKey(rows: InvestmentEntry[]): string {
  return rows.map((r) => `${r.productKey}:${r.type}`).join("|");
}

/**
 * Sloučí uložené řádky se šablonou podle knihovny (stejné productKey+type → zachová id, částky, roky, sazbu).
 *
 * **Edge case:** Když `buildFaInvestmentTemplate` vrátí prázdné pole (žádný povolený fond, všechny vypnuté,
 * nebo prázdný `effectiveAllowedKeys`), výsledek je `[]` — investice v UI se vyprázdní. Uložená analýza v DB
 * se při dalším uložení přepíše; obnovení řádků po opětovném zapnutí fondů závisí na snapshotu.
 */
export function reconcileFaInvestmentsWithSnapshot(
  current: InvestmentEntry[],
  snapshot: FundLibrarySetupSnapshot,
  includeCompany: boolean,
): InvestmentEntry[] {
  const normalized: InvestmentEntry[] = [];
  for (const inv of current) {
    const c = mapLegacyFundKey(inv.productKey);
    if (!c) continue;
    normalized.push({ ...inv, productKey: c });
  }

  const template = buildFaInvestmentTemplate(snapshot, includeCompany);
  if (template.length === 0) {
    return [];
  }

  const byPair = new Map<string, InvestmentEntry>();
  for (const inv of normalized) {
    byPair.set(`${inv.productKey}:${inv.type}`, inv);
  }

  return template.map((t) => {
    const existing = byPair.get(`${t.productKey}:${t.type}`);
    if (!existing) return t;
    return {
      ...t,
      id: existing.id,
      amount: existing.amount,
      years: existing.years,
      annualRate: existing.annualRate,
      computed: existing.computed ?? t.computed,
    };
  });
}

export function faInvestmentShapeMatches(a: InvestmentEntry[], b: InvestmentEntry[]): boolean {
  return rowShapeKey(a) === rowShapeKey(b);
}
