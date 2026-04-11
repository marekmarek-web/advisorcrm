import { pgTable, uuid, text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const tenantSettings = pgTable(
  "tenant_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    /** plan | manual | null (legacy — sync will not overwrite). */
    settingOrigin: text("setting_origin"),
    domain: text("domain").notNull(),
    updatedBy: text("updated_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    version: integer("version").default(1).notNull(),
  },
  (t) => ({
    tenantKeyIdx: index("tenant_settings_tenant_key_idx").on(t.tenantId, t.key),
    domainIdx: index("tenant_settings_domain_idx").on(t.tenantId, t.domain),
  })
);
