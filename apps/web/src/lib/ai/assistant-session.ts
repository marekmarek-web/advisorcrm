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
import { defaultContextLock } from "./assistant-domain-model";
import { randomUUID } from "crypto";

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
};

const SESSION_TTL_MS = 30 * 60 * 1000;

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
      incomingClientId !== session.lockedClientId &&
      options?.skipClientIdFromUi
    ) {
      warnings.push(
        "URL je na jiném klientovi, ale asistent zůstává zamčený na původního klienta. Pro změnu kontextu napište „přepni klienta\".",
      );
    }
    if (!options?.skipClientIdFromUi) {
      if (session.activeClientId && incomingClientId && incomingClientId !== session.activeClientId) {
        warnings.push("Detekuji změnu klienta podle URL kontextu. Zkontrolujte, zda má asistent pokračovat u nového klienta.");
      }
      session.activeClientId = incomingClientId;
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

export function clearAssistantClientLock(session: AssistantSession): void {
  session.lockedClientId = undefined;
  session.lockedDealId = undefined;
  session.lockedOpportunityId = undefined;
  session.lockedDocumentId = undefined;
  session.activeReviewId = undefined;
  session.contextLock = defaultContextLock();
  session.contextLock.assistantMode = session.assistantMode;
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
