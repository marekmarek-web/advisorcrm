/**
 * Lightweight in-memory assistant session state (Plan 5B.3).
 * TTL: 30 minutes. No DB persistence for v1.
 */

import type { SuggestedAction } from "./dashboard-types";

export type AssistantSession = {
  sessionId: string;
  tenantId: string;
  userId: string;
  activeClientId?: string;
  activeReviewId?: string;
  activePaymentContactId?: string;
  lastSuggestedActions: SuggestedAction[];
  lastWarnings: string[];
  messageCount: number;
  createdAt: Date;
};

const SESSION_TTL_MS = 30 * 60 * 1000;

const sessions = new Map<string, AssistantSession>();

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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

  const newId = sessionId ?? generateSessionId();
  const session: AssistantSession = {
    sessionId: newId,
    tenantId,
    userId,
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
): void {
  if (!activeContext) return;
  if ("clientId" in activeContext) {
    session.activeClientId = activeContext.clientId ?? undefined;
  }
  if ("reviewId" in activeContext) {
    session.activeReviewId = activeContext.reviewId ?? undefined;
  }
  if ("paymentContactId" in activeContext) {
    session.activePaymentContactId = activeContext.paymentContactId ?? undefined;
  }
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
