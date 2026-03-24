"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  Briefcase,
  LayoutGrid,
  Bell,
  ArrowLeft,
} from "lucide-react";
import type { DashboardKpis } from "@/app/actions/dashboard";
import type { ServiceRecommendationWithContact } from "@/app/actions/service-engine";
import type { MeetingNoteForBoard } from "@/app/actions/meeting-notes";
import type { FinancialAnalysisListItem } from "@/app/actions/financial-analyses";
import type { ProductionSummary } from "@/app/actions/production";
import type { BusinessPlanWidgetData } from "@/app/portal/today/DashboardEditable";
import {
  completeTask,
  createTask,
  deleteTask,
  getTasksCounts,
  getTasksList,
  reopenTask,
  updateTask,
  type TaskCounts,
  type TaskRow,
} from "@/app/actions/tasks";
import { getContactsList, type ContactRow } from "@/app/actions/contacts";
import {
  createOpportunity,
  getPipeline,
  updateOpportunityStage,
  type StageWithOpportunities,
} from "@/app/actions/pipeline";
import { getNotificationBadgeCount } from "@/app/actions/notification-log";
import { getUnreadConversationsCount } from "@/app/actions/messages";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import {
  BottomSheet,
  EmptyState,
  ErrorState,
  FloatingActionButton,
  FullscreenSheet,
  LoadingSkeleton,
  MobileAppShell,
  MobileBottomNav,
  MobileCard,
  MobileHeader,
  MobileScreen,
  MobileSection,
  OfflineBanner,
  StatusBadge,
  StepWizard,
  Toast,
  useToast,
} from "@/app/shared/mobile-ui/primitives";
import { HouseholdDetailScreen } from "./screens/HouseholdDetailScreen";
import { ContractsReviewScreen } from "./screens/ContractsReviewScreen";
import { AnalysesHubScreen } from "./screens/AnalysesHubScreen";
import { CalculatorsHubScreen } from "./screens/CalculatorsHubScreen";
import { BusinessPlanScreen } from "./screens/BusinessPlanScreen";
import { TeamOverviewScreen } from "./screens/TeamOverviewScreen";
import { SettingsProfileScreen } from "./screens/SettingsProfileScreen";
import { NotificationsInboxScreen } from "./screens/NotificationsInboxScreen";
import { CalendarMobileScreen } from "./screens/CalendarMobileScreen";
import { notifyRouteForWebview, notifyWebviewReady } from "@/app/shared/mobile-ui/webview-bridge";
import { useDeviceClass } from "@/lib/ui/useDeviceClass";
import { ToolsHubScreen } from "./screens/ToolsHubScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { TasksScreen } from "./screens/TasksScreen";
import { ContactsScreen } from "./screens/ContactsScreen";
import { PipelineScreen } from "./screens/PipelineScreen";
import { AiAssistantChatScreen } from "./screens/AiAssistantChatScreen";
import { DocumentsHubScreen } from "./screens/DocumentsHubScreen";
import { ProductionScreen } from "./screens/ProductionScreen";

type TabId = "home" | "tasks" | "clients" | "pipeline" | "menu";
type TaskFilter = "all" | "today" | "week" | "overdue" | "completed";

function toTaskFilter(pathname: string): TabId {
  if (pathname.startsWith("/portal/tasks")) return "tasks";
  if (pathname.startsWith("/portal/contacts")) return "clients";
  if (pathname.startsWith("/portal/pipeline")) return "pipeline";
  if (pathname.startsWith("/portal/contracts")) return "menu";
  if (pathname.startsWith("/portal/analyses")) return "menu";
  if (pathname.startsWith("/portal/calculators")) return "menu";
  if (pathname.startsWith("/portal/households")) return "menu";
  if (pathname.startsWith("/portal/business-plan")) return "menu";
  if (pathname.startsWith("/portal/team-overview")) return "menu";
  if (pathname.startsWith("/portal/setup")) return "menu";
  if (pathname.startsWith("/portal/profile")) return "menu";
  if (pathname.startsWith("/portal/notifications")) return "menu";
  if (pathname.startsWith("/portal/calendar")) return "menu";
  if (pathname.startsWith("/portal/tools")) return "menu";
  if (pathname.startsWith("/portal/ai")) return "menu";
  if (pathname.startsWith("/portal/production")) return "menu";
  if (pathname.startsWith("/portal/documents")) return "menu";
  if (pathname.startsWith("/portal/today")) return "home";
  return "menu";
}


function parseContactIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/portal\/contacts\/([^/]+)/);
  return m?.[1] ?? null;
}

function parseOpportunityIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/portal\/pipeline\/([^/]+)/);
  return m?.[1] ?? null;
}

function parseHouseholdIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/portal\/households\/([^/]+)/);
  return m?.[1] ?? null;
}

function parseContractReviewIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/portal\/contracts\/review\/([^/]+)/);
  return m?.[1] ?? null;
}

function parseCalculatorSlugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/portal\/calculators\/([^/]+)/);
  return m?.[1] ?? null;
}

export function MobilePortalClient({
  advisorName,
  initialKpis,
  initialTasks,
  initialTaskCounts,
  initialContacts,
  initialPipeline,
  showTeamOverview = true,
  serviceRecommendations = [],
  initialNotes = [],
  initialAnalyses = [],
  productionSummary = null,
  productionError = null,
  businessPlanWidgetData = null,
}: {
  advisorName: string;
  initialKpis: DashboardKpis;
  initialTasks: TaskRow[];
  initialTaskCounts: TaskCounts;
  initialContacts: ContactRow[];
  initialPipeline: StageWithOpportunities[];
  showTeamOverview?: boolean;
  serviceRecommendations?: ServiceRecommendationWithContact[];
  initialNotes?: MeetingNoteForBoard[];
  initialAnalyses?: FinancialAnalysisListItem[];
  productionSummary?: ProductionSummary | null;
  productionError?: string | null;
  businessPlanWidgetData?: BusinessPlanWidgetData | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deviceClass = useDeviceClass();
  const { toast, showToast, dismissToast } = useToast();
  const [tab, setTab] = useState<TabId>(() => toTaskFilter(pathname));
  const [kpis] = useState<DashboardKpis>(initialKpis);
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const [taskCounts, setTaskCounts] = useState<TaskCounts>(initialTaskCounts);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [contacts, setContacts] = useState<ContactRow[]>(initialContacts);
  const [pipeline, setPipeline] = useState<StageWithOpportunities[]>(initialPipeline);
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notificationBadgeCount, setNotificationBadgeCount] = useState(0);

  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [taskWizardStep, setTaskWizardStep] = useState(1);
  const [taskDraft, setTaskDraft] = useState<{ title: string; dueDate: string; contactId: string; description: string }>({
    title: "",
    dueDate: new Date().toISOString().slice(0, 10),
    contactId: "",
    description: "",
  });

  const [clientCreateOpen, setClientCreateOpen] = useState(false);
  const [opportunityCreateOpen, setOpportunityCreateOpen] = useState(false);
  const [opportunityDraft, setOpportunityDraft] = useState<{ title: string; caseType: string; stageId: string; contactId: string; expectedValue: string; expectedCloseDate: string }>({
    title: "",
    caseType: "hypotéka",
    stageId: initialPipeline[0]?.id ?? "",
    contactId: "",
    expectedValue: "",
    expectedCloseDate: "",
  });
  const [opportunityDetailOpen, setOpportunityDetailOpen] = useState(false);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);

  const selectedContactId = parseContactIdFromPath(pathname);
  const selectedOpportunityPathId = parseOpportunityIdFromPath(pathname);
  const selectedHouseholdId = parseHouseholdIdFromPath(pathname);
  const selectedContractReviewId = parseContractReviewIdFromPath(pathname);
  const selectedCalculatorSlug = parseCalculatorSlugFromPath(pathname);
  const selectedAnalysisIdFromQuery = searchParams.get("id");
  const onContractsRoute = pathname.startsWith("/portal/contracts/review");
  const onAnalysesRoute = pathname.startsWith("/portal/analyses");
  const onCalculatorsRoute = pathname.startsWith("/portal/calculators");
  const onBusinessPlanRoute = pathname.startsWith("/portal/business-plan");
  const onTeamOverviewRoute = pathname.startsWith("/portal/team-overview");
  const onSetupRoute = pathname.startsWith("/portal/setup") || pathname.startsWith("/portal/profile");
  const onNotificationsRoute = pathname.startsWith("/portal/notifications");
  const onCalendarRoute = pathname.startsWith("/portal/calendar");
  const onToolsRoute = pathname.startsWith("/portal/tools");
  const onAiRoute = pathname.startsWith("/portal/ai");
  const onProductionRoute = pathname.startsWith("/portal/production");
  const onDocumentsRoute = pathname.startsWith("/portal/documents");

  useEffect(() => {
    notifyWebviewReady();
  }, []);

  useEffect(() => {
    notifyRouteForWebview(pathname, searchParams.toString());
  }, [pathname, searchParams]);

  useEffect(() => {
    setTab(toTaskFilter(pathname));
    if (selectedOpportunityPathId) {
      setSelectedOpportunityId(selectedOpportunityPathId);
      setOpportunityDetailOpen(true);
    } else {
      setOpportunityDetailOpen(false);
    }
  }, [pathname, selectedOpportunityPathId]);

  useEffect(() => {
    startTransition(async () => {
      try {
        const [notificationLogBadge, unreadInbox] = await Promise.all([
          getNotificationBadgeCount(),
          getUnreadConversationsCount(),
        ]);
        setNotificationBadgeCount(notificationLogBadge + unreadInbox);
      } catch {
        setNotificationBadgeCount(0);
      }
    });
  }, [pathname]);

  const selectedContact = useMemo(
    () => (selectedContactId ? contacts.find((c) => c.id === selectedContactId) ?? null : null),
    [contacts, selectedContactId]
  );

  const selectedOpportunity = useMemo(() => {
    if (!selectedOpportunityId) return null;
    for (const stage of pipeline) {
      const found = stage.opportunities.find((op) => op.id === selectedOpportunityId);
      if (found) return { ...found, stageId: stage.id, stageName: stage.name };
    }
    return null;
  }, [pipeline, selectedOpportunityId]);




  const stageOptions = useMemo(() => pipeline.map((s) => ({ id: s.id, label: s.name })), [pipeline]);

  function navigateTab(next: TabId) {
    setTab(next);
    if (next === "home") router.push("/portal/today");
    else if (next === "tasks") router.push("/portal/tasks");
    else if (next === "clients") router.push("/portal/contacts");
    else if (next === "pipeline") router.push("/portal/pipeline");
    else router.push("/portal/tools");
  }

  function isWaveSubviewActive() {
    return Boolean(
      selectedContactId ||
        selectedHouseholdId ||
        onContractsRoute ||
        onAnalysesRoute ||
        onCalculatorsRoute ||
        onBusinessPlanRoute ||
        onTeamOverviewRoute ||
        onSetupRoute ||
        onNotificationsRoute ||
        onToolsRoute ||
        onCalendarRoute ||
        onAiRoute ||
        onProductionRoute ||
        onDocumentsRoute
    );
  }

  const BACK_ROUTE_MAP: Array<[boolean, string]> = [
    [Boolean(selectedContactId), "/portal/contacts"],
    [Boolean(selectedHouseholdId), "/portal/households"],
    [onContractsRoute, "/portal/tools"],
    [onAnalysesRoute, "/portal/tools"],
    [onCalculatorsRoute, "/portal/tools"],
    [onBusinessPlanRoute, "/portal/tools"],
    [onTeamOverviewRoute, "/portal/tools"],
    [onCalendarRoute, "/portal/tools"],
    [onSetupRoute, "/portal/tools"],
    [onNotificationsRoute, "/portal/tools"],
    [onAiRoute, "/portal/tools"],
    [onProductionRoute, "/portal/tools"],
    [onDocumentsRoute, "/portal/tools"],
    [onToolsRoute, "/portal/tools"],
  ];

  function handleHeaderBack() {
    for (const [condition, route] of BACK_ROUTE_MAP) {
      if (condition) {
        router.push(route);
        return;
      }
    }
    if (typeof window !== "undefined" && window.history.length <= 1) {
      router.push("/portal/today");
      return;
    }
    router.back();
  }

  function refreshTasks(nextFilter: TaskFilter = taskFilter) {
    startTransition(async () => {
      setError(null);
      try {
        const [nextTasks, nextCounts] = await Promise.all([getTasksList(nextFilter), getTasksCounts()]);
        setTasks(nextTasks);
        setTaskCounts(nextCounts);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nepodařilo se načíst úkoly.");
      }
    });
  }

  function refreshContacts() {
    startTransition(async () => {
      setError(null);
      try {
        setContacts(await getContactsList());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nepodařilo se načíst klienty.");
      }
    });
  }

  function refreshPipeline() {
    startTransition(async () => {
      setError(null);
      try {
        setPipeline(await getPipeline());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nepodařilo se načíst pipeline.");
      }
    });
  }

  async function onTaskToggle(task: TaskRow) {
    startTransition(async () => {
      try {
        if (task.completedAt) await reopenTask(task.id);
        else await completeTask(task.id);
        refreshTasks(taskFilter);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nepodařilo se změnit stav úkolu.");
      }
    });
  }

  async function onTaskDelete(taskId: string) {
    startTransition(async () => {
      try {
        await deleteTask(taskId);
        refreshTasks(taskFilter);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Úkol se nepodařilo smazat.");
      }
    });
  }

  async function onTaskSave() {
    if (!taskDraft.title.trim()) return;
    startTransition(async () => {
      try {
        await createTask({
          title: taskDraft.title.trim(),
          dueDate: taskDraft.dueDate || undefined,
          contactId: taskDraft.contactId || undefined,
          description: taskDraft.description || undefined,
        });
        setTaskCreateOpen(false);
        setTaskWizardStep(1);
        setTaskDraft({ title: "", dueDate: new Date().toISOString().slice(0, 10), contactId: "", description: "" });
        refreshTasks(taskFilter);
        showToast("Úkol byl vytvořen", "success");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Úkol se nepodařilo vytvořit.");
      }
    });
  }

  async function onTaskQuickOverdueFix(task: TaskRow) {
    startTransition(async () => {
      try {
        await updateTask(task.id, { dueDate: new Date().toISOString().slice(0, 10) });
        refreshTasks(taskFilter);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Úkol se nepodařilo přesunout.");
      }
    });
  }

  async function onOpportunityCreate() {
    if (!opportunityDraft.title.trim() || !opportunityDraft.stageId) return;
    startTransition(async () => {
      try {
        await createOpportunity({
          title: opportunityDraft.title.trim(),
          caseType: opportunityDraft.caseType,
          stageId: opportunityDraft.stageId,
          contactId: opportunityDraft.contactId || undefined,
          expectedValue: opportunityDraft.expectedValue || undefined,
          expectedCloseDate: opportunityDraft.expectedCloseDate || undefined,
        });
        setOpportunityCreateOpen(false);
        setOpportunityDraft({
          title: "",
          caseType: "hypotéka",
          stageId: pipeline[0]?.id ?? "",
          contactId: "",
          expectedValue: "",
          expectedCloseDate: "",
        });
        refreshPipeline();
        showToast("Příležitost byla vytvořena", "success");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Případ se nepodařilo vytvořit.");
      }
    });
  }

  async function onOpportunityMove(oppId: string, toStageId: string) {
    startTransition(async () => {
      try {
        await updateOpportunityStage(oppId, toStageId);
        refreshPipeline();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Případ se nepodařilo přesunout.");
      }
    });
  }

  const navItems = [
    { id: "home", label: "Přehled", icon: LayoutDashboard },
    { id: "tasks", label: "Úkoly", icon: CheckSquare, badge: taskCounts.overdue > 0 ? taskCounts.overdue : undefined },
    { id: "clients", label: "Klienti", icon: Users },
    { id: "pipeline", label: "Pipeline", icon: Briefcase },
    { id: "menu", label: "Nástroje", icon: LayoutGrid, badge: notificationBadgeCount > 0 ? notificationBadgeCount : undefined },
  ];

  const headerTitle = selectedContact
    ? `${selectedContact.firstName} ${selectedContact.lastName}`
    : selectedHouseholdId
      ? "Domácnost"
      : onContractsRoute
        ? "AI smlouvy"
        : onAnalysesRoute
          ? "Analýzy"
          : onCalculatorsRoute
            ? "Kalkulačky"
            : onBusinessPlanRoute
              ? "Můj plán"
              : onTeamOverviewRoute
                ? "Týmový přehled"
                : onSetupRoute
                  ? "Nastavení"
                  : onNotificationsRoute
                    ? "Notifikace"
                    : onAiRoute
                      ? "AI Asistent"
                      : onProductionRoute
                        ? "Produkce"
                        : onDocumentsRoute
                          ? "Dokumenty"
            : tab === "home"
              ? "Přehled"
              : tab === "tasks"
                ? "Úkoly"
                : tab === "clients"
                  ? "Klienti"
                  : tab === "pipeline"
                    ? "Pipeline"
                    : "Nástroje";

  const headerSubtitle = selectedContact
    ? "Klientský profil"
    : selectedHouseholdId
      ? "Detail domácnosti"
      : onContractsRoute
        ? "Review queue"
        : onAnalysesRoute
          ? "Finanční analýzy"
          : onCalculatorsRoute
            ? "Výpočty a CTA"
            : onBusinessPlanRoute
              ? "Business plán"
              : onTeamOverviewRoute
                ? "Týmové KPI a alerty"
                : onSetupRoute
                  ? "Profil, preference, integrace"
                  : onNotificationsRoute
                    ? "Inbox a log notifikací"
                    : onAiRoute
                      ? "Váš CRM asistent s přístupem k datům"
                      : onProductionRoute
                        ? "Uzavřené smlouvy a pojistné"
                        : onDocumentsRoute
                          ? "Nahrané dokumenty a skeny"
                        : onCalendarRoute
                      ? "Schůzky a události"
                      : onToolsRoute
                        ? "Gmail a Google Drive"
            : `Advisor • ${advisorName}`;

  return (
    <MobileAppShell deviceClass={deviceClass}>
      {/* Global banners */}
      <OfflineBanner />
      {toast ? <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} /> : null}

      <MobileHeader
        title={headerTitle}
        subtitle={headerSubtitle}
        deviceClass={deviceClass}
        left={
          isWaveSubviewActive() ? (
            <button
              type="button"
              onClick={handleHeaderBack}
              className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 grid place-items-center"
              aria-label="Zpět"
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <Image src="/aidvisora-logo-a.png" alt="Aidvisora" width={28} height={28} className="rounded-lg" />
          )
        }
        right={
          <button
            type="button"
            onClick={() => router.push("/portal/notifications")}
            className="relative min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 grid place-items-center"
            aria-label="Notifikace"
          >
            <Bell size={18} />
            {notificationBadgeCount > 0 ? (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] leading-4 text-center">
                {notificationBadgeCount > 9 ? "9+" : notificationBadgeCount}
              </span>
            ) : null}
          </button>
        }
      />

      <MobileScreen key={pathname} className="page-enter">
        {error ? <ErrorState title={error} onRetry={() => { refreshTasks(taskFilter); refreshContacts(); refreshPipeline(); }} /> : null}
        {busy ? <LoadingSkeleton rows={2} /> : null}

        {!selectedContact && tab === "home" ? (
          <DashboardScreen
            kpis={kpis}
            advisorName={advisorName}
            serviceRecommendations={serviceRecommendations}
            initialNotes={initialNotes}
            initialAnalyses={initialAnalyses}
            productionSummary={productionSummary}
            productionError={productionError}
            businessPlanWidgetData={businessPlanWidgetData}
            deviceClass={deviceClass}
            onNewTask={() => setTaskCreateOpen(true)}
            onNewClient={() => setClientCreateOpen(true)}
            onNewOpportunity={() => setOpportunityCreateOpen(true)}
          />
        ) : null}

        {!selectedContact && tab === "tasks" ? (
          <TasksScreen
            tasks={tasks}
            taskCounts={taskCounts}
            taskFilter={taskFilter}
            contacts={contacts}
            deviceClass={deviceClass}
            onFilterChange={(next) => {
              setTaskFilter(next);
              refreshTasks(next);
            }}
            onToggleTask={onTaskToggle}
            onDeleteTask={onTaskDelete}
            onQuickOverdueFix={onTaskQuickOverdueFix}
          />
        ) : null}

        {tab === "clients" ? (
          <ContactsScreen
            contacts={contacts}
            selectedContactId={selectedContactId}
            deviceClass={deviceClass}
            onSelectContact={(id) => router.push(`/portal/contacts/${id}`)}
            onOpenNewContact={() => setClientCreateOpen(true)}
            onTaskWizard={(contactId) => {
              setTaskDraft((prev) => ({ ...prev, contactId }));
              setTaskCreateOpen(true);
            }}
            onOpportunityWizard={(contactId) => {
              setOpportunityDraft((prev) => ({ ...prev, contactId }));
              setOpportunityCreateOpen(true);
            }}
            onOpenHousehold={(householdId) => router.push(`/portal/households/${householdId}`)}
          />
        ) : null}

        {!selectedContact && tab === "pipeline" ? (
          <PipelineScreen
            pipeline={pipeline}
            deviceClass={deviceClass}
            onMoveOpportunity={onOpportunityMove}
          />
        ) : null}

        {!selectedContact &&
        !selectedHouseholdId &&
        !onContractsRoute &&
        !onAnalysesRoute &&
        !onCalculatorsRoute &&
        !onBusinessPlanRoute &&
        !onTeamOverviewRoute &&
        !onSetupRoute &&
        !onNotificationsRoute &&
        !onCalendarRoute &&
        !onDocumentsRoute &&
        !onToolsRoute &&
        tab === "menu" ? (
          <ToolsHubScreen showTeamOverview={showTeamOverview} deviceClass={deviceClass} />
        ) : null}

        {selectedHouseholdId ? (
          <HouseholdDetailScreen householdId={selectedHouseholdId} contacts={contacts} />
        ) : null}

        {onContractsRoute ? (
          <ContractsReviewScreen detailIdFromPath={selectedContractReviewId} />
        ) : null}

        {onAnalysesRoute ? (
          <AnalysesHubScreen detailIdFromPath={selectedAnalysisIdFromQuery} deviceClass={deviceClass} />
        ) : null}

        {onCalculatorsRoute ? (
          <CalculatorsHubScreen
            detailSlugFromPath={selectedCalculatorSlug}
            onCreateTaskFromResult={(title) => {
              setTaskDraft((prev) => ({ ...prev, title, dueDate: prev.dueDate || new Date().toISOString().slice(0, 10) }));
              setTaskCreateOpen(true);
            }}
            onCreateOpportunityFromResult={(title) => {
              setOpportunityDraft((prev) => ({ ...prev, title }));
              setOpportunityCreateOpen(true);
            }}
            onOpenAnalyses={() => router.push("/portal/analyses")}
            deviceClass={deviceClass}
          />
        ) : null}

        {onBusinessPlanRoute ? <BusinessPlanScreen deviceClass={deviceClass} /> : null}

        {onTeamOverviewRoute ? <TeamOverviewScreen deviceClass={deviceClass} /> : null}

        {onSetupRoute ? <SettingsProfileScreen advisorName={advisorName} /> : null}

        {onNotificationsRoute ? (
          <NotificationsInboxScreen onBadgeCountChange={setNotificationBadgeCount} />
        ) : null}

        {onCalendarRoute ? <CalendarMobileScreen contacts={contacts} deviceClass={deviceClass} /> : null}

        {onAiRoute ? <AiAssistantChatScreen /> : null}

        {onDocumentsRoute ? <DocumentsHubScreen deviceClass={deviceClass} /> : null}

        {onProductionRoute ? <ProductionScreen deviceClass={deviceClass} /> : null}

        {onToolsRoute ? (
          <MobileSection title="Nástroje Google">
            <div className="grid grid-cols-1 gap-2">
              <MobileCard>
                <p className="text-sm font-bold text-slate-900">Gmail Workspace</p>
                <p className="mt-1 text-xs text-slate-600">
                  Na mobilu otevřete Gmail integraci přes Nastavení &gt; Integrace nebo desktop režim.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/portal/setup?tab=integrace&provider=gmail")}
                  className="mt-3 min-h-[44px] w-full rounded-xl border border-slate-300 text-sm font-bold text-slate-700"
                >
                  Otevřít Gmail integraci
                </button>
              </MobileCard>
              <MobileCard>
                <p className="text-sm font-bold text-slate-900">Google Drive Workspace</p>
                <p className="mt-1 text-xs text-slate-600">
                  Na mobilu otevřete Drive integraci přes Nastavení &gt; Integrace nebo desktop režim.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/portal/setup?tab=integrace&provider=google-drive")}
                  className="mt-3 min-h-[44px] w-full rounded-xl border border-slate-300 text-sm font-bold text-slate-700"
                >
                  Otevřít Drive integraci
                </button>
              </MobileCard>
            </div>
          </MobileSection>
        ) : null}
      </MobileScreen>

      {!isWaveSubviewActive() && tab === "tasks" ? (
        <FloatingActionButton onClick={() => setTaskCreateOpen(true)} label="Nový úkol" />
      ) : null}
      {!isWaveSubviewActive() && tab === "clients" ? (
        <FloatingActionButton onClick={() => setClientCreateOpen(true)} label="Nový klient" />
      ) : null}
      {!isWaveSubviewActive() && tab === "pipeline" ? (
        <FloatingActionButton onClick={() => setOpportunityCreateOpen(true)} label="Nový případ" />
      ) : null}

      <BottomSheet open={taskCreateOpen} onClose={() => setTaskCreateOpen(false)} title="Nový úkol">
        <StepWizard step={taskWizardStep} total={3}>
          {taskWizardStep === 1 ? (
            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">Název</label>
              <input
                type="text"
                value={taskDraft.title}
                onChange={(e) => setTaskDraft((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm"
                placeholder="Např. Zavolat klientovi"
              />
              <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">Termín</label>
              <input
                type="date"
                value={taskDraft.dueDate}
                onChange={(e) => setTaskDraft((prev) => ({ ...prev, dueDate: e.target.value }))}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>
          ) : null}
          {taskWizardStep === 2 ? (
            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">Klient</label>
              <CustomDropdown
                value={taskDraft.contactId}
                onChange={(id) => setTaskDraft((prev) => ({ ...prev, contactId: id }))}
                placeholder="Bez klienta"
                options={[
                  { id: "", label: "Bez klienta" },
                  ...contacts.map((c) => ({
                    id: c.id,
                    label: `${c.firstName} ${c.lastName}`,
                  })),
                ]}
              />
            </div>
          ) : null}
          {taskWizardStep === 3 ? (
            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">Popis</label>
              <textarea
                rows={4}
                value={taskDraft.description}
                onChange={(e) => setTaskDraft((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Doplňte kontext…"
              />
            </div>
          ) : null}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => (taskWizardStep > 1 ? setTaskWizardStep((s) => s - 1) : setTaskCreateOpen(false))}
              className="flex-1 min-h-[44px] rounded-xl border border-slate-200 text-sm font-bold"
            >
              {taskWizardStep > 1 ? "Zpět" : "Zrušit"}
            </button>
            {taskWizardStep < 3 ? (
              <button
                type="button"
                onClick={() => setTaskWizardStep((s) => Math.min(3, s + 1))}
                className="flex-1 min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold"
              >
                Další
              </button>
            ) : (
              <button type="button" onClick={onTaskSave} className="flex-1 min-h-[44px] rounded-xl bg-[#1a1c2e] text-white text-sm font-bold">
                Vytvořit
              </button>
            )}
          </div>
        </StepWizard>
      </BottomSheet>

      <BottomSheet open={clientCreateOpen} onClose={() => setClientCreateOpen(false)} title="Nový klient">
        <p className="text-sm text-slate-600">Pro první vlnu je vytvoření klienta vedeno přes existující wizard.</p>
        <button
          type="button"
          onClick={() => {
            setClientCreateOpen(false);
            router.push("/portal/contacts?newClient=1");
          }}
          className="mt-3 min-h-[44px] w-full rounded-xl bg-indigo-600 text-white text-sm font-bold"
        >
          Otevřít wizard
        </button>
      </BottomSheet>

      <BottomSheet open={opportunityCreateOpen} onClose={() => setOpportunityCreateOpen(false)} title="Nová příležitost">
        <div className="space-y-3">
          <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">Název případu</label>
          <input
            type="text"
            value={opportunityDraft.title}
            onChange={(e) => setOpportunityDraft((prev) => ({ ...prev, title: e.target.value }))}
            className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm"
          />
          <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">Typ případu</label>
          <CustomDropdown
            value={opportunityDraft.caseType}
            onChange={(id) => setOpportunityDraft((prev) => ({ ...prev, caseType: id }))}
            options={[
              { id: "hypotéka", label: "Hypotéka" },
              { id: "investice", label: "Investice" },
              { id: "pojištění", label: "Pojištění" },
              { id: "úvěr", label: "Úvěr" },
              { id: "jiné", label: "Jiné" },
            ]}
          />
          <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">Fáze</label>
          <CustomDropdown
            value={opportunityDraft.stageId}
            onChange={(id) => setOpportunityDraft((prev) => ({ ...prev, stageId: id }))}
            options={stageOptions.map((stage) => ({ id: stage.id, label: stage.label }))}
          />
          <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">Klient</label>
          <CustomDropdown
            value={opportunityDraft.contactId}
            onChange={(id) => setOpportunityDraft((prev) => ({ ...prev, contactId: id }))}
            placeholder="Bez klienta"
            options={[
              { id: "", label: "Bez klienta" },
              ...contacts.map((c) => ({
                id: c.id,
                label: `${c.firstName} ${c.lastName}`,
              })),
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              placeholder="Hodnota"
              value={opportunityDraft.expectedValue}
              onChange={(e) => setOpportunityDraft((prev) => ({ ...prev, expectedValue: e.target.value }))}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm"
            />
            <input
              type="date"
              value={opportunityDraft.expectedCloseDate}
              onChange={(e) => setOpportunityDraft((prev) => ({ ...prev, expectedCloseDate: e.target.value }))}
              className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>
          <button type="button" onClick={onOpportunityCreate} className="min-h-[44px] w-full rounded-xl bg-[#1a1c2e] text-white text-sm font-bold">
            Vytvořit případ
          </button>
        </div>
      </BottomSheet>

      <FullscreenSheet
        open={opportunityDetailOpen}
        onClose={() => {
          setOpportunityDetailOpen(false);
          router.push("/portal/pipeline");
        }}
        title="Detail případu"
      >
        {!selectedOpportunity ? (
          <EmptyState title="Případ nenalezen" />
        ) : (
          <div className="space-y-3">
            <MobileCard>
              <p className="text-lg font-black">{selectedOpportunity.title}</p>
              <p className="text-sm text-slate-600 mt-1">{selectedOpportunity.contactName}</p>
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge tone="info">{selectedOpportunity.stageName}</StatusBadge>
                <StatusBadge>{selectedOpportunity.caseType || "Jiné"}</StatusBadge>
              </div>
            </MobileCard>
            <MobileCard>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-black">Posunout do fáze</p>
              <div className="mt-2 space-y-2">
                {stageOptions.map((stage) => (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => onOpportunityMove(selectedOpportunity.id, stage.id)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 text-left px-3 text-sm font-semibold"
                  >
                    {stage.label}
                  </button>
                ))}
              </div>
            </MobileCard>
          </div>
        )}
      </FullscreenSheet>

      <MobileBottomNav items={navItems} activeId={tab} onSelect={(id) => navigateTab(id as TabId)} deviceClass={deviceClass} />
    </MobileAppShell>
  );
}
