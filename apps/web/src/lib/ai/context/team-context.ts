"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { hasPermission } from "@/lib/auth/get-membership";
import {
  getTeamOverviewKpis,
  getTeamMemberMetrics,
  getTeamAlerts,
  getNewcomerAdaptation,
  listTeamMembersWithNames,
  type TeamOverviewPeriod,
} from "@/app/actions/team-overview";
import type { TeamAiContextRaw } from "./team-context-render";

export type { TeamAiContextRaw } from "./team-context-render";

export async function buildTeamAiContextRaw(
  teamId: string,
  userId: string,
  period: string
): Promise<TeamAiContextRaw> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName, "team_overview:read")) throw new Error("Forbidden");
  if (teamId !== auth.tenantId) throw new Error("Forbidden");

  const periodTyped = period as TeamOverviewPeriod;
  const [kpis, members, metrics, alerts, newcomers] = await Promise.all([
    getTeamOverviewKpis(periodTyped).catch(() => null),
    listTeamMembersWithNames().catch(() => []),
    getTeamMemberMetrics(periodTyped).catch(() => []),
    getTeamAlerts(periodTyped).catch(() => []),
    getNewcomerAdaptation().catch(() => []),
  ]);

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
