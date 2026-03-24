import { pgTable, uuid, text, timestamp, bigint, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { opportunities } from "./pipeline";
import { contracts } from "./contracts";

export type DocumentProcessingProvider = "disabled" | "adobe" | "none";
export type DocumentProcessingStatus = "none" | "queued" | "processing" | "completed" | "failed" | "skipped";
export type DocumentProcessingStage = "none" | "ocr" | "markdown" | "extract" | "completed";
export type DocumentAiInputSource = "markdown" | "extract" | "ocr_text" | "native_text" | "none";
export type CapturedPlatform = "ios" | "android";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  contractId: uuid("contract_id").references(() => contracts.id, { onDelete: "set null" }),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  documentType: text("document_type"),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  tags: text("tags").array(),
  visibleToClient: boolean("visible_to_client").default(false),
  uploadSource: text("upload_source").default("web"),
  sensitive: boolean("sensitive").default(false),
  uploadedBy: text("uploaded_by").notNull(),

  pageCount: integer("page_count"),
  capturedPlatform: text("captured_platform").$type<CapturedPlatform>(),
  hasTextLayer: boolean("has_text_layer"),
  isScanLike: boolean("is_scan_like"),

  processingProvider: text("processing_provider").$type<DocumentProcessingProvider>().default("none"),
  processingStatus: text("processing_status").$type<DocumentProcessingStatus>().default("none"),
  processingStage: text("processing_stage").$type<DocumentProcessingStage>().default("none"),
  processingError: text("processing_error"),
  processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
  processingFinishedAt: timestamp("processing_finished_at", { withTimezone: true }),

  ocrPdfPath: text("ocr_pdf_path"),
  markdownPath: text("markdown_path"),
  markdownContent: text("markdown_content"),
  extractJsonPath: text("extract_json_path"),
  aiInputSource: text("ai_input_source").$type<DocumentAiInputSource>().default("none"),

  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DocumentProcessingJobType = "ocr" | "markdown" | "extract";
export type DocumentProcessingJobStatus = "queued" | "processing" | "completed" | "failed";

export const documentProcessingJobs = pgTable("document_processing_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull(),
  provider: text("provider").$type<DocumentProcessingProvider>().notNull(),
  jobType: text("job_type").$type<DocumentProcessingJobType>().notNull(),
  status: text("status").$type<DocumentProcessingJobStatus>().notNull().default("queued"),
  requestedBy: text("requested_by"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  providerJobId: text("provider_job_id"),
  inputPath: text("input_path"),
  outputPath: text("output_path"),
  outputMetadata: jsonb("output_metadata"),
  attemptNumber: integer("attempt_number").default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const documentVersions = pgTable("document_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
  version: text("version").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
