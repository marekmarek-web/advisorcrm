import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { aiGenerations } from "./ai-generations";

export const aiFeedback = pgTable("ai_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  generationId: uuid("generation_id")
    .notNull()
    .references(() => aiGenerations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  verdict: text("verdict").notNull(), // accepted | rejected | edited
  actionTaken: text("action_taken"), // task_created | meeting_created | deal_created | service_action_created | none
  createdEntityType: text("created_entity_type"), // task | event | opportunity
  createdEntityId: text("created_entity_id"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
