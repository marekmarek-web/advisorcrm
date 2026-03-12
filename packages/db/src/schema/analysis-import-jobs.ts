import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { financialAnalyses } from "./financial-analyses";

export const analysisImportJobs = pgTable("analysis_import_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  status: text("status").notNull(), // pending | success | failed
  analysisId: uuid("analysis_id").references(() => financialAnalyses.id, { onDelete: "set null" }),
  rawPayload: jsonb("raw_payload"),
  errors: jsonb("errors"), // array of error messages
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
