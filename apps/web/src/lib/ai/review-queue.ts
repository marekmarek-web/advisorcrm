/**
 * Review queue foundation: types and data structures for AI-extracted items
 * that may need human review (e.g. contract parties, suggested client match).
 */

/** 0–1 score from model or matcher; higher = more confident. */
export type ConfidenceScore = number;

/** When true, item should appear in review queue for human decision. */
export type NeedsHumanReview = boolean;

export interface ExtractedClientMatchCandidate {
  contactId?: string | null;
  displayName: string;
  score: ConfidenceScore;
  reason?: string;
}

/** Confidence tier for client matching. */
export type MatchConfidence = "high" | "medium" | "low";

/** Which fields contributed to the match. */
export interface MatchedFields {
  fullName?: boolean;
  firstName?: boolean;
  lastName?: boolean;
  birthDate?: boolean;
  personalId?: boolean;
  companyId?: boolean;
  email?: boolean;
  phone?: boolean;
  address?: boolean;
}

/** Full client match candidate from matching engine (Phase 4). */
export interface ClientMatchCandidate {
  clientId: string;
  score: number;
  confidence: MatchConfidence;
  reasons: string[];
  matchedFields: MatchedFields;
  /** Display name for UI (from CRM contact). */
  displayName?: string;
}

export type DraftActionType =
  | "create_client"
  | "create_contract"
  | "create_task"
  | "create_payment"
  | "draft_email"
  | "create_opportunity"
  | "create_income_verification_record"
  | "attach_to_existing_client"
  | "propose_financial_analysis_update"
  | "request_manual_review"
  | "create_or_update_contract_record"
  | "link_client"
  | "link_household"
  | "propose_financial_analysis_refresh"
  | "create_service_review_task"
  | "attach_to_existing_contract"
  | "create_service_task"
  | "request_contract_mapping"
  | "attach_to_client_documents"
  | "schedule_consultation"
  | "prepare_comparison"
  | "attach_to_client_or_company"
  | "attach_to_existing_financing_deal"
  | "update_income_profile"
  | "mark_as_supporting_document"
  | "create_or_link_company_entity"
  | "attach_to_business_client"
  | "attach_to_loan_or_financing_deal"
  | "create_manual_review_task";

export interface DraftActionBase {
  type: DraftActionType;
  label: string;
  payload: Record<string, unknown>;
}

export interface ReviewQueueItem {
  id: string;
  tenantId: string;
  sourceType: "contract" | "contact_import" | "other";
  sourceId?: string | null;
  confidenceScore: ConfidenceScore;
  needsHumanReview: NeedsHumanReview;
  extractedData: Record<string, unknown>;
  /** Suggested existing contacts when e.g. matching contract party to CRM contact. */
  clientMatchCandidates?: ExtractedClientMatchCandidate[];
  /** Suggested next steps (create client, task, payment, draft email). */
  draftActions?: DraftActionBase[];
  createdAt: string; // ISO
  resolvedAt?: string | null;
}
