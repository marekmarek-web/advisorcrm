import { pgTable, uuid, text, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const userGoogleGmailIntegrations = pgTable(
  "user_google_gmail_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    googleEmail: text("google_email"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiry: timestamp("token_expiry", { withTimezone: true }),
    scope: text("scope"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("user_google_gmail_integrations_tenant_user").on(t.tenantId, t.userId)]
);

export type UserGoogleGmailIntegration = typeof userGoogleGmailIntegrations.$inferSelect;
export type NewUserGoogleGmailIntegration = typeof userGoogleGmailIntegrations.$inferInsert;
