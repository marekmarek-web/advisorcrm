import { pgTable, uuid, text, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const teamGoalTypes = ["units", "production", "meetings"] as const;
export type TeamGoalType = (typeof teamGoalTypes)[number];

export const teamGoalPeriods = ["month", "quarter"] as const;
export type TeamGoalPeriod = (typeof teamGoalPeriods)[number];

/** Team-level goals per period (e.g. current month/quarter target). */
export const teamGoals = pgTable(
  "team_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // 'month' | 'quarter'
    goalType: text("goal_type").notNull(), // 'units' | 'production' | 'meetings'
    targetValue: integer("target_value").notNull(),
    year: integer("year").notNull(),
    month: integer("month").notNull(), // 1-12 for month, or 1-4 for quarter (Q1-Q4)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("team_goals_tenant_period_type_year_month").on(t.tenantId, t.period, t.goalType, t.year, t.month)]
);
