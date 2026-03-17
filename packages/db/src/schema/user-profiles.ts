import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Display name and email for portal users; synced from Auth or team sync. */
export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id").primaryKey(),
  fullName: text("full_name"),
  email: text("email"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
