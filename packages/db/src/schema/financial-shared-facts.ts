import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { companies } from "./companies";
import { companyPersonLinks } from "./company-person-links";
import { financialAnalyses } from "./financial-analyses";

/** Fact types that can flow between company and personal FA. */
export const SHARED_FACT_TYPES = [
  "income_from_company",
  "dividend_from_company",
  "benefit_company_contribution",
  "guarantee_company_liability",
  "ownership_percent",
  "insurance_company_funded_monthly",
  "company_liability_personal_impact",
] as const;

export type SharedFactType = (typeof SHARED_FACT_TYPES)[number];

export const SHARED_FACT_SOURCES = ["manual", "company_fa", "personal_fa", "json_import", "crm_link"] as const;

export type SharedFactSource = (typeof SHARED_FACT_SOURCES)[number];

export const financialSharedFacts = pgTable("financial_shared_facts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  companyPersonLinkId: uuid("company_person_link_id").references(() => companyPersonLinks.id, {
    onDelete: "set null",
  }),
  factType: text("fact_type").notNull(),
  value: jsonb("value").notNull(), // { amount?: number; periodicity?: 'monthly'|'annual'; currency?: string; [k: string]: unknown }
  source: text("source").notNull().default("manual"),
  sourceAnalysisId: uuid("source_analysis_id").references(() => financialAnalyses.id, { onDelete: "set null" }),
  sourcePayloadPath: text("source_payload_path"),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validTo: timestamp("valid_to", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
});
