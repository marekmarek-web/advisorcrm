"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { contracts, SEGMENT_LABELS } from "db";
import { eq, and, gte, lt, sql } from "db";

export type PeriodType = "month" | "quarter" | "year";

export type ProductionRow = {
  segment: string;
  segmentLabel: string;
  partnerName: string | null;
  totalPremium: number;
  totalAnnual: number;
  count: number;
};

export type ProductionSummary = {
  rows: ProductionRow[];
  totalPremium: number;
  totalAnnual: number;
  totalCount: number;
  periodLabel: string;
};

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

  const { start, end, label } = getPeriodRange(period, refDate);

  const rows = await db
    .select({
      segment: contracts.segment,
      partnerName: contracts.partnerName,
      totalPremium: sql<number>`coalesce(sum(${contracts.premiumAmount}::numeric), 0)`,
      totalAnnual: sql<number>`coalesce(sum(${contracts.premiumAnnual}::numeric), 0)`,
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

  const mapped: ProductionRow[] = rows.map((r) => ({
    segment: r.segment,
    segmentLabel: SEGMENT_LABELS[r.segment] ?? r.segment,
    partnerName: r.partnerName,
    totalPremium: Number(r.totalPremium),
    totalAnnual: Number(r.totalAnnual),
    count: Number(r.count),
  }));

  return {
    rows: mapped,
    totalPremium: mapped.reduce((s, r) => s + r.totalPremium, 0),
    totalAnnual: mapped.reduce((s, r) => s + r.totalAnnual, 0),
    totalCount: mapped.reduce((s, r) => s + r.count, 0),
    periodLabel: label,
  };
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

  const { start, end, label } = getPeriodRange(period, refDate);

  const rows = await db
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
