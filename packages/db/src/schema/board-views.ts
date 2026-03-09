import { pgTable, uuid, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";

export const boardViews = pgTable("board_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  userId: text("user_id"),
  name: text("name").notNull().default("Default"),
  columnsConfig: jsonb("columns_config"),
  groupsConfig: jsonb("groups_config"),
  groupBy: text("group_by"),
  filters: jsonb("filters"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const boardItems = pgTable("board_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  viewId: uuid("view_id").notNull().references(() => boardViews.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  groupId: text("group_id").notNull().default("default"),
  name: text("name").notNull(),
  cells: jsonb("cells").notNull().default({}),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
