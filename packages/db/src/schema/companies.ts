import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  ico: text("ico"),
  name: text("name").notNull(),
  industry: text("industry"),
  employees: integer("employees"),
  cat3: integer("cat3"),
  avgWage: integer("avg_wage"),
  topClient: integer("top_client"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
