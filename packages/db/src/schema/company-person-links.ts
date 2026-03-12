import { pgTable, uuid, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { contacts } from "./contacts";

export const companyPersonLinks = pgTable("company_person_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  roleType: text("role_type").notNull(), // director | owner | partner | key_person | employee
  ownershipPercent: integer("ownership_percent"),
  salaryFromCompanyMonthly: integer("salary_from_company_monthly"),
  dividendRelation: text("dividend_relation"),
  guaranteesCompanyLiabilities: boolean("guarantees_company_liabilities").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
