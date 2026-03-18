import { pgTable, uuid, text, timestamp, boolean, unique } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  notificationEmail: text("notification_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // Admin | Director | Manager | Advisor | Viewer
  permissions: text("permissions").array(), // JSON or array of permission keys
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    parentId: text("parent_id"),
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    invitedBy: text("invited_by"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    mfaEnabled: boolean("mfa_enabled").default(false),
  },
  (t) => [unique("memberships_tenant_user").on(t.tenantId, t.userId)]
);
