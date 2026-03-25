import { pgTable, uuid, text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const deadLetterItems = pgTable(
  "dead_letter_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    jobType: text("job_type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    failureReason: text("failure_reason"),
    attempts: integer("attempts").notNull().default(0),
    status: text("status").notNull().default("pending"),
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantStatusIdx: index("dead_letter_items_tenant_status_idx").on(t.tenantId, t.status),
    jobTypeIdx: index("dead_letter_items_job_type_idx").on(t.tenantId, t.jobType),
  })
);
