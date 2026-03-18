import { pgTable, uuid, text, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { contacts } from "./contacts";
import { contracts } from "./contracts";

/** Extraction status for a document. */
export type DocumentExtractionStatus = "pending" | "extracted" | "failed";

/** Source of an extraction field value. */
export type ExtractionFieldSource = "extraction" | "manual" | "corrected";

/**
 * One row per document: metadata for extraction run (no raw content/OCR).
 * Links to documents.id; optional contactId/contractId for context.
 */
export const documentExtractions = pgTable("document_extractions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  contractId: uuid("contract_id").references(() => contracts.id, { onDelete: "set null" }),
  status: text("status").notNull().$type<DocumentExtractionStatus>().default("pending"),
  extractedAt: timestamp("extracted_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  /** Metadata only (inputMode, documentType, etc.) – no document content. */
  extractionTrace: jsonb("extraction_trace"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * One row per extracted field: key, value, confidence, source, review state.
 * Enables per-field history and "AI-extracted vs manual vs corrected".
 */
export const documentExtractionFields = pgTable("document_extraction_fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentExtractionId: uuid("document_extraction_id")
    .notNull()
    .references(() => documentExtractions.id, { onDelete: "cascade" }),
  fieldKey: text("field_key").notNull(),
  value: jsonb("value"),
  confidence: numeric("confidence", { precision: 3, scale: 2 }),
  source: text("source").notNull().$type<ExtractionFieldSource>().default("extraction"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
