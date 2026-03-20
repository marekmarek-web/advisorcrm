import { createClient } from "@/lib/supabase/server";
import { getDashboardKpis, type DashboardKpis } from "@/app/actions/dashboard";
import { getTasksCounts, getTasksList, type TaskCounts, type TaskRow } from "@/app/actions/tasks";
import { getContactsList, type ContactRow } from "@/app/actions/contacts";
import { ensureDefaultStages, getPipeline, type StageWithOpportunities } from "@/app/actions/pipeline";
import { Suspense } from "react";
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
};

const EMPTY_COUNTS: TaskCounts = { all: 0, today: 0, week: 0, overdue: 0, completed: 0 };

export async function MobilePortalApp() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const advisorName = (user?.user_metadata?.full_name as string | undefined) ?? "Poradce";

  let dashboardKpis: DashboardKpis = EMPTY_KPIS;
  let tasks: TaskRow[] = [];
  let taskCounts: TaskCounts = EMPTY_COUNTS;
  let contacts: ContactRow[] = [];
  let pipeline: StageWithOpportunities[] = [];

  try {
    await ensureDefaultStages();
  } catch {
    // ignore stage initialization errors for mobile fallback rendering
  }

  const [kpisRes, tasksRes, countsRes, contactsRes, pipelineRes] = await Promise.allSettled([
    getDashboardKpis(),
    getTasksList("all"),
    getTasksCounts(),
    getContactsList(),
    getPipeline(),
  ]);

  if (kpisRes.status === "fulfilled") dashboardKpis = kpisRes.value;
  if (tasksRes.status === "fulfilled") tasks = tasksRes.value;
  if (countsRes.status === "fulfilled") taskCounts = countsRes.value;
  if (contactsRes.status === "fulfilled") contacts = contactsRes.value;
  if (pipelineRes.status === "fulfilled") pipeline = pipelineRes.value;

  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center text-slate-500 text-sm p-6">
          Načítám…
        </div>
      }
    >
      <MobilePortalClient
        advisorName={advisorName}
        initialKpis={dashboardKpis}
        initialTasks={tasks}
        initialTaskCounts={taskCounts}
        initialContacts={contacts}
        initialPipeline={pipeline}
      />
    </Suspense>
  );
}
