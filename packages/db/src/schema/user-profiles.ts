import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Display name and email for portal users; synced from Auth or team sync. */
export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id").primaryKey(),
  fullName: text("full_name"),
  email: text("email"),
  /** Kalendářní připomenutí — push (FCM); cron `/api/cron/event-reminders`. */
  calendarReminderPushEnabled: boolean("calendar_reminder_push_enabled").default(true).notNull(),
  /** Kalendářní připomenutí — e-mail (Resend); respektuje i EVENT_REMINDER_EMAIL. */
  calendarReminderEmailEnabled: boolean("calendar_reminder_email_enabled").default(true).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
