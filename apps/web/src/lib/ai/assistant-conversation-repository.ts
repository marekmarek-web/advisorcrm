import { db, assistantConversations, assistantMessages, and, eq, desc, isNotNull, gte } from "db";
import type { AssistantSession } from "./assistant-session";
import type { AssistantConversationRow } from "./assistant-history-mapper";
import type { AssistantChannel } from "./assistant-domain-model";
import type { CanonicalIntent, ExecutionPlan } from "./assistant-domain-model";
import { isResumableExecutionPlanStatus, normalizeExecutionPlanFromDb } from "./assistant-plan-snapshot";

export type AssistantConversationHydration = {
  channel: AssistantChannel | null;
  assistantMode: string | null;
  lockedContactId: string | null;
  metadata: Record<string, unknown> | null;
};

export async function loadConversationHydration(
  conversationId: string,
  tenantId: string,
  userId: string,
): Promise<AssistantConversationHydration | null> {
  const [row] = await db
    .select({
      channel: assistantConversations.channel,
      assistantMode: assistantConversations.assistantMode,
      lockedContactId: assistantConversations.lockedContactId,
      metadata: assistantConversations.metadata,
    })
    .from(assistantConversations)
    .where(
      and(
        eq(assistantConversations.id, conversationId),
        eq(assistantConversations.tenantId, tenantId),
        eq(assistantConversations.userId, userId),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    channel: (row.channel as AssistantChannel | null) ?? null,
    assistantMode: row.assistantMode ?? null,
    lockedContactId: row.lockedContactId ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}

export async function upsertConversationFromSession(
  session: AssistantSession,
  options?: { channel?: AssistantChannel | null; metadata?: Record<string, unknown> | null },
): Promise<void> {
  const now = new Date();
  const channel = options?.channel ?? session.activeChannel ?? null;
  const metadata = options?.metadata ?? null;

  const [existing] = await db
    .select({ id: assistantConversations.id })
    .from(assistantConversations)
    .where(
      and(
        eq(assistantConversations.id, session.sessionId),
        eq(assistantConversations.tenantId, session.tenantId),
        eq(assistantConversations.userId, session.userId),
      ),
    )
    .limit(1);

  if (!existing) {
    await db.insert(assistantConversations).values({
      id: session.sessionId,
      tenantId: session.tenantId,
      userId: session.userId,
      channel,
      assistantMode: session.assistantMode,
      lockedContactId: session.lockedClientId ?? null,
      metadata,
      createdAt: now,
      updatedAt: now,
    });
    return;
  }

  await db
    .update(assistantConversations)
    .set({
      channel,
      assistantMode: session.assistantMode,
      lockedContactId: session.lockedClientId ?? null,
      metadata,
      updatedAt: now,
    })
    .where(
      and(
        eq(assistantConversations.id, session.sessionId),
        eq(assistantConversations.tenantId, session.tenantId),
        eq(assistantConversations.userId, session.userId),
      ),
    );
}

export async function appendConversationMessage(params: {
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  intentSnapshot?: CanonicalIntent | null;
  executionPlanSnapshot?: ExecutionPlan | null;
  referencedEntities?: { type: string; id: string; label?: string }[] | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  await db.insert(assistantMessages).values({
    conversationId: params.conversationId,
    role: params.role,
    content: params.content,
    intentSnapshot: params.intentSnapshot ?? null,
    executionPlanSnapshot: params.executionPlanSnapshot ?? null,
    referencedEntities: params.referencedEntities ?? null,
    meta: params.meta ?? null,
  });
}

/**
 * Latest non-null execution plan snapshot from this conversation (assistant messages).
 * Used to resume „ano/ne“ after server restart or another instance.
 */
export async function loadResumableExecutionPlanSnapshot(conversationId: string): Promise<ExecutionPlan | null> {
  const [row] = await db
    .select({ executionPlanSnapshot: assistantMessages.executionPlanSnapshot })
    .from(assistantMessages)
    .where(
      and(eq(assistantMessages.conversationId, conversationId), isNotNull(assistantMessages.executionPlanSnapshot)),
    )
    .orderBy(desc(assistantMessages.createdAt))
    .limit(1);

  const plan = normalizeExecutionPlanFromDb(row?.executionPlanSnapshot ?? null);
  if (!plan || !isResumableExecutionPlanStatus(plan)) return null;
  return plan;
}

/**
 * Poslední zprávy podle ID konverzace (bez kontroly tenant/user).
 * Pro poradce v UI použijte {@link loadAssistantConversationHistoryMessagesForUser}.
 */
export async function loadRecentConversationMessages(
  conversationId: string,
  limit = 20,
): Promise<
  {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: Date;
  }[]
> {
  const rows = await db
    .select({
      id: assistantMessages.id,
      role: assistantMessages.role,
      content: assistantMessages.content,
      createdAt: assistantMessages.createdAt,
    })
    .from(assistantMessages)
    .where(eq(assistantMessages.conversationId, conversationId))
    .orderBy(desc(assistantMessages.createdAt))
    .limit(Math.max(1, Math.min(limit, 100)));

  return rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant" | "system",
    content: r.content,
    createdAt: r.createdAt,
  }));
}

