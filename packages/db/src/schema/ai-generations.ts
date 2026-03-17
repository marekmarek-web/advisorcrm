import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    entityType: text("entity_type").notNull(), // contact | event | meeting_note | team
    entityId: text("entity_id").notNull(),
    promptType: text("prompt_type").notNull(),
    promptId: text("prompt_id").notNull(),
    promptVersion: text("prompt_version"),
    generatedByUserId: text("generated_by_user_id").notNull(),
    outputText: text("output_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    status: text("status").notNull(), // success | failure
    contextHash: text("context_hash"),
  }
);
