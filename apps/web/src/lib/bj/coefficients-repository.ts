/**
 * Repository nad `bj_coefficients` a `career_position_coefficients`.
 *
 * Sdružuje per-tenant řádky + globální defaulty (tenant_id NULL) do jednoho
 * pole pravidel pro kalkulátor. Per-tenant řádek má přednost (v kalkulátoru
 * dostane vyšší skóre při `pickBestBjRule`).
 *
 * Výsledek se drží v procesním in-memory cache (jednorázové načtení za request),
 * aby každý POST smluv nespouštěl SELECT za řádku. Cache je tenant-scoped a
 * má TTL 60 s — žádná další invalidace není nutná, protože sazebník se mění
 * zřídka (a adminská změna se projeví do minuty).
 */

import { db } from "db";
import { bjCoefficients, careerPositionCoefficients } from "db";
import { or, isNull, eq } from "db";
import type {
  BjCoefficientRule,
  BjFormula,
} from "./calculate-bj";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_SUBTYPES,
  type ProductCategory,
  type ProductSubtype,
} from "@/lib/ai/product-categories";

const PRODUCT_CATEGORY_SET = new Set<string>(PRODUCT_CATEGORIES);
const PRODUCT_SUBTYPE_SET = new Set<string>(PRODUCT_SUBTYPES);
const VALID_FORMULAS: ReadonlySet<BjFormula> = new Set<BjFormula>([
  "entry_fee",
  "client_contribution",
  "annual_premium",
  "loan_principal",
  "investment_amount",
]);

const CACHE_TTL_MS = 60_000;
type CacheEntry<T> = { value: T; expiresAt: number };
const rulesCache = new Map<string, CacheEntry<BjCoefficientRule[]>>();
const positionsCache = new Map<string, CacheEntry<CareerPositionRow[]>>();

export type CareerPositionRow = {
  positionKey: string;
  positionLabel: string;
  positionLevel: number;
  bjValueCzk: number;
  bjThreshold: number | null;
  meta: Record<string, unknown> | null;
  tenantScope: "global" | "tenant";
};

/**
 * Načte všechna BJ pravidla relevantní pro tento tenant (global + tenant override).
 *
 * Vrací pole už v typovém tvaru pro kalkulátor — numeric → number, string → enum.
 * Řádky s neznámou kategorií / formulí tiše vyfiltruje (defensive).
 */
export async function loadBjCoefficientRules(tenantId: string | null): Promise<BjCoefficientRule[]> {
  const cacheKey = tenantId ?? "__global__";
  const cached = rulesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const whereClause = tenantId
    ? or(isNull(bjCoefficients.tenantId), eq(bjCoefficients.tenantId, tenantId))
    : isNull(bjCoefficients.tenantId);

  const rows = await db
    .select({
      tenantId: bjCoefficients.tenantId,
      productCategory: bjCoefficients.productCategory,
      partnerPattern: bjCoefficients.partnerPattern,
      subtype: bjCoefficients.subtype,
      formula: bjCoefficients.formula,
      coefficient: bjCoefficients.coefficient,
      divisor: bjCoefficients.divisor,
      cap: bjCoefficients.cap,
      floor: bjCoefficients.floor,
      note: bjCoefficients.note,
    })
    .from(bjCoefficients)
    .where(whereClause);

  const mapped: BjCoefficientRule[] = [];
  for (const r of rows) {
    if (!PRODUCT_CATEGORY_SET.has(r.productCategory)) continue;
    if (!VALID_FORMULAS.has(r.formula as BjFormula)) continue;
    if (r.subtype && !PRODUCT_SUBTYPE_SET.has(r.subtype)) continue;

    const coefficient = r.coefficient == null ? null : Number(r.coefficient);
    const divisor = r.divisor == null ? null : Number(r.divisor);
    if (coefficient == null && divisor == null) continue;

    mapped.push({
      productCategory: r.productCategory as ProductCategory,
      partnerPattern: r.partnerPattern,
      subtype: (r.subtype as ProductSubtype) ?? null,
      formula: r.formula as BjFormula,
      coefficient,
      divisor,
      cap: r.cap == null ? null : Number(r.cap),
      floor: r.floor == null ? null : Number(r.floor),
      tenantScope: r.tenantId ? "tenant" : "global",
      note: r.note ?? null,
    });
  }

  rulesCache.set(cacheKey, { value: mapped, expiresAt: Date.now() + CACHE_TTL_MS });
  return mapped;
}

/**
 * Načte všechny kariérní pozice relevantní pro tento tenant (global + tenant override).
 *
 * Pokud existuje tenant-specific řádek se stejným `positionKey`, přepíše globální
 * (per-tenant má přednost).
 */
export async function loadCareerPositions(tenantId: string | null): Promise<CareerPositionRow[]> {
  const cacheKey = tenantId ?? "__global__";
  const cached = positionsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const whereClause = tenantId
    ? or(isNull(careerPositionCoefficients.tenantId), eq(careerPositionCoefficients.tenantId, tenantId))
    : isNull(careerPositionCoefficients.tenantId);

  const rows = await db
    .select({
      tenantId: careerPositionCoefficients.tenantId,
      positionKey: careerPositionCoefficients.positionKey,
      positionLabel: careerPositionCoefficients.positionLabel,
      positionLevel: careerPositionCoefficients.positionLevel,
      bjValueCzk: careerPositionCoefficients.bjValueCzk,
      bjThreshold: careerPositionCoefficients.bjThreshold,
      meta: careerPositionCoefficients.meta,
    })
    .from(careerPositionCoefficients)
    .where(whereClause);

  const byKey = new Map<string, CareerPositionRow>();
  for (const r of rows) {
    const entry: CareerPositionRow = {
      positionKey: r.positionKey,
      positionLabel: r.positionLabel,
      positionLevel: r.positionLevel,
      bjValueCzk: Number(r.bjValueCzk),
      bjThreshold: r.bjThreshold == null ? null : Number(r.bjThreshold),
      meta: (r.meta as Record<string, unknown> | null) ?? null,
      tenantScope: r.tenantId ? "tenant" : "global",
    };
    const existing = byKey.get(r.positionKey);
    if (!existing || (entry.tenantScope === "tenant" && existing.tenantScope === "global")) {
      byKey.set(r.positionKey, entry);
    }
  }

  const list = Array.from(byKey.values()).sort((a, b) => a.positionLevel - b.positionLevel);
  positionsCache.set(cacheKey, { value: list, expiresAt: Date.now() + CACHE_TTL_MS });
  return list;
}

/** Najde jednu pozici podle klíče (T1, D3, …) pro přepočet BJ → Kč. */
export async function findCareerPosition(
  tenantId: string | null,
  positionKey: string | null | undefined,
): Promise<CareerPositionRow | null> {
  if (!positionKey) return null;
  const all = await loadCareerPositions(tenantId);
  return all.find((p) => p.positionKey === positionKey) ?? null;
}

/** Invalidate the cache (volá se po admin PATCH na sazebník). */
export function clearBjCache(): void {
  rulesCache.clear();
  positionsCache.clear();
}
