import { pgTable, uuid, text, timestamp, jsonb, integer } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";

/** Historie změn (UX) – poslední akce u položky (status, produkt, edit). Není compliance audit. */
export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  userId: text("user_id"),
  entityType: text("entity_type").notNull(), // board_item | contact | contract | ...
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(), // status_change | edit | product_change | ...
  meta: jsonb("meta"), // { columnId?, oldValue?, newValue?, label? }
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  userId: text("user_id"),
  action: text("action").notNull(), // login | export | create | update | delete | download | upload
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  meta: jsonb("meta"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const consents = pgTable("consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  purposeId: uuid("purpose_id").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  legalBasis: text("legal_basis"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const processingPurposes = pgTable("processing_purposes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  legalBasis: text("legal_basis"),
  retentionMonths: integer("retention_months"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const amlChecklists = pgTable("aml_checklists", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  performedBy: text("performed_by").notNull(),
  performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
  checklistType: text("checklist_type").notNull(),
  result: jsonb("result"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const incidentLogs = pgTable("incident_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  severity: text("severity").notNull(),
  status: text("status").notNull().default("open"),
  reportedBy: text("reported_by").notNull(),
  reportedAt: timestamp("reported_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const exports = pgTable("exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  type: text("type").notNull(), // gdpr | compliance_package
  requestedBy: text("requested_by").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const exportArtifacts = pgTable("export_artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  exportId: uuid("export_id").notNull().references(() => exports.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // zip | json | pdf
  storagePath: text("storage_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
