import { getDashboardKpis, type DashboardKpis } from "@/app/actions/dashboard";
import { getTasksCounts, type TaskCounts } from "@/app/actions/tasks";
import { ensureDefaultStages } from "@/app/actions/pipeline";
import type { RoleName } from "@/shared/rolePermissions";
import { MobilePortalClient } from "./MobilePortalClient";

const EMPTY_KPIS: DashboardKpis = {
  meetingsToday: 0,
  tasksOpen: 0,
  opportunitiesOpen: 0,
  totalContacts: 0,
  todayEvents: [],
  overdueTasks: [],
  upcomingAnniversaries: [],
  serviceDueContacts: [],
  pipelineAtRisk: [],
  recentActivity: [],
  tasksDueToday: [],
  opportunitiesInStep3And4: [],
  czPublicHolidayToday: null,
  czNameDaysToday: [],
  birthdaysToday: [],
  sidePanelAgendaTimeline: [],
};

const EMPTY_COUNTS: TaskCounts = { all: 0, today: 0, week: 0, overdue: 0, completed: 0 };

/**
 * Async server child: lets the parent shell render with Suspense while CRM data loads.
 */
export async function MobilePortalClientLoader({
  advisorName,
  showTeamOverview,
  canWriteCalendar,
  roleName,
}: {
  advisorName: string;
  showTeamOverview: boolean;
  canWriteCalendar: boolean;
  roleName: RoleName;
}) {
  let dashboardKpis: DashboardKpis = EMPTY_KPIS;
  let taskCounts: TaskCounts = EMPTY_COUNTS;

  // Run stage seeding in parallel with KPI/counts so it never blocks first dashboard data.
  const settled = await Promise.allSettled([
    getDashboardKpis(),
    getTasksCounts(),
    (async () => {
      try {
        await ensureDefaultStages();
      } catch {
        // ignore stage initialization errors for mobile fallback rendering
      }
    })(),
  ]);
  const kpisRes = settled[0]!;
  const countsRes = settled[1]!;

  if (kpisRes.status === "fulfilled") dashboardKpis = kpisRes.value;
  if (countsRes.status === "fulfilled") taskCounts = countsRes.value;

  return (
    <MobilePortalClient
      advisorName={advisorName}
      initialKpis={dashboardKpis}
      initialTasks={[]}
      initialTaskCounts={taskCounts}
      initialContacts={[]}
      initialPipeline={[]}
      showTeamOverview={showTeamOverview}
      serviceRecommendations={[]}
      initialNotes={[]}
      initialAnalyses={[]}
      productionSummary={null}
      productionError={null}
      businessPlanWidgetData={null}
      canWriteCalendar={canWriteCalendar}
      roleName={roleName}
      deferDataHydration
    />
  );
}
