"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "db";
import { contracts, contractSegments } from "db";
import { eq, and, asc } from "db";

export type FinancialSummary = {
  totalMonthly: number;
  totalAnnual: number;
  bySegment: Array<{
    segment: string;
    count: number;
    monthlySum: number;
    annualSum: number;
  }>;
  allSegments: string[];
  missingSegments: string[];
  contractTimeline: Array<{
    id: string;
    segment: string;
    partnerName: string | null;
    startDate: string | null;
    anniversaryDate: string | null;
  }>;
};

export async function getFinancialSummary(
  contactId: string,
): Promise<FinancialSummary> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "contacts:read"))
    throw new Error("Forbidden");

  const rows = await db
    .select({
      id: contracts.id,
      segment: contracts.segment,
      partnerName: contracts.partnerName,
      premiumAmount: contracts.premiumAmount,
      premiumAnnual: contracts.premiumAnnual,
      startDate: contracts.startDate,
      anniversaryDate: contracts.anniversaryDate,
    })
    .from(contracts)
    .where(
      and(
        eq(contracts.tenantId, auth.tenantId),
        eq(contracts.contactId, contactId),
      ),
    )
    .orderBy(asc(contracts.segment));

  let totalMonthly = 0;
  let totalAnnual = 0;
  const segMap = new Map<
    string,
    { count: number; monthlySum: number; annualSum: number }
  >();

  for (const r of rows) {
    const m = Number(r.premiumAmount) || 0;
    const a = Number(r.premiumAnnual) || 0;
    totalMonthly += m;
    totalAnnual += a;

    const entry = segMap.get(r.segment) ?? {
      count: 0,
      monthlySum: 0,
      annualSum: 0,
    };
    entry.count += 1;
    entry.monthlySum += m;
    entry.annualSum += a;
    segMap.set(r.segment, entry);
  }

  const allSegments = [...contractSegments];
  const coveredSegments = new Set(segMap.keys());
  const missingSegments = allSegments.filter((s) => !coveredSegments.has(s));

  const bySegment = [...segMap.entries()].map(([segment, v]) => ({
    segment,
    ...v,
  }));

  const contractTimeline = rows
    .filter((r) => r.startDate || r.anniversaryDate)
    .sort((a, b) => {
      const da = a.startDate ?? a.anniversaryDate ?? "";
      const db_ = b.startDate ?? b.anniversaryDate ?? "";
      return da.localeCompare(db_);
    })
    .map((r) => ({
      id: r.id,
      segment: r.segment,
      partnerName: r.partnerName,
      startDate: r.startDate,
      anniversaryDate: r.anniversaryDate,
    }));

  return {
    totalMonthly,
    totalAnnual,
    bySegment,
    allSegments,
    missingSegments,
    contractTimeline,
  };
}
