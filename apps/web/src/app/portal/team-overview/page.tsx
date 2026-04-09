import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { hasPermission, type RoleName } from "@/lib/auth/permissions";
import { TeamOverviewView } from "./TeamOverviewView";
import type { TeamOverviewScope } from "@/lib/team-hierarchy-types";
import {
  getTeamOverviewKpis,
  getTeamMemberMetrics,
  getTeamAlerts,
  getNewcomerAdaptation,
  listTeamMembersWithNames,
  getTeamPerformanceOverTime,
  getTeamHierarchy,
  getTeamRhythmCalendarData,
} from "@/app/actions/team-overview";

export const dynamic = "force-dynamic";

export default async function TeamOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth.roleName as RoleName, "team_overview:read")) {
    redirect("/portal");
  }

  const canCreateTeamCalendar = hasPermission(auth.roleName as RoleName, "team_calendar:write");
  const sp = (await searchParams) ?? {};
  const period: "week" | "month" | "quarter" =
    sp.period === "week" || sp.period === "month" || sp.period === "quarter" ? sp.period : "month";
  const defaultScope: TeamOverviewScope =
    auth.roleName === "Advisor" || auth.roleName === "Viewer"
      ? "me"
      : auth.roleName === "Director" || auth.roleName === "Admin"
        ? "full"
        : "my_team";

  const [kpis, members, metrics, alerts, newcomers, performanceOverTime, rhythmCalendar] = await Promise.all([
    getTeamOverviewKpis(period, defaultScope).catch(() => null),
    listTeamMembersWithNames(defaultScope).catch(() => []),
    getTeamMemberMetrics(period, defaultScope).catch(() => []),
    getTeamAlerts(period, defaultScope).catch(() => []),
    getNewcomerAdaptation(defaultScope).catch(() => []),
    getTeamPerformanceOverTime(period, defaultScope).catch(() => []),
    getTeamRhythmCalendarData(defaultScope).catch(() => null),
  ]);
  const hierarchy = await getTeamHierarchy(defaultScope).catch(() => []);

  return (
    <TeamOverviewView
      teamId={auth.tenantId}
      currentUserId={auth.userId}
      currentRole={auth.roleName}
      initialScope={defaultScope}
      initialHierarchy={hierarchy}
      initialKpis={kpis}
      initialMembers={members}
      initialMetrics={metrics}
      initialAlerts={alerts}
      initialNewcomers={newcomers}
      initialPerformanceOverTime={performanceOverTime}
      initialRhythmCalendar={rhythmCalendar}
      defaultPeriod={period}
      canCreateTeamCalendar={canCreateTeamCalendar}
    />
  );
}
