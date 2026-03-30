import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { financialAnalyses } from "./financial-analyses";
import { tenants } from "./tenants";

export const faSyncLog = pgTable(
  "fa_sync_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    analysisId: uuid("analysis_id")
      .notNull()
      .references(() => financialAnalyses.id, { onDelete: "cascade" }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
    syncedBy: text("synced_by"),
    contactsCreated: jsonb("contacts_created"),
    householdId: uuid("household_id"),
    companyId: uuid("company_id"),
    syncNotes: text("sync_notes"),
  },
  (t) => [index("fa_sync_log_analysis_idx").on(t.analysisId)]
);
