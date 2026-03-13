import { pgTable, uuid, text, timestamp, bigint, jsonb } from "drizzle-orm/pg-core";

/** Processing status for contract upload pipeline. */
export type ContractProcessingStatus =
  | "uploaded"
  | "processing"
  | "extracted"
  | "review_required"
  | "failed";

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
  errorMessage: text("error_message"),
  extractedPayload: jsonb("extracted_payload"),
  clientMatchCandidates: jsonb("client_match_candidates"),
  draftActions: jsonb("draft_actions"),
  confidence: jsonb("confidence").$type<number>(),
  reasonsForReview: jsonb("reasons_for_review").$type<string[]>(),
  reviewStatus: text("review_status").$type<ContractReviewStatus>().default("pending"),
  uploadedBy: text("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
