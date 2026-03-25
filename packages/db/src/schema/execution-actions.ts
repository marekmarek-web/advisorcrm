import { pgTable, uuid, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";

export const executionActions = pgTable("execution_actions", {
  id: text("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  actionType: text("action_type").notNull(),
  executionMode: text("execution_mode").notNull(),
  status: text("status").notNull().default("pending"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  executedBy: uuid("executed_by"),
  approvedBy: uuid("approved_by"),
  riskLevel: text("risk_level").notNull().default("low"),
  metadata: jsonb("metadata"),
  resultPayload: jsonb("result_payload"),
  failureCode: text("failure_code"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