/** Advisor: konverzace uživatele v tenantovi aktualizované od `since` (např. posledních 7 dní). */
export async function listAssistantConversationsForUser(
  tenantId: string,
  userId: string,
  options?: { since?: Date; limit?: number },
): Promise<
  {
    id: string;
    channel: string | null;
    lockedContactId: string | null;
    updatedAt: Date;
    createdAt: Date;
  }[]
> {
  const since = options?.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const limit = Math.min(Math.max(options?.limit ?? 40, 1), 60);
  return db
    .select({
      id: assistantConversations.id,
      channel: assistantConversations.channel,
      lockedContactId: assistantConversations.lockedContactId,
      updatedAt: assistantConversations.updatedAt,
      createdAt: assistantConversations.createdAt,
    })
    .from(assistantConversations)
    .where(
      and(
        eq(assistantConversations.tenantId, tenantId),
        eq(assistantConversations.userId, userId),
        gte(assistantConversations.updatedAt, since),
      ),
    )
    .orderBy(desc(assistantConversations.updatedAt))
    .limit(limit);
}

export type AssistantMessageHistoryDbRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
  meta: Record<string, unknown> | null;
  executionPlanSnapshot: unknown;
};

/**
 * Posledních `limit` zpráv konverzace (nejnovější první), pouze pokud konverzace patří tenant+user.
 * Pro zobrazení chronologicky se pole na konci obrátí.
 */
export async function loadAssistantConversationHistoryMessagesForUser(
  conversationId: string,
  tenantId: string,
  userId: string,
  limit = 60,
): Promise<{ conversation: AssistantConversationRow | null; messages: AssistantMessageHistoryDbRow[] }> {
  const [conv] = await db
    .select({
      id: assistantConversations.id,
      channel: assistantConversations.channel,
      lockedContactId: assistantConversations.lockedContactId,
      updatedAt: assistantConversations.updatedAt,
    })
    .from(assistantConversations)
    .where(
      and(
        eq(assistantConversations.id, conversationId),
        eq(assistantConversations.tenantId, tenantId),
        eq(assistantConversations.userId, userId),
      ),
    )
    .limit(1);

  if (!conv) {
    return { conversation: null, messages: [] };
  }

  const conversation: AssistantConversationRow = {
    id: conv.id,
    channel: conv.channel,
    lockedContactId: conv.lockedContactId,
    updatedAt: conv.updatedAt,
  };

  const cap = Math.max(1, Math.min(limit, 100));
  const rows = await db
    .select({
      id: assistantMessages.id,
      role: assistantMessages.role,
      content: assistantMessages.content,
      createdAt: assistantMessages.createdAt,
      meta: assistantMessages.meta,
      executionPlanSnapshot: assistantMessages.executionPlanSnapshot,
    })
    .from(assistantMessages)
    .where(eq(assistantMessages.conversationId, conversationId))
    .orderBy(desc(assistantMessages.createdAt))
    .limit(cap);

  const messages: AssistantMessageHistoryDbRow[] = rows.map((r) => ({
    id: r.id,
    role: r.role as "user" | "assistant" | "system",
    content: r.content,
    createdAt: r.createdAt,
    meta: (r.meta as Record<string, unknown> | null) ?? null,
    executionPlanSnapshot: r.executionPlanSnapshot,
  }));

  return { conversation, messages: messages.reverse() };
}
