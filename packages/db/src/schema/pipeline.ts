import { pgTable, uuid, text, timestamp, integer, decimal, date, jsonb, boolean } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { financialAnalyses } from "./financial-analyses";

export const opportunityStages = pgTable("opportunity_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  probability: integer("probability"), // 0-100
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const opportunities = pgTable("opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  householdId: uuid("household_id"),
  caseType: text("case_type").notNull(),
  title: text("title").notNull(),
  stageId: uuid("stage_id").notNull().references(() => opportunityStages.id, { onDelete: "restrict" }),
  probability: integer("probability"),
  expectedValue: decimal("expected_value", { precision: 14, scale: 2 }),
  expectedCloseDate: date("expected_close_date"),
  assignedTo: text("assigned_to"), // user_id
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedAs: text("closed_as"), // 'won' | 'lost'
  customFields: jsonb("custom_fields"),
  faSourceId: uuid("fa_source_id").references(() => financialAnalyses.id, { onDelete: "set null" }),
  awaitingDocument: boolean("awaiting_document").default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedReason: text("archived_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
