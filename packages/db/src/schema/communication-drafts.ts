import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const communicationDrafts = pgTable("communication_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id"),
  createdBy: uuid("created_by").notNull(),
  draftType: text("draft_type").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("draft"),
  referencedEntityType: text("referenced_entity_type"),
  referencedEntityId: uuid("referenced_entity_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
