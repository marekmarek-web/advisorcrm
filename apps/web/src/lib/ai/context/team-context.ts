"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/permissions";
import type { RoleName } from "@/shared/rolePermissions";
import {
  getTeamOverviewKpis,
  getTeamMemberMetrics,
  buildTeamAlertsFromMemberMetrics,
  getNewcomerAdaptation,
  listTeamMembersWithNames,
  type TeamOverviewPeriod,
} from "@/app/actions/team-overview";
import { resolveScopeForRole, type TeamOverviewScope } from "@/lib/team-hierarchy-types";
import type { TeamAiContextRaw } from "./team-context-render";

export type { TeamAiContextRaw } from "./team-context-render";

/** Aligns with `team-overview/page.tsx` when caller does not pass scope. */
function defaultTeamOverviewScopeForAi(roleName: RoleName): TeamOverviewScope {
  if (roleName === "Advisor" || roleName === "Viewer") return "me";
  if (roleName === "Director" || roleName === "Admin") return "full";
  return "my_team";
}

export async function buildTeamAiContextRaw(
  teamId: string,
  userId: string,
  period: string,
  scope?: TeamOverviewScope
): Promise<TeamAiContextRaw> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_overview:read")) throw new Error("Forbidden");
  if (teamId !== auth.tenantId) throw new Error("Forbidden");

  const role = auth.roleName as RoleName;
  const requested = scope ?? defaultTeamOverviewScopeForAi(role);
  const resolvedScope = resolveScopeForRole(role, requested);

  const periodTyped = period as TeamOverviewPeriod;
  const [kpis, members, metrics, newcomers] = await Promise.all([
    getTeamOverviewKpis(periodTyped, resolvedScope).catch(() => null),
    listTeamMembersWithNames(resolvedScope).catch(() => []),
    getTeamMemberMetrics(periodTyped, resolvedScope).catch(() => []),
    getNewcomerAdaptation(resolvedScope).catch(() => []),
  ]);
  const alerts = buildTeamAlertsFromMemberMetrics(metrics ?? []);

  const periodLabel =
    kpis?.periodLabel ?? (period === "week" ? "tento týden" : period === "quarter" ? "toto čtvrtletí" : "tento měsíc");

  return {
    teamId,
    period,
    userId,
    tenantId: auth.tenantId,
    periodLabel,
    kpis: kpis ?? null,
    members: members ?? [],
    metrics: metrics ?? [],
    alerts: alerts ?? [],
    newcomers: newcomers ?? [],
  };
}
