import { pgTable, uuid, text, timestamp, integer, bigint, decimal, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Monthly usage counters per workspace (calendar month, UTC `YYYY-MM`).
 * Phase 3: foundation for quota enforcement vs {@link PlanLimits} in plan-catalog.
 */
export const subscriptionUsageMonthly = pgTable(
  "subscription_usage_monthly",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Calendar period in UTC, format `YYYY-MM`. */
    periodMonth: text("period_month").notNull(),
    assistantActionsUsed: integer("assistant_actions_used").notNull().default(0),
    imageIntakesUsed: integer("image_intakes_used").notNull().default(0),
    aiReviewPagesUsed: integer("ai_review_pages_used").notNull().default(0),
    inputTokensUsed: bigint("input_tokens_used", { mode: "number" }).notNull().default(0),
    outputTokensUsed: bigint("output_tokens_used", { mode: "number" }).notNull().default(0),
    /** Cumulative estimated cost for the month (nominal USD; accounting-grade pricing TBD). */
    estimatedCost: decimal("estimated_cost", { precision: 18, scale: 8 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantPeriodUq: uniqueIndex("subscription_usage_monthly_tenant_period_uq").on(t.tenantId, t.periodMonth),
  }),
);
