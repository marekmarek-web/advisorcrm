"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission, type RoleName } from "@/shared/rolePermissions";
import { db, invoices, subscriptions, eq, desc } from "db";
import { getSubscriptionState, type SubscriptionState } from "@/lib/entitlements";

export type InvoiceRow = {
  id: string;
  stripeInvoiceId: string | null;
  amount: string | null;
  currency: string | null;
  status: string | null;
  invoiceUrl: string | null;
  paidAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
};

export type BillingOverview = {
  subscription: SubscriptionState;
  invoices: InvoiceRow[];
};

export async function getBillingOverview(): Promise<BillingOverview | null> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName as RoleName, "billing:read")) {
    return null;
  }

  const [subState, invoiceRows] = await Promise.all([
    getSubscriptionState(auth.tenantId),
    db
      .select()
      .from(invoices)
      .where(eq(invoices.tenantId, auth.tenantId))
      .orderBy(desc(invoices.createdAt))
      .limit(50),
  ]);

  return {
    subscription: subState,
    invoices: invoiceRows.map((r) => ({
      id: r.id,
      stripeInvoiceId: r.stripeInvoiceId,
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      invoiceUrl: r.invoiceUrl,
      paidAt: r.paidAt?.toISOString() ?? null,
      periodStart: r.periodStart?.toISOString() ?? null,
      periodEnd: r.periodEnd?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
