import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";

/** In-app notifikace pro klientský portál (nová zpráva, změna stavu požadavku, nový dokument). */
export const portalNotifications = pgTable("portal_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // new_message | request_status_change | new_document | important_date
  title: text("title").notNull(),
  body: text("body"),
  readAt: timestamp("read_at", { withTimezone: true }),
  relatedEntityType: text("related_entity_type"), // message | opportunity | document
  relatedEntityId: text("related_entity_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
