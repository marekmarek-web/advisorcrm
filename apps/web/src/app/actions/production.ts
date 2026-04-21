"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { assertCapabilityForAction } from "@/lib/billing/server-action-plan-guard";
import { db } from "db";
import { contracts, SEGMENT_LABELS } from "db";
import { eq, and, gte, lt, sql } from "db";
import {
  getSegmentUiGroup,
  type ContractSegmentUiGroup,
} from "@/lib/contracts/contract-segment-wizard-config";
import { advisorPreferences } from "db";
import { findCareerPosition } from "@/lib/bj/coefficients-repository";

export type PeriodType = "month" | "quarter" | "year";

export type ProductionRow = {
  segment: string;
  segmentLabel: string;
  /** UI skupina pro agregaci produkce (pojištění / investice / úvěry). */
  group: ContractSegmentUiGroup;
  partnerName: string | null;
  totalPremium: number;
  totalAnnual: number;
  count: number;
  /** Součet BJ za tuto dvojici segment + partner (nebo 0, pokud nejsou spočítané). */
  bjUnits: number;
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
  /** Legacy — součet všech `premiumAmount` napříč segmenty (pro zpětnou kompatibilitu UI). */
  totalPremium: number;
  totalAnnual: number;
  totalCount: number;
  /** Nové agregáty: pojistné (ZP/MAJ/ODP/AUTO/CEST/FIRMA_POJ) */
  totalInsurancePremium: number;
  totalInsuranceAnnual: number;
  totalInsuranceCount: number;
  /** Nové agregáty: investice (INV/DIP/DPS) */
  totalInvestment: number;
  totalInvestmentAnnual: number;
  totalInvestmentCount: number;
  /** Nové agregáty: úvěry / hypotéky (HYPO/UVER) */
  totalLending: number;
  totalLendingCount: number;
  /** Celkový součet BJ za období (napříč segmenty). */
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

function getPeriodRange(period: PeriodType, refDate?: string): { start: Date; end: Date; label: string } {
  const ref = refDate ? new Date(refDate) : new Date();
  const y = ref.getFullYear();
  const m = ref.getMonth();

  if (period === "month") {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 1);
    const label = `${start.toLocaleString("cs-CZ", { month: "long" })} ${y}`;
    return { start, end, label };
  }
  if (period === "quarter") {
    const q = Math.floor(m / 3);
    const start = new Date(y, q * 3, 1);
    const end = new Date(y, q * 3 + 3, 1);
    return { start, end, label: `Q${q + 1} ${y}` };
  }
  const start = new Date(y, 0, 1);
  const end = new Date(y + 1, 0, 1);
  return { start, end, label: `${y}` };
}

export async function getProductionSummary(
  period: PeriodType = "month",
  refDate?: string
): Promise<ProductionSummary> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read")) throw new Error("Forbidden");
  await assertCapabilityForAction(auth, "team_production");

  const { start, end, label } = getPeriodRange(period, refDate);

  let rows: Array<{
    segment: string;
    partnerName: string | null;
    totalPremium: number | string;
    totalAnnual: number | string;
    totalBjUnits: number | string | null;
    count: number;
  }>;
  try {
    rows = await db
      .select({
        segment: contracts.segment,
        partnerName: contracts.partnerName,
        totalPremium: sql<number>`coalesce(sum(${contracts.premiumAmount}::numeric), 0)`,
        totalAnnual: sql<number>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)`,
        totalBjUnits: sql<number>`coalesce(sum(${contracts.bjUnits}::numeric), 0)`,
        count: sql<number>`count(*)::int`,
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
      .groupBy(contracts.segment, contracts.partnerName)
      .orderBy(contracts.segment, contracts.partnerName);
  } catch (err) {
    if (isMissingSchemaError(err)) throw new Error(MISSING_SCHEMA_HINT);
    throw err;
  }

  const mapped: ProductionRow[] = rows.map((r) => ({
    segment: r.segment,
    segmentLabel: SEGMENT_LABELS[r.segment] ?? r.segment,
    group: getSegmentUiGroup(r.segment),
    partnerName: r.partnerName,
    totalPremium: Number(r.totalPremium),
    totalAnnual: Number(r.totalAnnual),
    bjUnits: Number(r.totalBjUnits ?? 0),
    count: Number(r.count),
  }));

  const insurance = mapped.filter((r) => r.group === "insurance");
  const investment = mapped.filter((r) => r.group === "investment");
  const lending = mapped.filter((r) => r.group === "lending");
  const totalBjUnits = mapped.reduce((s, r) => s + r.bjUnits, 0);

  // Přepočet BJ → Kč podle kariérní pozice. Pokud poradce pozici nemá nastavenou,
  // necháme `totalBjCzk = null`, aby UI ukázalo „nezadána pozice" místo nesmyslné nuly.
  let prefRow:
    | { careerPositionKey: string | null; careerBjBonusCzk: string | null }
    | undefined;
  try {
    [prefRow] = await db
      .select({
        careerPositionKey: advisorPreferences.careerPositionKey,
        careerBjBonusCzk: advisorPreferences.careerBjBonusCzk,
      })
      .from(advisorPreferences)
      .where(and(eq(advisorPreferences.tenantId, auth.tenantId), eq(advisorPreferences.userId, auth.userId)))
      .limit(1);
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

  return {
    rows: mapped,
    totalPremium: mapped.reduce((s, r) => s + r.totalPremium, 0),
    totalAnnual: mapped.reduce((s, r) => s + r.totalAnnual, 0),
    totalCount: mapped.reduce((s, r) => s + r.count, 0),
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
  partnerName: string | null;
  contractNumber: string | null;
  startDate: string | null;
  productionDate: string | null;
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
    contractNumber: string | null;
    startDate: string | null;
    productionDate: string | null;
    premiumAmount: string | null;
    premiumAnnual: string | null;
  }>;
  try {
    rows = await db
    .select({
      id: contracts.id,
      contactId: contracts.contactId,
      segment: contracts.segment,
      partnerName: contracts.partnerName,
      contractNumber: contracts.contractNumber,
      startDate: contracts.startDate,
      productionDate: sql<string>`CASE
        WHEN ${contracts.sourceKind} = 'ai_review'
          THEN COALESCE(${contracts.advisorConfirmedAt}::date::text, ${contracts.startDate})
        ELSE ${contracts.startDate}
      END`,
      premiumAmount: contracts.premiumAmount,
      premiumAnnual: contracts.premiumAnnual,
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
    END`, contracts.segment);
  } catch (err) {
    if (isMissingSchemaError(err)) throw new Error(MISSING_SCHEMA_HINT);
    throw err;
  }

  const mapped: ContractInPeriodRow[] = rows.map((r) => ({
    id: r.id,
    contactId: r.contactId,
    segment: r.segment,
    segmentLabel: SEGMENT_LABELS[r.segment] ?? r.segment,
    partnerName: r.partnerName,
    contractNumber: r.contractNumber,
    startDate: r.startDate,
    productionDate: r.productionDate,
    premiumAmount: Number(r.premiumAmount ?? 0),
    premiumAnnual: Number(r.premiumAnnual ?? 0),
  }));

  return { rows: mapped, periodLabel: label };
}
