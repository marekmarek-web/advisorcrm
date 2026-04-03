/**
 * Phase 2C: action fingerprinting for idempotency and duplicate detection.
 * Generates stable fingerprints for execution steps to prevent re-execution.
 */

import { createHash } from "crypto";
import type { ExecutionStep, WriteActionType } from "./assistant-domain-model";

const FINGERPRINT_KEYS_BY_ACTION: Record<WriteActionType, string[]> = {
  createOpportunity: ["contactId", "productDomain", "caseType", "taskTitle"],
  updateOpportunity: ["opportunityId", "title"],
  createTask: ["contactId", "taskTitle", "resolvedDate"],
  updateTask: ["taskId", "taskTitle"],
  createFollowUp: ["contactId", "taskTitle", "resolvedDate"],
  scheduleCalendarEvent: ["contactId", "taskTitle", "startAt", "resolvedDate"],
  createMeetingNote: ["contactId", "noteContent"],
  appendMeetingNote: ["meetingNoteId", "noteContent"],
  createInternalNote: ["contactId", "noteContent"],
  attachDocumentToClient: ["contactId", "documentId"],
  attachDocumentToOpportunity: ["opportunityId", "documentId"],
  classifyDocument: ["documentId", "documentType", "classification"],
  triggerDocumentReview: ["documentId"],
  approveAiContractReview: ["reviewId"],
  applyAiContractReviewToCrm: ["reviewId"],
  linkAiContractReviewToDocuments: ["reviewId"],
  setDocumentVisibleToClient: ["documentId"],
  linkDocumentToMaterialRequest: ["materialRequestId", "documentId"],
  createClientPortalNotification: ["contactId", "portalNotificationTitle"],
  createClientRequest: ["contactId", "productDomain", "noteContent"],
  updateClientRequest: ["opportunityId", "subject"],
  createMaterialRequest: ["contactId", "noteContent"],
  publishPortfolioItem: ["contractId"],
  updatePortfolioItem: ["contractId"],
  createReminder: ["contactId", "taskTitle", "resolvedDate"],
  draftEmail: ["contactId", "subject"],
  draftClientPortalMessage: ["contactId", "subject"],
  sendPortalMessage: ["contactId", "portalMessageBody", "noteContent"],
};

/**
 * Compute a deterministic fingerprint for an execution step.
 * Same step params → same fingerprint, regardless of run.
 */
export function computeStepFingerprint(step: ExecutionStep): string {
  const keys = FINGERPRINT_KEYS_BY_ACTION[step.action] ?? Object.keys(step.params).sort();
  const payload: Record<string, unknown> = { action: step.action };
  for (const k of keys) {
    const v = step.params[k];
    if (v !== undefined && v !== null) {
      payload[k] = v;
    }
  }
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

export type DuplicateCheckVerdict = {
  isDuplicate: boolean;
  fingerprint: string;
  existingActionId: string | null;
};

/**
 * Lightweight in-memory fingerprint cache per session to catch double-clicks / retries
 * within the same server process lifetime.
 */
const recentFingerprints = new Map<string, { actionId: string; ts: number }>();
const FINGERPRINT_TTL_MS = 5 * 60 * 1000;

function purgeStaleFingerprints() {
  const now = Date.now();
  for (const [k, v] of recentFingerprints) {
    if (now - v.ts > FINGERPRINT_TTL_MS) recentFingerprints.delete(k);
  }
}

/**
 * Check if this fingerprint was recently seen. Returns existing action ID if so.
 */
export function checkRecentFingerprint(
  sessionId: string,
  fingerprint: string,
): DuplicateCheckVerdict {
  purgeStaleFingerprints();
  const key = `${sessionId}:${fingerprint}`;
  const existing = recentFingerprints.get(key);
  if (existing) {
    return { isDuplicate: true, fingerprint, existingActionId: existing.actionId };
  }
  return { isDuplicate: false, fingerprint, existingActionId: null };
}

/**
 * Record a fingerprint after successful execution.
 */
export function recordFingerprint(
  sessionId: string,
  fingerprint: string,
  actionId: string,
): void {
  purgeStaleFingerprints();
  recentFingerprints.set(`${sessionId}:${fingerprint}`, { actionId, ts: Date.now() });
}
