import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { hasPermission, type RoleName } from "@/lib/auth/get-membership";
import { TeamOverviewView } from "./TeamOverviewView";
import { getTeamOverviewKpis, getTeamMemberMetrics, getTeamAlerts, getNewcomerAdaptation, listTeamMembersWithNames, getTeamPerformanceOverTime } from "@/app/actions/team-overview";

export const dynamic = "force-dynamic";

export default async function TeamOverviewPage() {
  const auth = await requireAuth();
  if (!hasPermission(auth.roleName as RoleName, "team_overview:read")) {
    redirect("/portal");
  }

  const canCreateTeamCalendar = hasPermission(auth.roleName as RoleName, "team_calendar:write");
  const period: "week" | "month" | "quarter" = "month";
  const [kpis, members, metrics, alerts, newcomers, performanceOverTime] = await Promise.all([
    getTeamOverviewKpis(period).catch(() => null),
    listTeamMembersWithNames().catch(() => []),
    getTeamMemberMetrics(period).catch(() => []),
    getTeamAlerts(period).catch(() => []),
    getNewcomerAdaptation().catch(() => []),
    getTeamPerformanceOverTime(period).catch(() => []),
  ]);

  return (
    <TeamOverviewView
      teamId={auth.tenantId}
      initialKpis={kpis}
      initialMembers={members}
      initialMetrics={metrics}
      initialAlerts={alerts}
      initialNewcomers={newcomers}
      initialPerformanceOverTime={performanceOverTime}
      defaultPeriod={period}
      canCreateTeamCalendar={canCreateTeamCalendar}
    />
  );
}
