import { pgTable, uuid, text, timestamp, bigint, jsonb } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";

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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
