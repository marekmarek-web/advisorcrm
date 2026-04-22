import "server-only";

import { billingAuditLog } from "db";
import { withServiceTenantContext } from "@/lib/db/service-db";

/**
 * Stabilní kódy billingových událostí. Používej je při logování, at máš v logu
 * předvídatelné hodnoty pro dashboardy a dunning e-maily.
 */
export const BILLING_AUDIT_ACTIONS = {
  CHECKOUT_STARTED: "checkout.started",
  CHECKOUT_COMPLETED: "checkout.completed",
  SUBSCRIPTION_CREATED: "subscription.created",
  SUBSCRIPTION_UPDATED: "subscription.updated",
  SUBSCRIPTION_DELETED: "subscription.deleted",
  INVOICE_FINALIZED: "invoice.finalized",
  INVOICE_PAID: "invoice.paid",
  INVOICE_PAYMENT_FAILED: "invoice.payment_failed",
  COUPON_APPLIED: "coupon.applied",
  PROMO_CODE_APPLIED: "promo_code.applied",
  PROMO_CODE_REJECTED: "promo_code.rejected",
  TRIAL_CONVERTED: "trial.converted",
  BILLING_DETAILS_UPDATED: "billing.details.updated",
  DUNNING_GRACE_PERIOD_STARTED: "dunning.grace_period_started",
  DUNNING_RESTRICTED: "dunning.restricted",
  DUNNING_RECOVERED: "dunning.recovered",
} as const;

export type BillingAuditAction =
  (typeof BILLING_AUDIT_ACTIONS)[keyof typeof BILLING_AUDIT_ACTIONS];

export type BillingAuditActorKind = "user" | "system" | "webhook";

export type BillingAuditInput = {
  tenantId: string;
  action: BillingAuditAction;
  actorKind: BillingAuditActorKind;
  actorUserId?: string | null;
  fromState?: Record<string, unknown> | null;
  toState?: Record<string, unknown> | null;
  stripeEventId?: string | null;
  stripeObjectId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
};

/**
 * Zapíše řádek do `billing_audit_log`. Nikdy nevyhazuje — chyba audit logu
 * nesmí shodit business operaci (checkout / webhook). Chybu jen zaloguje.
 */
export async function writeBillingAudit(input: BillingAuditInput): Promise<void> {
  try {
    await withServiceTenantContext(
      { tenantId: input.tenantId, userId: input.actorUserId ?? null },
      async (tx) => {
        await tx.insert(billingAuditLog).values({
          tenantId: input.tenantId,
          action: input.action,
          actorKind: input.actorKind,
          actorUserId: input.actorUserId ?? null,
          fromState: (input.fromState ?? null) as unknown as object | null,
          toState: (input.toState ?? null) as unknown as object | null,
          stripeEventId: input.stripeEventId ?? null,
          stripeObjectId: input.stripeObjectId ?? null,
          metadata: (input.metadata ?? null) as unknown as object | null,
          ipAddress: input.ipAddress ?? null,
        });
      },
    );
  } catch (err) {
    console.error("[billing-audit] insert failed", {
      action: input.action,
      tenantId: input.tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
