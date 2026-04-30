"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import { hasPermission } from "@/lib/auth/permissions";
import { assertCapabilityForAction } from "@/lib/billing/server-action-plan-guard";
import { advisorBusinessPlans, advisorBusinessPlanTargets, contracts, SEGMENT_LABELS } from "db";
import { eq, and, sql } from "db";
import {
  getSegmentUiGroup,
  type ContractSegmentUiGroup,
} from "@/lib/contracts/contract-segment-wizard-config";
import { advisorPreferences } from "db";
import { findCareerPosition } from "@/lib/bj/coefficients-repository";
import {
  aggregateProductionContracts,
  getProductionBasisLabel,
  mapProductionContract,
  type ClientAmountType,
  type ProductionBasis,
  type ProductionCalculationStatus,
  type ProductionCalculationTrace,
  type ProductionContractReadModel,
} from "@/lib/production/production-read-model";
import type { ContractBjCalculation, PortfolioAttributes } from "db";

export type PeriodType = "month" | "quarter" | "year";

export type ProductionRow = {
  segment: string;
  segmentLabel: string;
  /** UI skupina pro agregaci produkce (pojištění / investice / úvěry). */
  group: ContractSegmentUiGroup;
  partnerName: string | null;
  /** Součet klientských vstupů v řádku. Není to produkce. */
  clientAmountTotal: number;
  /** Pomocný roční ekvivalent klientských plateb. Není to produkce. */
  clientAnnualEquivalentTotal: number;
  /** Součet katalogově vypočtených BJ. Jediná produkční hodnota. */
  productionBj: number;
  totalPremium: number;
  totalAnnual: number;
  count: number;
  /** Součet BJ za tuto dvojici segment + partner (nebo 0, pokud nejsou spočítané). */
  bjUnits: number;
  calculatedCount: number;
  missingRuleCount: number;
  manualReviewCount: number;
  productionWarnings: string[];
};

/**
 * Přehled kariérní pozice pro produkční report — používá se k přepočtu
 * BJ součtu na Kč a k zobrazení, jakou sazbu vlastně aplikujeme.
 */
export type ProductionCareerPositionInfo = {
  positionKey: string;
  positionLabel: string;
  /** Hodnota ze sazebníku pozice (před osobní výjimkou). */
  bjBaseValueCzk: number;
  /** Osobní příplatek z advisor_preferences (Kč / BJ). */
  bjBonusCzk: number;
  /** Účinná sazba: základ + příplatek. */
  bjValueCzk: number;
} | null;

function parseCareerBjBonusCzk(v: unknown): number {
  if (v == null || v === "") return 0;
  const raw = typeof v === "string" ? String(v).trim().replace(",", ".") : v;
  const n = typeof raw === "string" ? Number(raw) : Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export type ProductionSummary = {
  rows: ProductionRow[];
  contracts: ProductionContractReadModel[];
  /** Součet klientských vstupů. Kontext, nikdy produkce. */
  totalClientAmount: number;
  /** Pomocný roční ekvivalent klientských plateb. Kontext, nikdy produkce. */
  totalClientAnnualEquivalent: number;
  /** Celková produkce v BJ podle katalogu. */
  totalProductionBj: number;
  targetBj: number | null;
  targetProgressPct: number | null;
  calculatedCount: number;
  missingRuleCount: number;
  manualReviewCount: number;
  /** Legacy aliases — zachováno kvůli starším komponentám, ale neznamená produkci. */
  totalPremium: number;
  totalAnnual: number;
  totalCount: number;
  /** Kontextové agregáty klientských vstupů podle skupin. Nejsou produkce. */
  totalInsurancePremium: number;
  totalInsuranceAnnual: number;
  totalInsuranceCount: number;
  totalInvestment: number;
  totalInvestmentAnnual: number;
  totalInvestmentCount: number;
  totalLending: number;
  totalLendingCount: number;
  /** Legacy alias pro `totalProductionBj`. */
  totalBjUnits: number;
  /** Přepočet `totalBjUnits × (základ + výjimka)` nebo `null`, pokud poradce nemá nastavenou pozici. */
  totalBjCzk: number | null;
  /** Aktuálně nastavená kariérní pozice poradce (nebo null). */
  careerPosition: ProductionCareerPositionInfo;
  periodLabel: string;
};

/**
 * Detekce chybějícího sloupce / tabulky v Postgres.
 * Vrací `true`, pokud chyba pochází z neprovedené migrace (PG code 42703 / 42P01)
 * nebo zprávy typu „column … does not exist". Používá se v produkčním reportu
 * pro čitelný error state místo technického stack trace.
 */
function isMissingSchemaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === "42703" || e.code === "42P01") return true;
  const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
  return (
    msg.includes("column") && msg.includes("does not exist")
  ) || (msg.includes("relation") && msg.includes("does not exist"));
}

