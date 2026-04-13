import { pgTable, uuid, text, timestamp, bigint, jsonb } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";

/** Processing status for contract upload pipeline. */
export type ContractProcessingStatus =
  | "uploaded"
  | "processing"
  | "extracted"
  | "review_required"
  | "failed"
  /** Scan-like document waiting for Adobe/OCR; AI Review extraction not run. */
  | "scan_pending_ocr"
  /** e.g. payment extraction missing critical fields — no portal apply until resolved. */
  | "blocked";

/** Review queue status. */
export type ContractReviewStatus = "pending" | "approved" | "rejected" | "applied";

/**
 * Contract uploads and AI extraction review queue.
 * Stores file metadata, extracted JSON, draft actions, and review state.
 */
export const contractUploadReviews = pgTable("contract_upload_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  fileName: text("file_name").notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  processingStatus: text("processing_status").notNull().$type<ContractProcessingStatus>(),
  /** Sub-step while processing (UI progress); cleared when done. */
  processingStage: text("processing_stage"),
  errorMessage: text("error_message"),
  extractedPayload: jsonb("extracted_payload"),
  clientMatchCandidates: jsonb("client_match_candidates"),
  draftActions: jsonb("draft_actions"),
  confidence: jsonb("confidence").$type<number>(),
  reasonsForReview: jsonb("reasons_for_review").$type<string[]>(),
  reviewStatus: text("review_status").$type<ContractReviewStatus>().default("pending"),
  uploadedBy: text("uploaded_by"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  rejectReason: text("reject_reason"),
  appliedBy: text("applied_by"),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  /** Resolved client: selected from candidates. Null + createNewClientConfirmed = create new. */
  matchedClientId: uuid("matched_client_id").references(() => contacts.id, { onDelete: "set null" }),
  /** If true and matchedClientId is null, apply will create a new client from draft. */
  createNewClientConfirmed: text("create_new_client_confirmed").$type<"true" | null>(),
  /** After apply: created/linked entity ids for audit. */
  applyResultPayload: jsonb("apply_result_payload"),
  /** Optional reason for approve/reject (e.g. "confirmed match"). */
  reviewDecisionReason: text("review_decision_reason"),
  /** Pipeline: input mode (text_pdf, scanned_pdf, image_document, unsupported). */
  inputMode: text("input_mode"),
  /** Pipeline: extraction mode (text, vision_fallback). */
  extractionMode: text("extraction_mode"),
  /** Pipeline: classified document type. */
  detectedDocumentType: text("detected_document_type"),
  /** Pipeline: subtype from classification layer. */
  detectedDocumentSubtype: text("detected_document_subtype"),
  /** Pipeline: lifecycle status (contract/proposal/offer/...). */
  lifecycleStatus: text("lifecycle_status"),
  /** Pipeline: intent derived from type + lifecycle. */
  documentIntent: text("document_intent"),
  /** Pipeline: trace without document content (inputMode, documentType, classificationConfidence, extractionMode, warnings, failedStep). */
  extractionTrace: jsonb("extraction_trace"),
  /** Pipeline: validation warnings [{ code, message, field? }]. */
  validationWarnings: jsonb("validation_warnings"),
  /** Pipeline: section/field confidence map. */
  fieldConfidenceMap: jsonb("field_confidence_map"),
  /** Pipeline: classification reasons from AI. */
  classificationReasons: jsonb("classification_reasons").$type<string[]>(),
  /** Pipeline: aggregate completeness stats. */
  dataCompleteness: jsonb("data_completeness"),
  /** GDPR profile of extracted document. */
  sensitivityProfile: text("sensitivity_profile"),
  /** GDPR section-level sensitivity map. */
  sectionSensitivity: jsonb("section_sensitivity"),
  /** Explicit relationship inference block from extraction. */
  relationshipInference: jsonb("relationship_inference"),
  /** Human correction: snapshot of payload before correction. */
  originalExtractedPayload: jsonb("original_extracted_payload"),
  /** Human correction: user-corrected payload. */
  correctedPayload: jsonb("corrected_payload"),
  /** Human correction: list of field names that were corrected. */
  correctedFields: jsonb("corrected_fields").$type<string[]>(),
  /** Human correction: corrected classification primary type. */
  correctedDocumentType: text("corrected_document_type"),
  /** Human correction: corrected lifecycle status. */
  correctedLifecycleStatus: text("corrected_lifecycle_status"),
  /** Human correction: fields marked explicitly not applicable. */
  fieldMarkedNotApplicable: jsonb("field_marked_not_applicable").$type<string[]>(),
  /** Human correction: force linked client / deal for apply. */
  linkedClientOverride: uuid("linked_client_override"),
  linkedDealOverride: uuid("linked_deal_override"),
  /** Human correction: explicit confidence override. */
  confidenceOverride: jsonb("confidence_override").$type<number>(),
  /** Human correction: warnings ignored by reviewer. */
  ignoredWarnings: jsonb("ignored_warnings").$type<string[]>(),
  /** Human correction: reason for correction. */
  correctionReason: text("correction_reason"),
  /** Human correction: user id. */
  correctedBy: text("corrected_by"),
  /** Human correction: timestamp. */
  correctedAt: timestamp("corrected_at", { withTimezone: true }),
  /**
   * Deterministic client match verdict computed during processing.
   * Values: existing_match | near_match | ambiguous_match | no_match | null (legacy rows).
   */
  matchVerdict: text("match_verdict"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
