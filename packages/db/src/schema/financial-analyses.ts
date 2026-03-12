import { pgTable, uuid, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { contacts, households } from "./contacts";
import { companies } from "./companies";

export const financialAnalyses = pgTable("financial_analyses", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  householdId: uuid("household_id").references(() => households.id, { onDelete: "set null" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  primaryContactId: uuid("primary_contact_id").references(() => contacts.id, { onDelete: "set null" }),
  type: text("type").notNull().default("financial"),
  status: text("status").notNull().default("draft"), // draft | completed | exported | archived
  sourceType: text("source_type").notNull().default("native"), // native | imported_json
  version: integer("version").notNull().default(1),
  payload: jsonb("payload").notNull(), // { data: FinancialAnalysisData, currentStep: number } or company FA snapshot
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastExportedAt: timestamp("last_exported_at", { withTimezone: true }),
  // Phase 7: link to company for refresh-from-shared-facts
  linkedCompanyId: uuid("linked_company_id").references(() => companies.id, { onDelete: "set null" }),
  lastRefreshedFromSharedAt: timestamp("last_refreshed_from_shared_at", { withTimezone: true }),
});
