import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { hasPermission, type RoleName } from "@/lib/auth/permissions";
import { TeamOverviewView } from "./TeamOverviewView";
import type { TeamOverviewScope } from "@/lib/team-hierarchy-types";
import { getTeamOverviewPageSnapshot } from "@/app/actions/team-overview";

export const dynamic = "force-dynamic";

export default async function TeamOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<{ period?: string; member?: string }>;
}) {
  const auth = await requireAuth();
  if (!hasPermission(auth.roleName as RoleName, "team_overview:read")) {
    redirect("/portal");
  }

  const canCreateTeamCalendar = hasPermission(auth.roleName as RoleName, "team_calendar:write");
  const canCreateAiTeamFollowUp =
    hasPermission(auth.roleName as RoleName, "contacts:write") ||
    hasPermission(auth.roleName as RoleName, "tasks:*");
  const canEditTeamCareer = hasPermission(auth.roleName as RoleName, "team_members:write");
  const sp = (await searchParams) ?? {};
  const period: "week" | "month" | "quarter" =
    sp.period === "week" || sp.period === "month" || sp.period === "quarter" ? sp.period : "month";
  const defaultScope: TeamOverviewScope =
    auth.roleName === "Advisor" || auth.roleName === "Viewer"
      ? "me"
      : auth.roleName === "Director" || auth.roleName === "Admin"
        ? "full"
        : "my_team";

  const snap = await getTeamOverviewPageSnapshot(period, defaultScope);

  return (
    <TeamOverviewView
      teamId={auth.tenantId}
      currentUserId={auth.userId}
      currentRole={auth.roleName}
      initialScope={defaultScope}
      initialHierarchy={snap.hierarchy}
      initialKpis={snap.kpis}
      initialMembers={snap.members}
      initialMetrics={snap.metrics}
      initialAlerts={snap.alerts}
      initialNewcomers={snap.newcomers}
      initialPerformanceOverTime={snap.performanceOverTime}
      initialRhythmCalendar={snap.rhythmCalendar}
      defaultPeriod={period}
      canCreateTeamCalendar={canCreateTeamCalendar}
      canCreateAiTeamFollowUp={canCreateAiTeamFollowUp}
      initialSelectedMemberId={typeof sp.member === "string" && sp.member.length > 0 ? sp.member : null}
      canEditTeamCareer={canEditTeamCareer}
    />
  );
}
