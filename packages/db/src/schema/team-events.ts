import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const teamEvents = pgTable("team_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull(),
  title: text("title").notNull(),
  eventType: text("event_type").default("schuzka"),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }),
  allDay: boolean("all_day").default(false),
  location: text("location"),
  notes: text("notes"),
  meetingLink: text("meeting_link"),
  reminderAt: timestamp("reminder_at", { withTimezone: true }),
  targetType: text("target_type").notNull(), // 'all' | 'selected'
  targetUserIds: text("target_user_ids").array().notNull(), // user_id[]
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const teamTasks = pgTable("team_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  targetType: text("target_type").notNull(),
  targetUserIds: text("target_user_ids").array().notNull(),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
