import { getDashboardKpis, type DashboardKpis } from "@/app/actions/dashboard";
import { getTasksCounts, getTasksList, type TaskCounts, type TaskRow } from "@/app/actions/tasks";
import { getContactsList, type ContactRow } from "@/app/actions/contacts";
import { ensureDefaultStages, getPipeline, type StageWithOpportunities } from "@/app/actions/pipeline";
import { getServiceRecommendationsForDashboard, type ServiceRecommendationWithContact } from "@/app/actions/service-engine";
import { getMeetingNotesForBoard, type MeetingNoteForBoard } from "@/app/actions/meeting-notes";
import { listFinancialAnalyses, type FinancialAnalysisListItem } from "@/app/actions/financial-analyses";
import { getProductionSummary, type ProductionSummary } from "@/app/actions/production";
import { getBusinessPlanWidgetData } from "@/app/actions/business-plan";
import type { BusinessPlanWidgetData } from "@/app/portal/today/DashboardEditable";
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
  let tasks: TaskRow[] = [];
  let taskCounts: TaskCounts = EMPTY_COUNTS;
  let contacts: ContactRow[] = [];
  let pipeline: StageWithOpportunities[] = [];
  let serviceRecommendations: ServiceRecommendationWithContact[] = [];
  let meetingNotes: MeetingNoteForBoard[] = [];
  let financialAnalyses: FinancialAnalysisListItem[] = [];
  let productionSummary: ProductionSummary | null = null;
  let productionError: string | null = null;
  let businessPlanWidgetData: BusinessPlanWidgetData | null = null;

  try {
    await ensureDefaultStages();
  } catch {
    // ignore stage initialization errors for mobile fallback rendering
  }

  const [
    kpisRes, tasksRes, countsRes, contactsRes, pipelineRes,
    serviceRes, notesRes, analysesRes, productionRes, businessPlanRes,
  ] = await Promise.allSettled([
    getDashboardKpis(),
    getTasksList("all"),
    getTasksCounts(),
    getContactsList(),
    getPipeline(),
    getServiceRecommendationsForDashboard(10),
    getMeetingNotesForBoard(),
    listFinancialAnalyses(),
    getProductionSummary("month"),
    getBusinessPlanWidgetData(),
  ]);

  if (kpisRes.status === "fulfilled") dashboardKpis = kpisRes.value;
  if (tasksRes.status === "fulfilled") tasks = tasksRes.value;
  if (countsRes.status === "fulfilled") taskCounts = countsRes.value;
  if (contactsRes.status === "fulfilled") contacts = contactsRes.value;
  if (pipelineRes.status === "fulfilled") pipeline = pipelineRes.value;
  if (serviceRes.status === "fulfilled") serviceRecommendations = serviceRes.value;
  if (notesRes.status === "fulfilled") meetingNotes = notesRes.value;
  if (analysesRes.status === "fulfilled") financialAnalyses = analysesRes.value;
  if (productionRes.status === "fulfilled") {
    productionSummary = productionRes.value;
  } else {
    productionError =
      productionRes.reason instanceof Error
        ? productionRes.reason.message
        : "Nepodařilo se načíst produkci.";
  }
  if (businessPlanRes.status === "fulfilled") businessPlanWidgetData = businessPlanRes.value;

  return (
    <MobilePortalClient
      advisorName={advisorName}
      initialKpis={dashboardKpis}
      initialTasks={tasks}
      initialTaskCounts={taskCounts}
      initialContacts={contacts}
      initialPipeline={pipeline}
      showTeamOverview={showTeamOverview}
      serviceRecommendations={serviceRecommendations}
      initialNotes={meetingNotes}
      initialAnalyses={financialAnalyses}
      productionSummary={productionSummary}
      productionError={productionError}
      businessPlanWidgetData={businessPlanWidgetData}
      canWriteCalendar={canWriteCalendar}
      roleName={roleName}
    />
  );
}