const MISSING_SCHEMA_HINT =
  "Produkce zatím není dopojená: databázi chybí sloupec (pravděpodobně `contracts.bj_units` / `contracts.advisor_confirmed_at` / `advisor_preferences.career_bj_bonus_czk`). " +
  "Spusť SQL migrace `add_bj_units_on_contracts_2026-04-21.sql` a `advisor_preferences_career_bj_bonus_2026-04-20.sql` v Supabase SQL Editoru.";

function contractProductionDateGte(dateStr: string) {
  return sql`(CASE
    WHEN ${contracts.sourceKind} = 'ai_review'
      THEN COALESCE(${contracts.advisorConfirmedAt}::date, ${contracts.startDate}::date)
    ELSE ${contracts.startDate}::date
  END) >= ${dateStr}`;
}

function contractProductionDateLt(dateStr: string) {
  return sql`(CASE
    WHEN ${contracts.sourceKind} = 'ai_review'
      THEN COALESCE(${contracts.advisorConfirmedAt}::date, ${contracts.startDate}::date)
    ELSE ${contracts.startDate}::date
  END) < ${dateStr}`;
}

function getPeriodRange(period: PeriodType, refDate?: string): { start: Date; end: Date; label: string; year: number; periodNumber: number } {
  const ref = refDate ? new Date(refDate) : new Date();
  const y = ref.getFullYear();
  const m = ref.getMonth();

  if (period === "month") {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 1);
    const label = `${start.toLocaleString("cs-CZ", { month: "long" })} ${y}`;
    return { start, end, label, year: y, periodNumber: m + 1 };
  }
  if (period === "quarter") {
    const q = Math.floor(m / 3);
    const start = new Date(y, q * 3, 1);
    const end = new Date(y, q * 3 + 3, 1);
    return { start, end, label: `Q${q + 1} ${y}`, year: y, periodNumber: q + 1 };
  }
  const start = new Date(y, 0, 1);
  const end = new Date(y + 1, 0, 1);
  return { start, end, label: `${y}`, year: y, periodNumber: 0 };
}

