import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const advisorNotifications = pgTable("advisor_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  severity: text("severity").notNull().default("info"),
  targetUserId: uuid("target_user_id").notNull(),
  channels: jsonb("channels").$type<string[]>().notNull().default(["in_app"]),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: uuid("related_entity_id"),
  status: text("status").notNull().default("unread"),
  groupKey: text("group_key"),
  readAt: timestamp("read_at", { withTimezone: true }),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
