/**
 * Analytics scope layer (Plan 7A.1).
 * Role-based data visibility for all analytics queries.
 */

import type { RoleName } from "@/lib/auth/permissions";

export type ScopeType = "advisor" | "manager" | "director" | "admin";

export type AnalyticsScope = {
  tenantId: string;
  userId: string;
  roleName: RoleName;
  visibleUserIds: string[];
  scopeType: ScopeType;
};

export function deriveScopeType(roleName: RoleName): ScopeType {
  switch (roleName) {
    case "Admin": return "admin";
    case "Director": return "director";
    case "Manager": return "manager";
    default: return "advisor";
  }
}

export async function resolveAnalyticsScope(
  tenantId: string,
  userId: string,
  roleName: RoleName,
): Promise<AnalyticsScope> {
  const scopeType = deriveScopeType(roleName);

  if (scopeType === "advisor") {
    return { tenantId, userId, roleName, visibleUserIds: [userId], scopeType };
  }

  try {
    const { getVisibleUserIds } = await import("@/lib/team-hierarchy");
    const visibleUserIds = await getVisibleUserIds(tenantId, userId, roleName);
    return { tenantId, userId, roleName, visibleUserIds, scopeType };
  } catch {
    return { tenantId, userId, roleName, visibleUserIds: [userId], scopeType };
  }
}

export function isUserInScope(scope: AnalyticsScope, targetUserId: string): boolean {
  if (scope.scopeType === "admin" || scope.scopeType === "director") return true;
  return scope.visibleUserIds.includes(targetUserId);
}

export type TimeWindow = {
  startDate: Date;
  endDate: Date;
};

export function resolveTimeWindow(windowDays: number = 7): TimeWindow {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - windowDays * 24 * 60 * 60 * 1000);
  return { startDate, endDate };
}

export function canAccessAnalytics(roleName: RoleName, level: "advisor" | "team" | "executive" | "pipeline"): boolean {
  switch (level) {
    case "advisor": return true;
    case "team": return ["Admin", "Director", "Manager"].includes(roleName);
    case "executive": return ["Admin", "Director"].includes(roleName);
    case "pipeline": return ["Admin", "Director"].includes(roleName);
  }
}
