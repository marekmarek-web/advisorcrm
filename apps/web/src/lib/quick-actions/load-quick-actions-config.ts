import "server-only";

import { db } from "db";
import { advisorPreferences } from "db";
import { and, eq } from "db";
import { getDefaultQuickActionsConfig, type QuickActionsConfig } from "@/lib/quick-actions";

/**
 * Načte quickActions z DB pro daného uživatele/tenanta (RSC + sdílená logika se server action).
 */
export async function loadQuickActionsConfig(
  tenantId: string,
  userId: string
): Promise<QuickActionsConfig> {
  try {
    const row = await db
      .select({ quickActions: advisorPreferences.quickActions })
      .from(advisorPreferences)
      .where(
        and(eq(advisorPreferences.tenantId, tenantId), eq(advisorPreferences.userId, userId))
      )
      .limit(1);

    const raw = row[0]?.quickActions;
    if (
      !raw ||
      typeof raw !== "object" ||
      !("order" in raw) ||
      !Array.isArray((raw as { order?: string[] }).order)
    ) {
      return getDefaultQuickActionsConfig();
    }
    const data = raw as { order: string[]; visible?: Record<string, boolean> };
    const visible =
      typeof data.visible === "object" && data.visible !== null ? data.visible : {};
    return {
      order: Array.isArray(data.order) ? data.order : getDefaultQuickActionsConfig().order,
      visible,
    };
  } catch {
    return getDefaultQuickActionsConfig();
  }
}
