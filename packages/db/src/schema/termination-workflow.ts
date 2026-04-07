import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  boolean,
  numeric,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { contracts } from "./contracts";
import { documents } from "./documents";
import { assistantConversations } from "./assistant-conversations";
import { insurerTerminationRegistry, terminationReasonCatalog } from "./termination-catalogs";
import type {
  TerminationAttachmentSatisfactionStatus,
  TerminationDeliveryChannel,
  TerminationDispatchStatus,
  TerminationGeneratedDocumentKind,
  TerminationMode,
  TerminationRequestEventType,
  TerminationRequestSource,
  TerminationRequestStatus,
} from "./termination-enums";

/** Hlavní entita řízené žádosti o ukončení smlouvy. */
export const terminationRequests = pgTable("termination_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  contractId: uuid("contract_id").references(() => contracts.id, { onDelete: "set null" }),
  sourceDocumentId: uuid("source_document_id").references(() => documents.id, { onDelete: "set null" }),
  sourceConversationId: uuid("source_conversation_id").references(() => assistantConversations.id, {
    onDelete: "set null",
  }),
  advisorId: text("advisor_id").notNull(),
  insurerName: text("insurer_name").notNull(),
  insurerRegistryId: uuid("insurer_registry_id").references(() => insurerTerminationRegistry.id, {
    onDelete: "set null",
  }),
  contractNumber: text("contract_number"),
  productSegment: text("product_segment"),
  terminationMode: text("termination_mode").notNull().$type<TerminationMode>(),
  terminationReasonCode: text("termination_reason_code").notNull(),
  reasonCatalogId: uuid("reason_catalog_id").references(() => terminationReasonCatalog.id, {
    onDelete: "set null",
  }),
  requestedEffectiveDate: date("requested_effective_date", { mode: "string" }),
  computedEffectiveDate: date("computed_effective_date", { mode: "string" }),
  contractStartDate: date("contract_start_date", { mode: "string" }),
  contractAnniversaryDate: date("contract_anniversary_date", { mode: "string" }),
  freeformLetterAllowed: boolean("freeform_letter_allowed"),
  requiresInsurerForm: boolean("requires_insurer_form"),
  /** Snapshot po vyhodnocení pravidel (kromě strukturovaných řádků v `termination_required_attachments`). */
  requiredAttachments: jsonb("required_attachments").$type<Record<string, unknown>>(),
  deliveryChannel: text("delivery_channel")
    .notNull()
    .default("not_yet_set")
    .$type<TerminationDeliveryChannel>(),
  deliveryAddressSnapshot: jsonb("delivery_address_snapshot").$type<Record<string, unknown>>(),
  /** Volitelná data pro šablonu dopisu (firemní pojistník, poznámka pro review, claimEventDate, …). */
  documentBuilderExtras: jsonb("document_builder_extras")
    .notNull()
    .default({})
    .$type<Record<string, unknown>>(),
  status: text("status").notNull().default("draft").$type<TerminationRequestStatus>(),
  reviewRequiredReason: text("review_required_reason"),
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  sourceKind: text("source_kind").notNull().default("manual_intake").$type<TerminationRequestSource>(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const terminationRequestEvents = pgTable("termination_request_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => terminationRequests.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull().$type<TerminationRequestEventType>(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  actorUserId: text("actor_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const terminationRequiredAttachments = pgTable("termination_required_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => terminationRequests.id, { onDelete: "cascade" }),
  requirementCode: text("requirement_code").notNull(),
  label: text("label").notNull(),
  status: text("status")
    .notNull()
    .default("required")
    .$type<TerminationAttachmentSatisfactionStatus>(),
  satisfiedDocumentId: uuid("satisfied_document_id").references(() => documents.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const terminationGeneratedDocuments = pgTable("termination_generated_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => terminationRequests.id, { onDelete: "cascade" }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().$type<TerminationGeneratedDocumentKind>(),
  versionLabel: text("version_label"),
  isCurrent: boolean("is_current").notNull().default(true),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const terminationDispatchLog = pgTable("termination_dispatch_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => terminationRequests.id, { onDelete: "cascade" }),
  channel: text("channel").notNull().$type<TerminationDeliveryChannel>(),
  status: text("status").notNull().default("pending").$type<TerminationDispatchStatus>(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  carrierOrProvider: text("carrier_or_provider"),
  trackingReference: text("tracking_reference"),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
