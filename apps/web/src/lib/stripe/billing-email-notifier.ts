import "server-only";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { dbService } from "@/lib/db/service-db";
import { tenants } from "db";
import { sendEmail } from "@/lib/email/send-email";
import {
  trialEndingTemplate,
  paymentFailedTemplate,
  gracePeriodReminderTemplate,
  subscriptionCanceledTemplate,
  invoiceReceiptTemplate,
} from "@/lib/email/templates";

/**
 * Billing lifecycle emaily (delta A4). Volané ze Stripe webhooku + crons.
 *
 * Cílová adresa:
 *   1. `tenants.notificationEmail` (primární)
 *   2. fallback na prvního admin `memberships.userId` → Supabase `user_profiles.email`
 *      (pokud neexistuje notificationEmail)
 *
 * Bezpečnost: každý send je `audit`-ovaný do `notification_log` s
 * `template: "billing-*"`.
 */

type BillingRecipient = {
  tenantId: string;
  email: string;
  advisorName?: string;
};

async function resolveTenantNotificationRecipient(
  tenantId: string,
): Promise<BillingRecipient | null> {
  const rows = await dbService
    .select({
      notificationEmail: tenants.notificationEmail,
      name: tenants.name,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const tenant = rows[0];
  if (!tenant) return null;
  const email = tenant.notificationEmail?.trim();
  if (!email) {
    // Fallback na workspace owner přes `user_profiles` — caller se musí rozhodnout,
    // jestli chce spoléhat (dnes ponecháme null = silent skip + Sentry warning).
    return null;
  }
  return { tenantId, email, advisorName: tenant.name };
}

function formatAmountCzk(amountMinor: number, currency: string | null): string {
  const symbol = (currency ?? "czk").toUpperCase();
  const amount = (amountMinor ?? 0) / 100;
  return `${amount.toLocaleString("cs-CZ", { minimumFractionDigits: 2 })} ${symbol}`;
}

function formatCzechDate(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toLocaleDateString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export async function sendTrialEndingEmail(params: {
  tenantId: string;
  daysLeft: number;
  trialEndsAt: Date;
}): Promise<void> {
  const recipient = await resolveTenantNotificationRecipient(params.tenantId);
  if (!recipient) return;
  const { subject, html } = trialEndingTemplate({
    advisorName: recipient.advisorName,
    daysLeft: params.daysLeft,
    trialEndsAt: formatCzechDate(params.trialEndsAt),
  });
  await sendEmail({
    to: recipient.email,
    subject,
    html,
    audit: {
      tenantId: params.tenantId,
      template: "billing-trial-ending",
      meta: { daysLeft: params.daysLeft },
    },
  });
}

export async function sendPaymentFailedEmail(params: {
  tenantId: string;
  invoice: Stripe.Invoice;
  gracePeriodEndsAt: Date | null;
}): Promise<void> {
  const recipient = await resolveTenantNotificationRecipient(params.tenantId);
  if (!recipient) return;
  const invoiceNumber = params.invoice.number ?? params.invoice.id ?? undefined;
  const nextRetry = params.invoice.next_payment_attempt
    ? new Date(params.invoice.next_payment_attempt * 1000)
    : null;
  const { subject, html } = paymentFailedTemplate({
    advisorName: recipient.advisorName,
    invoiceNumber,
    amountFormatted: formatAmountCzk(params.invoice.amount_due, params.invoice.currency),
    nextRetryAt: formatCzechDate(nextRetry ?? undefined),
    gracePeriodEnds: formatCzechDate(params.gracePeriodEndsAt ?? undefined),
  });
  await sendEmail({
    to: recipient.email,
    subject,
    html,
    audit: {
      tenantId: params.tenantId,
      template: "billing-payment-failed",
      meta: { invoiceId: params.invoice.id, amountDue: params.invoice.amount_due },
    },
  });
}

export async function sendGracePeriodReminderEmail(params: {
  tenantId: string;
  gracePeriodEndsAt: Date;
}): Promise<void> {
  const recipient = await resolveTenantNotificationRecipient(params.tenantId);
  if (!recipient) return;
  const { subject, html } = gracePeriodReminderTemplate({
    advisorName: recipient.advisorName,
    gracePeriodEnds: formatCzechDate(params.gracePeriodEndsAt),
  });
  await sendEmail({
    to: recipient.email,
    subject,
    html,
    audit: {
      tenantId: params.tenantId,
      template: "billing-grace-period-reminder",
    },
  });
}

export async function sendSubscriptionCanceledEmail(params: {
  tenantId: string;
  effectiveUntil: Date | null;
}): Promise<void> {
  const recipient = await resolveTenantNotificationRecipient(params.tenantId);
  if (!recipient) return;
  const { subject, html } = subscriptionCanceledTemplate({
    advisorName: recipient.advisorName,
    effectiveUntil: formatCzechDate(params.effectiveUntil ?? undefined),
  });
  await sendEmail({
    to: recipient.email,
    subject,
    html,
    audit: {
      tenantId: params.tenantId,
      template: "billing-subscription-canceled",
    },
  });
}

export async function sendInvoiceReceiptEmail(params: {
  tenantId: string;
  invoice: Stripe.Invoice;
}): Promise<void> {
  const recipient = await resolveTenantNotificationRecipient(params.tenantId);
  if (!recipient) return;
  const invoiceNumber = params.invoice.number ?? params.invoice.id ?? "";
  const periodStart = params.invoice.period_start
    ? new Date(params.invoice.period_start * 1000)
    : null;
  const periodEnd = params.invoice.period_end
    ? new Date(params.invoice.period_end * 1000)
    : null;
  const periodLabel =
    periodStart && periodEnd
      ? `${formatCzechDate(periodStart)} – ${formatCzechDate(periodEnd)}`
      : undefined;
  const { subject, html } = invoiceReceiptTemplate({
    advisorName: recipient.advisorName,
    invoiceNumber,
    amountFormatted: formatAmountCzk(params.invoice.amount_paid, params.invoice.currency),
    periodLabel,
    hostedInvoiceUrl: params.invoice.hosted_invoice_url ?? undefined,
    pdfUrl: params.invoice.invoice_pdf ?? undefined,
  });
  await sendEmail({
    to: recipient.email,
    subject,
    html,
    audit: {
      tenantId: params.tenantId,
      template: "billing-invoice-receipt",
      meta: { invoiceId: params.invoice.id, amountPaid: params.invoice.amount_paid },
    },
  });
}

export const __internal = {
  resolveTenantNotificationRecipient,
  formatAmountCzk,
  formatCzechDate,
};
