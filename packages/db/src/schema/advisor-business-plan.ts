import { pgTable, uuid, text, timestamp, integer, numeric, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const advisorBusinessPlanPeriodTypes = ["month", "quarter", "year"] as const;
export type AdvisorBusinessPlanPeriodType = (typeof advisorBusinessPlanPeriodTypes)[number];

export const advisorBusinessPlanStatuses = ["active", "archived"] as const;
export type AdvisorBusinessPlanStatus = (typeof advisorBusinessPlanStatuses)[number];

/** Advisor's personal business plan for a period. */
export const advisorBusinessPlans = pgTable(
  "advisor_business_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    periodType: text("period_type").notNull(), // 'month' | 'quarter' | 'year'
    year: integer("year").notNull(),
    periodNumber: integer("period_number").notNull(), // 1-12 month, 1-4 quarter, 0 year
    title: text("title"),
    status: text("status").notNull().default("active"), // 'active' | 'archived'
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("advisor_business_plans_tenant_user_period").on(
      t.tenantId,
      t.userId,
      t.periodType,
      t.year,
      t.periodNumber
    ),
  ]
);

export const advisorBusinessPlanTargetUnits = ["count", "czk", "pct"] as const;
export type AdvisorBusinessPlanTargetUnit = (typeof advisorBusinessPlanTargetUnits)[number];

/** Target value for one metric in a plan. */
export const advisorBusinessPlanTargets = pgTable("advisor_business_plan_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  planId: uuid("plan_id")
    .notNull()
    .references(() => advisorBusinessPlans.id, { onDelete: "cascade" }),
  metricType: text("metric_type").notNull(),
  targetValue: numeric("target_value", { precision: 18, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("count"), // 'count' | 'czk' | 'pct'
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
