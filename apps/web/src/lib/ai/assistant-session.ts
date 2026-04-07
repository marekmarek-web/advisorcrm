/**
 * Lightweight in-memory assistant session state.
 * TTL: 30 minutes. DB persistence via assistant_conversations when available.
 */

import type { SuggestedAction } from "./dashboard-types";
import type {
  AssistantChannel,
  AssistantMode,
  ContextLockState,
  ExecutionPlan,
} from "./assistant-domain-model";
import type { ExtractedFactBundle, ImageIntakeActionPlan, ReviewHandoffPayload } from "./image-intake/types";
import { defaultContextLock } from "./assistant-domain-model";
import { randomUUID } from "crypto";

/**
 * Saved state from an ambiguous_needs_input image intake that needs client resolution.
 * On next text message, the route checks for this and resumes the intake instead of
 * falling through to generic chat.
 */
export type PendingImageIntakeResolution = {
  intakeId: string;
  /** Pre-extracted facts from the multimodal pass — reused on resume to avoid re-parsing. */
  factBundle: ExtractedFactBundle;
  /** The original action plan (outputMode = "ambiguous_needs_input"). */
  actionPlan: ImageIntakeActionPlan;
  /** Why binding failed: "insufficient_binding" | "multiple_candidates" | "weak_candidate". */
  bindingState: string;
  /** Candidate list when bindingState is "multiple_candidates". */
  candidates: Array<{ id: string; label: string }>;
  /** Name signal extracted from the image, if any. */
  imageNameSignal: string | null;
  /** Classification input type, forwarded for resume context. */
  inputType: string | null;
  /** ISO timestamp — expires after 15 min regardless of session TTL. */
  createdAt: string;
};

export type AssistantSession = {
  sessionId: string;
  tenantId: string;
  userId: string;
  activeClientId?: string;
  activeReviewId?: string;
  activePaymentContactId?: string;
  /** Once set, URL activeContext.clientId is ignored until switchClient clears the lock. */
  lockedClientId?: string;
  lockedDealId?: string;
  lockedOpportunityId?: string;
  lockedDocumentId?: string;
  activeChannel?: AssistantChannel;
  assistantMode: AssistantMode;
  contextLock: ContextLockState;
  lastExecutionPlan?: ExecutionPlan;
  lastSuggestedActions: SuggestedAction[];
  lastWarnings: string[];
  messageCount: number;
  createdAt: Date;
  /**
   * Set to true when client resolution was ambiguous (multiple matches).
   * Next message should be treated as a disambiguation attempt — auto-lock
   * from URL context is suppressed and resolveClientRef searches again.
   */
  pendingClientDisambiguation?: boolean;
  /** Server-side guard against concurrent confirm/execute requests. */
  _confirmationInProgress?: boolean;
  /**
   * P5: rolling, truncated user snippets for intent extraction continuity (same session / thread).
   * Updated after each successful chat turn; never sent back to the client as-is.
   */
  conversationDigest?: string;
  /**
   * Phase 10: After advisor confirms a handoff submit action, the AI Review queue row ID is stored
   * here so that lifecycle feedback can be surfaced in the next response without a polling loop.
   * Reset when a new intake is started or session is cleared.
   */
  lastImageIntakeHandoffReviewRowId?: string | null;
  /**
   * Phase 11: Typed field for the last image intake handoff payload produced by the orchestrator.
   * Stored by the route-handler after each successful intake run when a handoff is recommended.
   * Used by confirm-flow-lifecycle to submit to AI Review queue on advisor confirm.
   * Not persisted beyond session TTL.
   */
  lastImageIntakeHandoffPayload?: ReviewHandoffPayload | null;
  /**
   * Continuation: pending image intake resolution waiting for client disambiguation.
   * Set when image intake ends as ambiguous_needs_input due to missing/ambiguous client.
   * Cleared after successful resume or after 15 min expiry.
   */
  pendingImageIntakeResolution?: PendingImageIntakeResolution | null;
};

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_CONVERSATION_DIGEST_LEN = 560;

/** Append a short user snippet for the next canonical intent call (P5). */
export function appendToConversationDigest(session: AssistantSession, userMessage: string): void {
  const t = userMessage.trim().replace(/\s+/g, " ").slice(0, 220);
  if (!t) return;
  const prev = (session.conversationDigest ?? "").trim();
  const sep = prev ? " · " : "";
  let next = (prev + sep + t).trim();
  if (next.length > MAX_CONVERSATION_DIGEST_LEN) {
    next = next.slice(-MAX_CONVERSATION_DIGEST_LEN);
  }
  session.conversationDigest = next;
}

const sessions = new Map<string, AssistantSession>();

function generateSessionId(): string {
  return randomUUID();
}

function isUuid(val: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
}

