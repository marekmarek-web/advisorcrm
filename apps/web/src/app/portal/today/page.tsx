import { Suspense } from "react";
import { getDashboardKpis } from "@/app/actions/dashboard";
import { getServiceRecommendationsForDashboard } from "@/app/actions/service-engine";
import { getMeetingNotesForBoard } from "@/app/actions/meeting-notes";
import { listFinancialAnalyses } from "@/app/actions/financial-analyses";
import { getProductionSummary } from "@/app/actions/production";
import { getBusinessPlanWidgetData } from "@/app/actions/business-plan";
import { getContactsCount } from "@/app/actions/contacts";
import { requireAuth, getCachedSupabaseUser } from "@/lib/auth/require-auth";
import { perfLog } from "@/lib/perf-log";
import { DashboardEditable } from "./DashboardEditable";
import { AidvisoraLogoShimmerLoader } from "@/app/components/AidvisoraLogoShimmerLoader";

function isRedirectError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { digest?: string }).digest === "NEXT_REDIRECT";
}

function DashboardLoader() {
  return (
    <div className="flex min-h-[60vh] flex-1 items-center justify-center bg-[color:var(--wp-main-scroll-bg)]">
      <AidvisoraLogoShimmerLoader />
    </div>
  );
}

const FALLBACK_KPIS = {
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
} as Awaited<ReturnType<typeof getDashboardKpis>>;

async function DashboardLoaded({
  advisorName,
  perfStart,
}: {
  advisorName: string | null;
  perfStart: number;
}) {
  let productionError: string | null = null;
  const [kpis, serviceRecommendations, notes, analyses, production, businessPlanWidgetData] = await Promise.all([
    getDashboardKpis().catch((e) => {
      console.error("[DashboardLoaded] getDashboardKpis", e);
      return FALLBACK_KPIS;
    }),
    getServiceRecommendationsForDashboard(10).catch(() => []),
    getMeetingNotesForBoard().catch(() => []),
    listFinancialAnalyses().catch(() => []),
    getProductionSummary("month").catch((e) => {
      productionError = e instanceof Error ? e.message : "Nepodařilo se načíst produkci.";
      return null;
    }),
    getBusinessPlanWidgetData().catch(() => null),
  ]);
  perfLog("portal/today", perfStart);
  return (
    <DashboardEditable
      kpis={kpis}
      serviceRecommendations={serviceRecommendations}
      initialNotes={notes}
      advisorName={advisorName}
      initialAnalyses={analyses}
      productionSummary={production}
      productionError={productionError}
      businessPlanWidgetData={businessPlanWidgetData}
    />
  );
}

async function DashboardGate() {
  const perfStart = Date.now();
  let contactCount = 0;
  let advisorName: string | null = null;
  try {
    await requireAuth();
    contactCount = await getContactsCount();
    const user = await getCachedSupabaseUser();
    advisorName = (user?.user_metadata?.full_name as string | undefined) ?? null;
  } catch (e) {
    if (isRedirectError(e)) throw e;
    perfLog("portal/today-fallback", perfStart);
    return (
      <DashboardEditable
        kpis={FALLBACK_KPIS}
        serviceRecommendations={[]}
        initialNotes={[]}
        advisorName={advisorName}
        initialAnalyses={[]}
        productionSummary={null}
        productionError={null}
        businessPlanWidgetData={null}
      />
    );
  }

  if (contactCount === 0) {
    perfLog("portal/today-empty-tenant", perfStart);
    return (
      <DashboardEditable
        kpis={FALLBACK_KPIS}
        serviceRecommendations={[]}
        initialNotes={[]}
        advisorName={advisorName}
        initialAnalyses={[]}
        productionSummary={null}
        productionError={null}
        businessPlanWidgetData={null}
      />
    );
  }

  return (
    <Suspense fallback={<DashboardLoader />}>
      <DashboardLoaded advisorName={advisorName} perfStart={perfStart} />
    </Suspense>
  );
}

export default function TodayPage() {
  return (
    <Suspense fallback={<DashboardLoader />}>
      <DashboardGate />
    </Suspense>
  );
}