async function getProductionTargetBj(params: {
  auth: Awaited<ReturnType<typeof requireAuthInAction>>;
  tenantId: string;
  userId: string;
  period: PeriodType;
  year: number;
  periodNumber: number;
}): Promise<number | null> {
  const rows = await withTenantContextFromAuth(
    params.auth,
    async (tx) =>
      tx
        .select({ targetValue: advisorBusinessPlanTargets.targetValue })
        .from(advisorBusinessPlans)
        .innerJoin(advisorBusinessPlanTargets, eq(advisorBusinessPlanTargets.planId, advisorBusinessPlans.id))
        .where(
          and(
            eq(advisorBusinessPlans.tenantId, params.tenantId),
            eq(advisorBusinessPlans.userId, params.userId),
            eq(advisorBusinessPlans.periodType, params.period),
            eq(advisorBusinessPlans.year, params.year),
            eq(advisorBusinessPlans.periodNumber, params.periodNumber),
            eq(advisorBusinessPlans.status, "active"),
            eq(advisorBusinessPlanTargets.metricType, "production"),
          )
        )
        .limit(1),
  );
  const value = rows[0]?.targetValue == null ? null : Number(rows[0].targetValue);
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

export async function getProductionSummary(
  period: PeriodType = "month",
  refDate?: string
): Promise<ProductionSummary> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  await assertCapabilityForAction(auth, "team_production");

  const { start, end, label, year, periodNumber } = getPeriodRange(period, refDate);

  let rows: Array<{
    id: string;
    contactId: string;
    segment: string;
    partnerName: string | null;
    productName: string | null;
    contractNumber: string | null;
    startDate: string | null;
    productionDate: string | null;
    premiumAmount: string | null;
    premiumAnnual: string | null;
    portfolioAttributes: PortfolioAttributes | null;
    bjUnits: string | null;
    bjCalculation: ContractBjCalculation | null;
  }>;
  try {
    rows = await withTenantContextFromAuth(auth, async (tx) =>
      tx
        .select({
          id: contracts.id,
          contactId: contracts.contactId,
          segment: contracts.segment,
          partnerName: contracts.partnerName,
          productName: contracts.productName,
          contractNumber: contracts.contractNumber,
          startDate: contracts.startDate,
          productionDate: sql<string>`CASE
            WHEN ${contracts.sourceKind} = 'ai_review'
              THEN COALESCE(${contracts.advisorConfirmedAt}::date::text, ${contracts.startDate})
            ELSE ${contracts.startDate}
          END`,
          premiumAmount: contracts.premiumAmount,
          premiumAnnual: contracts.premiumAnnual,
          portfolioAttributes: contracts.portfolioAttributes,
          bjUnits: contracts.bjUnits,
          bjCalculation: contracts.bjCalculation,
        })
        .from(contracts)
        .where(
          and(
            eq(contracts.tenantId, auth.tenantId),
            eq(contracts.advisorId, auth.userId),
            contractProductionDateGte(start.toISOString().slice(0, 10)),
            contractProductionDateLt(end.toISOString().slice(0, 10))
          )
        )
        .orderBy(sql`CASE
          WHEN ${contracts.sourceKind} = 'ai_review'
            THEN COALESCE(${contracts.advisorConfirmedAt}::date, ${contracts.startDate}::date)
          ELSE ${contracts.startDate}::date
        END`, contracts.segment, contracts.partnerName),
    );
  } catch (err) {
    if (isMissingSchemaError(err)) throw new Error(MISSING_SCHEMA_HINT);
    throw err;
  }

  const contractModels = rows.map((r) =>
    mapProductionContract({
      id: r.id,
      contactId: r.contactId,
      segment: r.segment,
      segmentLabel: SEGMENT_LABELS[r.segment] ?? r.segment,
      group: getSegmentUiGroup(r.segment),
      partnerName: r.partnerName,
      productName: r.productName,
      contractNumber: r.contractNumber,
      startDate: r.startDate,
      productionDate: r.productionDate,
      premiumAmount: r.premiumAmount,
      premiumAnnual: r.premiumAnnual,
      portfolioAttributes: r.portfolioAttributes,
      bjUnits: r.bjUnits,
      bjCalculation: r.bjCalculation,
    })
  );
  const aggregation = aggregateProductionContracts(contractModels);
  const mapped: ProductionRow[] = aggregation.rows.map((r) => ({
    ...r,
    totalPremium: r.clientAmountTotal,
    totalAnnual: r.clientAnnualEquivalentTotal,
    bjUnits: r.productionBj,
  }));

  const insurance = mapped.filter((r) => r.group === "insurance");
  const investment = mapped.filter((r) => r.group === "investment");
  const lending = mapped.filter((r) => r.group === "lending");
  const totalBjUnits = aggregation.totalProductionBj;

  // Přepočet BJ → Kč podle kariérní pozice. Pokud poradce pozici nemá nastavenou,
  // necháme `totalBjCzk = null`, aby UI ukázalo „nezadána pozice" místo nesmyslné nuly.
  let prefRow:
    | { careerPositionKey: string | null; careerBjBonusCzk: string | null }
    | undefined;
  try {
    [prefRow] = await withTenantContextFromAuth(auth, async (tx) =>
      tx
        .select({
          careerPositionKey: advisorPreferences.careerPositionKey,
          careerBjBonusCzk: advisorPreferences.careerBjBonusCzk,
        })
        .from(advisorPreferences)
        .where(and(eq(advisorPreferences.tenantId, auth.tenantId), eq(advisorPreferences.userId, auth.userId)))
        .limit(1),
    );
  } catch (err) {
    if (isMissingSchemaError(err)) throw new Error(MISSING_SCHEMA_HINT);
    throw err;
  }
  const careerRow = await findCareerPosition(auth.tenantId, prefRow?.careerPositionKey ?? null);
  const bjBonusCzk = parseCareerBjBonusCzk(prefRow?.careerBjBonusCzk ?? null);
  const careerPosition: ProductionCareerPositionInfo = careerRow
    ? {
        positionKey: careerRow.positionKey,
        positionLabel: careerRow.positionLabel,
        bjBaseValueCzk: careerRow.bjValueCzk,
        bjBonusCzk,
        bjValueCzk: roundCzk(careerRow.bjValueCzk + bjBonusCzk),
      }
    : null;
  const totalBjCzk = careerRow ? roundCzk(totalBjUnits * (careerRow.bjValueCzk + bjBonusCzk)) : null;
  let targetBj: number | null = null;
  try {
    targetBj = await getProductionTargetBj({
      auth,
      tenantId: auth.tenantId,
      userId: auth.userId,
      period,
      year,
      periodNumber,
    });
  } catch (err) {
    if (isMissingSchemaError(err)) throw new Error(MISSING_SCHEMA_HINT);
    throw err;
  }
  const targetProgressPct = targetBj && targetBj > 0 ? Math.round((totalBjUnits / targetBj) * 100) : null;

  return {
    rows: mapped,
    contracts: aggregation.contracts,
    totalClientAmount: aggregation.totalClientAmount,
    totalClientAnnualEquivalent: aggregation.totalClientAnnualEquivalent,
    totalProductionBj: totalBjUnits,
    targetBj,
    targetProgressPct,
    calculatedCount: aggregation.calculatedCount,
    missingRuleCount: aggregation.missingRuleCount,
    manualReviewCount: aggregation.manualReviewCount,
    totalPremium: aggregation.totalClientAmount,
    totalAnnual: aggregation.totalClientAnnualEquivalent,
    totalCount: aggregation.totalCount,
    totalInsurancePremium: insurance.reduce((s, r) => s + r.totalPremium, 0),
    totalInsuranceAnnual: insurance.reduce((s, r) => s + r.totalAnnual, 0),
    totalInsuranceCount: insurance.reduce((s, r) => s + r.count, 0),
    totalInvestment: investment.reduce((s, r) => s + r.totalPremium, 0),
    totalInvestmentAnnual: investment.reduce((s, r) => s + r.totalAnnual, 0),
    totalInvestmentCount: investment.reduce((s, r) => s + r.count, 0),
    totalLending: lending.reduce((s, r) => s + r.totalPremium, 0),
    totalLendingCount: lending.reduce((s, r) => s + r.count, 0),
    totalBjUnits,
    totalBjCzk,
    careerPosition,
    periodLabel: label,
  };
}

