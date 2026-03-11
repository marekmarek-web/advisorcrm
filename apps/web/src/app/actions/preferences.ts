"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db } from "db";
import { advisorPreferences } from "db";
import { eq, and } from "db";
import { getDefaultQuickActionsConfig } from "@/lib/quick-actions";

export type QuickActionsConfig = {
  order: string[];
  visible: Record<string, boolean>;
};

export async function getQuickActionsConfig(): Promise<QuickActionsConfig> {
  try {
    const auth = await requireAuthInAction();
    const row = await db
      .select({ quickActions: advisorPreferences.quickActions })
      .from(advisorPreferences)
      .where(
        and(
          eq(advisorPreferences.tenantId, auth.tenantId),
          eq(advisorPreferences.userId, auth.userId)
        )
      )
      .limit(1);

    const raw = row[0]?.quickActions;
    if (!raw || typeof raw !== "object" || !("order" in raw) || !Array.isArray((raw as { order?: string[] }).order)) {
      return getDefaultQuickActionsConfig();
    }
    const data = raw as { order: string[]; visible?: Record<string, boolean> };
    const visible = typeof data.visible === "object" && data.visible !== null ? data.visible : {};
    return {
      order: Array.isArray(data.order) ? data.order : getDefaultQuickActionsConfig().order,
      visible,
    };
  } catch {
    return getDefaultQuickActionsConfig();
  }
}

export async function setQuickActionsConfig(
  order: string[],
  visible: Record<string, boolean>
): Promise<void> {
  const auth = await requireAuthInAction();
  const existing = await db
    .select({ id: advisorPreferences.id })
    .from(advisorPreferences)
    .where(
      and(
        eq(advisorPreferences.tenantId, auth.tenantId),
        eq(advisorPreferences.userId, auth.userId)
      )
    )
    .limit(1);

  const quickActions = { order, visible };
  if (existing.length > 0) {
    await db
      .update(advisorPreferences)
      .set({
        quickActions,
        updatedAt: new Date(),
      })
      .where(eq(advisorPreferences.id, existing[0].id));
  } else {
    await db.insert(advisorPreferences).values({
      userId: auth.userId,
      tenantId: auth.tenantId,
      quickActions,
    });
  }
}
