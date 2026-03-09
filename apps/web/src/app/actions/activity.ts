"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db, activityLog, eq, and, desc } from "db";

export type ActivityRow = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  meta: Record<string, unknown> | null;
  createdAt: Date;
};

export async function logActivity(
  entityType: string,
  entityId: string,
  action: string,
  meta?: Record<string, unknown>,
) {
  const auth = await requireAuthInAction();
  await db.insert(activityLog).values({
    tenantId: auth.tenantId,
    userId: auth.userId,
    entityType,
    entityId,
    action,
    meta: (meta ?? null) as any,
  });
}

export async function getActivityForEntity(
  entityType: string,
  entityId: string,
): Promise<ActivityRow[]> {
  const auth = await requireAuthInAction();
  const rows = await db
    .select({
      id: activityLog.id,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      action: activityLog.action,
      meta: activityLog.meta,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.tenantId, auth.tenantId),
        eq(activityLog.entityType, entityType),
        eq(activityLog.entityId, entityId),
      ),
    )
    .orderBy(desc(activityLog.createdAt))
    .limit(50);
  return rows as ActivityRow[];
}

export async function getActivityForContact(
  contactId: string,
): Promise<ActivityRow[]> {
  const auth = await requireAuthInAction();
  const rows = await db
    .select({
      id: activityLog.id,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      action: activityLog.action,
      meta: activityLog.meta,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.tenantId, auth.tenantId),
        eq(activityLog.entityType, "contact"),
        eq(activityLog.entityId, contactId),
      ),
    )
    .orderBy(desc(activityLog.createdAt))
    .limit(50);
  return rows as ActivityRow[];
}

export async function getRecentActivity(
  limit: number = 10,
): Promise<ActivityRow[]> {
  const auth = await requireAuthInAction();
  const rows = await db
    .select({
      id: activityLog.id,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      action: activityLog.action,
      meta: activityLog.meta,
      createdAt: activityLog.createdAt,
    })
    .from(activityLog)
    .where(eq(activityLog.tenantId, auth.tenantId))
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
  return rows as ActivityRow[];
}
