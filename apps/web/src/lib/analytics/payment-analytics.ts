/**
 * Payment analytics (Plan 7B.3).
 * Payment setup metrics and quality breakdown.
 */

import type { TimeWindow } from "./analytics-scope";

export type PaymentMetrics = {
  created: number;
  blocked: number;
  applied: number;
  awaitingReview: number;
  correctionRate: number;
  portalVisibilityRate: number;
};

export type PaymentQualityMetrics = {
  missingIban: number;
  missingVs: number;
  badFrequency: number;
  missingAmount: number;
  conflictCount: number;
};

export async function getPaymentMetrics(
  tenantId: string,
  window?: TimeWindow,
): Promise<PaymentMetrics> {
  const metrics: PaymentMetrics = {
    created: 0,
    blocked: 0,
    applied: 0,
    awaitingReview: 0,
    correctionRate: 0,
    portalVisibilityRate: 0,
  };

  try {
    const { db, clientPaymentSetups, eq, and, gte, sql } = await import("db");

    const windowStart = window?.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [stats] = await db.select({
      total: sql<number>`count(*)::int`,
      blocked: sql<number>`count(*) filter (where ${clientPaymentSetups.status} = 'blocked')::int`,
      applied: sql<number>`count(*) filter (where ${clientPaymentSetups.status} = 'applied')::int`,
      awaiting: sql<number>`count(*) filter (where ${clientPaymentSetups.needsHumanReview} = true)::int`,
    }).from(clientPaymentSetups)
      .where(and(eq(clientPaymentSetups.tenantId, tenantId), gte(clientPaymentSetups.createdAt, windowStart)));

    if (stats) {
      metrics.created = stats.total;
      metrics.blocked = stats.blocked;
      metrics.applied = stats.applied;
      metrics.awaitingReview = stats.awaiting;
      metrics.portalVisibilityRate = stats.total > 0 ? Math.round((stats.applied / stats.total) * 100) / 100 : 0;
    }
  } catch { /* best-effort */ }

  return metrics;
}

export async function getPaymentQualityBreakdown(
  tenantId: string,
  window?: TimeWindow,
): Promise<PaymentQualityMetrics> {
  const quality: PaymentQualityMetrics = {
    missingIban: 0,
    missingVs: 0,
    badFrequency: 0,
    missingAmount: 0,
    conflictCount: 0,
  };

  try {
    const { db, clientPaymentSetups, eq, and, gte, sql } = await import("db");

    const windowStart = window?.startDate ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [stats] = await db.select({
      missingIban: sql<number>`count(*) filter (where (${clientPaymentSetups.extractedData}->>'accountNumber') is null or (${clientPaymentSetups.extractedData}->>'accountNumber') = '')::int`,
      missingVs: sql<number>`count(*) filter (where (${clientPaymentSetups.extractedData}->>'variableSymbol') is null or (${clientPaymentSetups.extractedData}->>'variableSymbol') = '')::int`,
      missingAmount: sql<number>`count(*) filter (where (${clientPaymentSetups.extractedData}->>'amount') is null or (${clientPaymentSetups.extractedData}->>'amount') = '')::int`,
    }).from(clientPaymentSetups)
      .where(and(eq(clientPaymentSetups.tenantId, tenantId), gte(clientPaymentSetups.createdAt, windowStart)));

    if (stats) {
      quality.missingIban = stats.missingIban;
      quality.missingVs = stats.missingVs;
      quality.missingAmount = stats.missingAmount;
    }
  } catch { /* best-effort */ }

  return quality;
}
