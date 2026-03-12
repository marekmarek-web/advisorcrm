import { pgTable, uuid, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { financialAnalyses } from "./financial-analyses";

export const analysisVersions = pgTable("analysis_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisId: uuid("analysis_id")
    .notNull()
    .references(() => financialAnalyses.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  snapshotPayload: jsonb("snapshot_payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by"),
});
