import { pgTable, uuid, text, timestamp, date, time, boolean } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { opportunities } from "./pipeline";
import { financialAnalyses } from "./financial-analyses";
import { teamEvents } from "./team-events";
import { teamTasks } from "./team-events";

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
  analysisId: uuid("analysis_id").references(() => financialAnalyses.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: date("due_date"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  assignedTo: text("assigned_to"),
  createdBy: text("created_by"),
  teamTaskId: uuid("team_task_id").references(() => teamTasks.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const eventTypes = ["schuzka", "ukol", "telefonat", "mail", "kafe", "priorita"] as const;
export type EventType = (typeof eventTypes)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  schuzka: "Schůzka",
  ukol: "Úkol",
  telefonat: "Telefonát",
  mail: "E-mail",
  kafe: "Kafe",
  priorita: "Priorita",
};

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  eventType: text("event_type").default("schuzka"),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }),
  allDay: boolean("all_day").default(false),
  location: text("location"),
  reminderAt: timestamp("reminder_at", { withTimezone: true }),
  assignedTo: text("assigned_to"),
  status: text("status"),
  notes: text("notes"),
  meetingLink: text("meeting_link"),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  teamEventId: uuid("team_event_id").references(() => teamEvents.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
