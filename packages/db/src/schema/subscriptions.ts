import { pgTable, uuid, text, timestamp, decimal, index } from "drizzle-orm/pg-core";

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  /** Stripe Subscription id (sub_…) */
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  plan: text("plan").notNull(),
  status: text("status").notNull().default("active"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: text("cancel_at_period_end").default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    /** Stripe Invoice id (in_…) */
    stripeInvoiceId: text("stripe_invoice_id").unique(),
    amount: decimal("amount", { precision: 14, scale: 2 }),
    currency: text("currency").default("czk"),
    status: text("status").default("draft"),
    invoiceUrl: text("invoice_url"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index("invoices_tenant_idx").on(t.tenantId),
  }),
);
