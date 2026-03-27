import { Suspense } from "react";
import { getDashboardKpis } from "@/app/actions/dashboard";
import { getContactsCount } from "@/app/actions/contacts";
import { requireAuth, getCachedSupabaseUser } from "@/lib/auth/require-auth";
import { perfLog, perfLogSince } from "@/lib/perf-log";
import { createDashboardSecondaryDataPromise } from "./dashboard-secondary-promise";
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

/** Lehký skeleton pro první Suspense nástěnky (KPI + horní blok) — rychlejší TTV než celostránkový loader. */
function DashboardKpiStripSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-8 p-4 text-[color:var(--wp-text)] sm:p-6 md:p-8">
      <div className="space-y-4">
        <div className="h-10 w-2/3 max-w-md animate-pulse rounded-xl bg-[color:var(--wp-surface-muted)]/80" />
        <div className="h-4 w-1/2 max-w-sm animate-pulse rounded-lg bg-[color:var(--wp-surface-muted)]/60" />
      </div>
      <div className="h-24 animate-pulse rounded-2xl bg-[color:var(--wp-surface-muted)]/80" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-36 animate-pulse rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/80"
          />
        ))}
      </div>
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

function DashboardLoaded({
  advisorName,
  perfStart,
}: {
  advisorName: string | null;
  perfStart: number;
}) {
  const kpisPromise = getDashboardKpis().catch((e) => {
    console.error("[DashboardLoaded] getDashboardKpis", e);
    return FALLBACK_KPIS;
  });
  const secondaryPromise = createDashboardSecondaryDataPromise();
  void kpisPromise.then(() => perfLogSince("portal/today-kpis", perfStart));
  void secondaryPromise.then(() => perfLog("portal/today-secondary", perfStart));

  return (
    <Suspense fallback={<DashboardKpiStripSkeleton />}>
      <DashboardEditable
        kpis={kpisPromise}
        advisorName={advisorName}
        secondaryDataPromise={secondaryPromise}
      />
    </Suspense>
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

  return <DashboardLoaded advisorName={advisorName} perfStart={perfStart} />;
}

export default function TodayPage() {
  return (
    <Suspense fallback={<DashboardLoader />}>
      <DashboardGate />
    </Suspense>
  );
}