function purgeExpired(): void {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now - session.createdAt.getTime() > SESSION_TTL_MS) {
      sessions.delete(key);
    }
  }
}

export function getOrCreateSession(
  sessionId: string | undefined,
  tenantId: string,
  userId: string,
): AssistantSession {
  purgeExpired();

  if (sessionId && sessions.has(sessionId)) {
    const existing = sessions.get(sessionId)!;
    if (existing.tenantId === tenantId && existing.userId === userId) {
      return existing;
    }
  }

  const newId = sessionId && isUuid(sessionId) ? sessionId : generateSessionId();
  const session: AssistantSession = {
    sessionId: newId,
    tenantId,
    userId,
    assistantMode: "quick_assistant",
    contextLock: defaultContextLock(),
    lastSuggestedActions: [],
    lastWarnings: [],
    messageCount: 0,
    createdAt: new Date(),
  };
  sessions.set(newId, session);
  return session;
}

export type ActiveContext = {
  clientId?: string | null;
  opportunityId?: string | null;
  reviewId?: string | null;
  paymentContactId?: string | null;
};

export function updateSessionContext(
  session: AssistantSession,
  activeContext?: ActiveContext,
  options?: { skipClientIdFromUi?: boolean },
): string[] {
  const warnings: string[] = [];
  if (!activeContext) return warnings;

  if ("clientId" in activeContext) {
    const incomingClientId = activeContext.clientId ?? undefined;
    if (
      incomingClientId &&
      session.lockedClientId &&
      incomingClientId !== session.lockedClientId
    ) {
      if (options?.skipClientIdFromUi) {
        warnings.push(
          "URL je na jiném klientovi, ale asistent zůstává zamčený na původního klienta. Pro změnu kontextu napište „přepni klienta\".",
        );
      } else {
        clearAssistantClientLock(session);
        session.lastExecutionPlan = undefined;
        session.activeClientId = incomingClientId;
        warnings.push("Detekuji změnu klienta podle URL kontextu — předchozí kontext vymazán.");
      }
    } else if (!options?.skipClientIdFromUi) {
      session.activeClientId = incomingClientId;
      // Incoming URL client clears stale disambiguation state
      if (incomingClientId) session.pendingClientDisambiguation = false;
    }
  }
  if ("opportunityId" in activeContext) {
    const oid = activeContext.opportunityId ?? undefined;
    if (oid) {
      lockAssistantOpportunity(session, oid);
    }
  }
  if ("reviewId" in activeContext) {
    session.activeReviewId = activeContext.reviewId ?? undefined;
    session.contextLock.lockedReviewId = activeContext.reviewId ?? null;
  }
  if ("paymentContactId" in activeContext) {
    session.activePaymentContactId = activeContext.paymentContactId ?? undefined;
  }
  return warnings;
}

export function lockAssistantClient(session: AssistantSession, contactId: string): void {
  session.lockedClientId = contactId;
  session.activeClientId = contactId;
  session.contextLock.lockedClientId = contactId;
}

export function lockAssistantOpportunity(session: AssistantSession, opportunityId: string): void {
  session.lockedOpportunityId = opportunityId;
  session.contextLock.lockedOpportunityId = opportunityId;
}

export function lockAssistantDocument(session: AssistantSession, documentId: string): void {
  session.lockedDocumentId = documentId;
  session.contextLock.lockedDocumentId = documentId;
}

/** Zamkne AI contract review — synchronně s `contextLock.lockedReviewId` pro 2B safety. */
export function lockAssistantReview(session: AssistantSession, reviewId: string): void {
  session.activeReviewId = reviewId;
  session.contextLock.lockedReviewId = reviewId;
}

export function setAssistantMode(session: AssistantSession, mode: AssistantMode): void {
  session.assistantMode = mode;
  session.contextLock.assistantMode = mode;
}

export function setAssistantChannel(session: AssistantSession, channel: AssistantChannel): void {
  session.activeChannel = channel;
  session.contextLock.activeChannel = channel;
}

export function clearPendingImageIntakeResolution(session: AssistantSession): void {
  session.pendingImageIntakeResolution = null;
}

export function clearAssistantClientLock(session: AssistantSession): void {
  session.lockedClientId = undefined;
  session.lockedDealId = undefined;
  session.lockedOpportunityId = undefined;
  session.lockedDocumentId = undefined;
  session.activeReviewId = undefined;
  session.contextLock = defaultContextLock();
  session.contextLock.assistantMode = session.assistantMode;
  // Clear disambiguation state so the next message can resolve a fresh client
  session.pendingClientDisambiguation = false;
}

export function incrementMessageCount(session: AssistantSession): void {
  session.messageCount += 1;
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function getSessionCount(): number {
  purgeExpired();
  return sessions.size;
}
