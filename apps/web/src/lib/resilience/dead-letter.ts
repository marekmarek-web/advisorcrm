/**
 * Dead letter persistence (Plan 9B).
 * Stores failed job payloads for manual replay or inspection.
 */

import { db, deadLetterItems, eq, and, desc } from "db";

export type DeadLetterStatus = "pending" | "retried" | "discarded";

export async function addToDeadLetter(params: {
  tenantId: string;
  jobType: string;
  payload: Record<string, unknown>;
  failureReason?: string;
  attempts?: number;
  correlationId?: string;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(deadLetterItems)
    .values({
      tenantId: params.tenantId,
      jobType: params.jobType,
      payload: params.payload,
      failureReason: params.failureReason ?? null,
      attempts: params.attempts ?? 0,
      status: "pending",
      correlationId: params.correlationId ?? null,
    })
    .returning({ id: deadLetterItems.id });

  if (!row) throw new Error("Failed to insert dead letter item");
  return { id: row.id };
}

export async function listDeadLetterItems(
  tenantId: string,
  options: { status?: DeadLetterStatus; limit?: number } = {}
): Promise<
  Array<{
    id: string;
    tenantId: string;
    jobType: string;
    payload: Record<string, unknown>;
    failureReason: string | null;
    attempts: number;
    status: string;
    correlationId: string | null;
    createdAt: string;
    updatedAt: string;
  }>
> {
  const limit = options.limit ?? 50;
  const conditions = [eq(deadLetterItems.tenantId, tenantId)];
  if (options.status) {
    conditions.push(eq(deadLetterItems.status, options.status));
  }

  const rows = await db
    .select()
    .from(deadLetterItems)
    .where(and(...conditions))
    .orderBy(desc(deadLetterItems.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    jobType: r.jobType,
    payload: (r.payload ?? {}) as Record<string, unknown>,
    failureReason: r.failureReason ?? null,
    attempts: r.attempts,
    status: r.status,
    correlationId: r.correlationId ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export type RetryDeadLetterResult = {
  id: string;
  tenantId: string;
  jobType: string;
  payload: Record<string, unknown>;
  attempts: number;
  correlationId: string | null;
};

/**
 * Marks item as retried and returns payload for the worker to re-enqueue.
 * Caller must perform the actual job dispatch.
 */
export async function retryDeadLetterItem(
  tenantId: string,
  itemId: string
): Promise<RetryDeadLetterResult> {
  const [existing] = await db
    .select()
    .from(deadLetterItems)
    .where(and(eq(deadLetterItems.tenantId, tenantId), eq(deadLetterItems.id, itemId)))
    .limit(1);

  if (!existing) throw new Error(`Dead letter item ${itemId} not found`);

  const nextAttempts = existing.attempts + 1;

  await db
    .update(deadLetterItems)
    .set({
      status: "retried",
      attempts: nextAttempts,
      updatedAt: new Date(),
    })
    .where(and(eq(deadLetterItems.tenantId, tenantId), eq(deadLetterItems.id, itemId)));

  return {
    id: existing.id,
    tenantId: existing.tenantId,
    jobType: existing.jobType,
    payload: (existing.payload ?? {}) as Record<string, unknown>,
    attempts: nextAttempts,
    correlationId: existing.correlationId ?? null,
  };
}

export async function discardDeadLetterItem(tenantId: string, itemId: string): Promise<void> {
  await db
    .update(deadLetterItems)
    .set({ status: "discarded", updatedAt: new Date() })
    .where(and(eq(deadLetterItems.tenantId, tenantId), eq(deadLetterItems.id, itemId)));
}
