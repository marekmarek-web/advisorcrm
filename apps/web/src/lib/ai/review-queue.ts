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

export type DraftActionType = "create_client" | "create_task" | "create_payment" | "draft_email";

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
