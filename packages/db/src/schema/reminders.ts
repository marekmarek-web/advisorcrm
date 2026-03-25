import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const reminders = pgTable("reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  reminderType: text("reminder_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  severity: text("severity").notNull().default("medium"),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: uuid("related_entity_id"),
  suggestionOrigin: text("suggestion_origin").notNull().default("rule"),
  status: text("status").notNull().default("pending"),
  snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  assignedTo: uuid("assigned_to").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
