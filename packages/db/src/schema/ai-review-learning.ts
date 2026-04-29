import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { contractUploadReviews } from "./contract-upload-reviews";
import { documents } from "./documents";

export type AiReviewCorrectionType =
  | "missing_field_added"
  | "wrong_value_replaced"
  | "wrong_entity_mapping"
  | "wrong_premium_aggregation"
  | "wrong_document_classification"
  | "wrong_publish_decision"
  | "formatting_normalization"
  | "manual_override";

export type AiReviewLearningScope =
  | "tenant"
  | "institution"
  | "product"
  | "document_type"
  | "global_safe";

export type AiReviewPatternType =
  | "extraction_hint"
  | "validation_rule"
  | "premium_aggregation_rule"
  | "participant_detection_rule"
  | "publish_decision_rule"
  | "classification_hint"
  | "field_alias";

export type AiReviewPatternSeverity = "low" | "medium" | "high" | "critical";
export type AiReviewPiiLevel = "contains_customer_data" | "anonymized" | "aggregate_only";

export const aiReviewCorrectionEvents = pgTable("ai_review_correction_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  reviewId: uuid("review_id").notNull().references(() => contractUploadReviews.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  documentHash: text("document_hash"),
  extractionRunId: text("extraction_run_id"),
  institutionName: text("institution_name"),
  productName: text("product_name"),
  documentType: text("document_type"),
  lifecycleStatus: text("lifecycle_status"),
  fieldPath: text("field_path").notNull(),
  fieldLabel: text("field_label"),
  originalValueJson: jsonb("original_value_json"),
  correctedValueJson: jsonb("corrected_value_json").notNull(),
  normalizedOriginalValue: text("normalized_original_value"),
  normalizedCorrectedValue: text("normalized_corrected_value"),
  correctionType: text("correction_type").$type<AiReviewCorrectionType>().notNull(),
  sourcePage: integer("source_page"),
  evidenceSnippet: text("evidence_snippet"),
  promptVersion: text("prompt_version"),
  schemaVersion: text("schema_version"),
  modelName: text("model_name"),
  pipelineVersion: text("pipeline_version"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  acceptedOnApproval: boolean("accepted_on_approval").default(false).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  rejected: boolean("rejected").default(false).notNull(),
  rejectedReason: text("rejected_reason"),
  piiLevel: text("pii_level").$type<AiReviewPiiLevel>().default("contains_customer_data").notNull(),
  supersededBy: uuid("superseded_by"),
}, (t) => ({
  tenantReviewIdx: index("ai_review_correction_events_tenant_review_idx").on(t.tenantId, t.reviewId),
  scopeIdx: index("ai_review_correction_events_scope_idx").on(t.tenantId, t.institutionName, t.productName, t.documentType),
  fieldIdx: index("ai_review_correction_events_field_idx").on(t.tenantId, t.fieldPath),
  acceptedIdx: index("ai_review_correction_events_accepted_idx").on(t.tenantId, t.acceptedOnApproval),
  documentHashIdx: index("ai_review_correction_events_document_hash_idx").on(t.documentHash),
  extractionRunIdx: index("ai_review_correction_events_extraction_run_idx").on(t.extractionRunId),
}));

export const aiReviewLearningPatterns = pgTable("ai_review_learning_patterns", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  scope: text("scope").$type<AiReviewLearningScope>().notNull(),
  institutionName: text("institution_name"),
  productName: text("product_name"),
  documentType: text("document_type"),
  fieldPath: text("field_path"),
  patternType: text("pattern_type").$type<AiReviewPatternType>().notNull(),
  ruleText: text("rule_text").notNull(),
  promptHint: text("prompt_hint"),
  validatorHintJson: jsonb("validator_hint_json"),
  supportCount: integer("support_count").default(1).notNull(),
  confidence: numeric("confidence").default("0.5").notNull(),
  severity: text("severity").$type<AiReviewPatternSeverity>().default("medium").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  sourceCorrectionIds: jsonb("source_correction_ids").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
}, (t) => ({
  lookupIdx: index("ai_review_learning_patterns_lookup_idx").on(t.tenantId, t.scope, t.institutionName, t.productName, t.documentType),
  fieldIdx: index("ai_review_learning_patterns_field_idx").on(t.tenantId, t.fieldPath),
  enabledIdx: index("ai_review_learning_patterns_enabled_idx").on(t.tenantId, t.enabled),
}));

export const aiReviewEvalCases = pgTable("ai_review_eval_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  sourceReviewId: uuid("source_review_id").references(() => contractUploadReviews.id, { onDelete: "set null" }),
  sourceCorrectionIds: jsonb("source_correction_ids").$type<string[]>().default([]).notNull(),
  documentHash: text("document_hash"),
  anonymizedInputRef: text("anonymized_input_ref"),
  institutionName: text("institution_name"),
  productName: text("product_name"),
  documentType: text("document_type"),
  expectedOutputJson: jsonb("expected_output_json").notNull(),
  criticalFields: jsonb("critical_fields").$type<string[]>().notNull(),
  piiScrubbed: boolean("pii_scrubbed").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  activeIdx: index("ai_review_eval_cases_active_idx").on(t.tenantId, t.active),
  reviewIdx: index("ai_review_eval_cases_review_idx").on(t.sourceReviewId),
  scopeIdx: index("ai_review_eval_cases_scope_idx").on(t.tenantId, t.institutionName, t.productName, t.documentType),
}));

export type AiReviewCorrectionEventRow = typeof aiReviewCorrectionEvents.$inferSelect;
export type NewAiReviewCorrectionEvent = typeof aiReviewCorrectionEvents.$inferInsert;
export type AiReviewLearningPatternRow = typeof aiReviewLearningPatterns.$inferSelect;
export type NewAiReviewLearningPattern = typeof aiReviewLearningPatterns.$inferInsert;
export type AiReviewEvalCaseRow = typeof aiReviewEvalCases.$inferSelect;
export type NewAiReviewEvalCase = typeof aiReviewEvalCases.$inferInsert;
