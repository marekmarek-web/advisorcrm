import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const escalationEvents = pgTable("escalation_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  policyCode: text("policy_code").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  triggerReason: text("trigger_reason").notNull(),
  thresholdCrossed: text("threshold_crossed").notNull(),
  escalatedTo: uuid("escalated_to").notNull(),
  status: text("status").notNull().default("pending"),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