/** Zaokrouhlí CZK na dvě desetinná místa (BJ × sazba může dát necelé haléře). */
function roundCzk(n: number): number {
  return Math.round(n * 100) / 100;
}

export type ContractInPeriodRow = {
  id: string;
  contactId: string;
  segment: string;
  segmentLabel: string;
  group: ContractSegmentUiGroup;
  partnerName: string | null;
  productName: string | null;
  contractNumber: string | null;
  startDate: string | null;
  productionDate: string | null;
  clientAmount: number | null;
  clientAmountType: ClientAmountType;
  clientAmountLabel: string;
  productionBj: number | null;
  productionRuleId: string | null;
  productionRuleName: string | null;
  productionBasis: ProductionBasis;
  productionBasisLabel: string;
  productionCalculationTrace: ProductionCalculationTrace;
  isProductionCalculated: boolean;
  productionWarnings: string[];
  calculationStatus: ProductionCalculationStatus;
  premiumAmount: number;
  premiumAnnual: number;
};

/** Contracts in the given period (for drill-down from production). */
export async function getContractsForPeriod(
  period: PeriodType = "month",
  refDate?: string
): Promise<{ rows: ContractInPeriodRow[]; periodLabel: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  await assertCapabilityForAction(auth, "team_production");

  const { start, end, label } = getPeriodRange(period, refDate);

  let rows: Array<{
    id: string;
    contactId: string;
    segment: string;
    partnerName: string | null;
    productName: string | null;
    contractNumber: string | null;
    startDate: string | null;
    productionDate: string | null;
    premiumAmount: string | null;
    premiumAnnual: string | null;
    portfolioAttributes: PortfolioAttributes | null;
    bjUnits: string | null;
    bjCalculation: ContractBjCalculation | null;
  }>;
  try {
    rows = await withTenantContextFromAuth(auth, async (tx) =>
      tx
        .select({
          id: contracts.id,
          contactId: contracts.contactId,
          segment: contracts.segment,
          partnerName: contracts.partnerName,
          productName: contracts.productName,
          contractNumber: contracts.contractNumber,
          startDate: contracts.startDate,
          productionDate: sql<string>`CASE
        WHEN ${contracts.sourceKind} = 'ai_review'
          THEN COALESCE(${contracts.advisorConfirmedAt}::date::text, ${contracts.startDate})
        ELSE ${contracts.startDate}
      END`,
          premiumAmount: contracts.premiumAmount,
          premiumAnnual: contracts.premiumAnnual,
          portfolioAttributes: contracts.portfolioAttributes,
          bjUnits: contracts.bjUnits,
          bjCalculation: contracts.bjCalculation,
        })
        .from(contracts)
        .where(
          and(
            eq(contracts.tenantId, auth.tenantId),
            eq(contracts.advisorId, auth.userId),
            contractProductionDateGte(start.toISOString().slice(0, 10)),
            contractProductionDateLt(end.toISOString().slice(0, 10))
          )
        )
        .orderBy(sql`CASE
      WHEN ${contracts.sourceKind} = 'ai_review'
        THEN COALESCE(${contracts.advisorConfirmedAt}::date, ${contracts.startDate}::date)
      ELSE ${contracts.startDate}::date
    END`, contracts.segment),
    );
  } catch (err) {
    if (isMissingSchemaError(err)) throw new Error(MISSING_SCHEMA_HINT);
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.withScope((scope) => {
        scope.setTag("action", "getContractsForPeriod");
        scope.setContext("production", {
          period,
          refDate: refDate ?? null,
          tenantId: auth.tenantId,
          userId: auth.userId,
        });
        Sentry.captureException(err);
      });
    } catch {
      /* Sentry best-effort */
    }
    throw err;
  }

  const mapped: ContractInPeriodRow[] = rows.map((r) => {
    const model = mapProductionContract({
      id: r.id,
      contactId: r.contactId,
      segment: r.segment,
      segmentLabel: SEGMENT_LABELS[r.segment] ?? r.segment,
      group: getSegmentUiGroup(r.segment),
      partnerName: r.partnerName,
      productName: r.productName,
      contractNumber: r.contractNumber,
      startDate: r.startDate,
      productionDate: r.productionDate,
      premiumAmount: r.premiumAmount,
      premiumAnnual: r.premiumAnnual,
      portfolioAttributes: r.portfolioAttributes,
      bjUnits: r.bjUnits,
      bjCalculation: r.bjCalculation,
    });
    return {
      ...model,
      productionBasisLabel: getProductionBasisLabel(model.productionBasis),
    };
  });

  return { rows: mapped, periodLabel: label };
}
