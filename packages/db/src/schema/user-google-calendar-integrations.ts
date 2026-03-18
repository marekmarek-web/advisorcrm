import { pgTable, uuid, text, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * Google Calendar OAuth integrace na úrovni uživatele (poradce).
 * Jeden záznam na (tenant_id, user_id). Tokeny ukládejte šifrované v aplikační vrstvě před insert/update.
 */
export const userGoogleCalendarIntegrations = pgTable(
  "user_google_calendar_integrations",
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
    calendarId: text("calendar_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("user_google_calendar_integrations_tenant_user").on(t.tenantId, t.userId)]
);

export type UserGoogleCalendarIntegration = typeof userGoogleCalendarIntegrations.$inferSelect;
export type NewUserGoogleCalendarIntegration = typeof userGoogleCalendarIntegrations.$inferInsert;
