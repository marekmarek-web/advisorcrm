import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { contacts, households } from "./contacts";

export const financialAnalyses = pgTable("financial_analyses", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  householdId: uuid("household_id").references(() => households.id, { onDelete: "set null" }),
  type: text("type").notNull().default("financial"),
  status: text("status").notNull().default("draft"), // draft | completed | exported | archived
  payload: jsonb("payload").notNull(), // { data: FinancialAnalysisData, currentStep: number }
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastExportedAt: timestamp("last_exported_at", { withTimezone: true }),
});
