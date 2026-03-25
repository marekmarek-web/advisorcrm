"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  Briefcase,
  Bell,
  ArrowLeft,
  Menu,
  Sparkles,
  Search,
  FileText,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
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
import { notifyRouteForWebview, notifyWebviewReady } from "@/app/shared/mobile-ui/webview-bridge";
import { useDeviceClass } from "@/lib/ui/useDeviceClass";
import { DashboardScreen } from "./screens/DashboardScreen";
import { TasksScreen } from "./screens/TasksScreen";
import { ContactsScreen } from "./screens/ContactsScreen";
import { AiAssistantChatScreen } from "./screens/AiAssistantChatScreen";
import { DocumentsHubScreen } from "./screens/DocumentsHubScreen";
import { ProductionScreen } from "./screens/ProductionScreen";
import { MobileSideDrawer } from "@/app/shared/mobile-ui/MobileSideDrawer";
import { MobileGlobalSearchOverlay } from "./MobileGlobalSearchOverlay";
import { MobileShellErrorBoundary } from "@/app/shared/mobile-ui/MobileShellErrorBoundary";
import { ToastProvider } from "@/app/components/Toast";
import { PortalFeedbackLauncher } from "@/app/portal/PortalFeedbackLauncher";
import { PlaceholderScreen } from "./screens/PlaceholderScreen";
import { HouseholdsListMobileScreen } from "./screens/HouseholdsListMobileScreen";
import { MessagesMobileScreen } from "./screens/MessagesMobileScreen";
import { NotesMobileScreen } from "./screens/NotesMobileScreen";
import { ColdContactsMobileScreen } from "./screens/ColdContactsMobileScreen";
import type { RoleName } from "@/shared/rolePermissions";

function RouteLoadingSkeleton() {
  return (
    <div className="flex flex-1 min-h-[40vh] items-center justify-center px-4 text-slate-500 text-sm">
      Načítání…
    </div>
  );
}

const CalendarScreen = dynamic(
  () => import("./screens/calendar/CalendarScreen").then((m) => m.CalendarScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);
const BoardMobileScreen = dynamic(
  () => import("./screens/BoardMobileScreen").then((m) => m.BoardMobileScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);
const MindmapHubMobileScreen = dynamic(
  () => import("./screens/MindmapMobileScreen").then((m) => m.MindmapHubMobileScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);
const MindmapMapMobileScreen = dynamic(
  () => import("./screens/MindmapMobileScreen").then((m) => m.MindmapMapMobileScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);
const FinancialAnalysisWizardScreen = dynamic(
  () => import("./screens/FinancialAnalysisWizardScreen").then((m) => m.FinancialAnalysisWizardScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);
const PipelineScreen = dynamic(
  () => import("./screens/PipelineScreen").then((m) => m.PipelineScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);
const ActionCenterScreen = dynamic(
  () => import("./screens/ActionCenterScreen").then((m) => m.ActionCenterScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);

type TabId = "home" | "tasks" | "clients" | "pipeline" | "ai" | "none";
type TaskFilter = "all" | "today" | "week" | "overdue" | "completed";

/** Bottom navigation highlight only for primary tabs; other routes use `none`. */
function pathnameToBottomTab(pathname: string): TabId {
  if (pathname.startsWith("/portal/today")) return "home";
  if (pathname.startsWith("/portal/tasks")) return "tasks";
  if (pathname.startsWith("/portal/contacts")) return "clients";
  if (pathname.startsWith("/portal/pipeline")) return "pipeline";
  if (pathname.startsWith("/portal/ai")) return "ai";
  return "none";
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

function parseMindmapMapId(pathname: string): string | null {
  const m = pathname.match(/^\/portal\/mindmap\/([^/]+)$/);
  return m?.[1] ?? null;
}

/** True for routes with a dynamic segment (show back arrow, not hamburger). */
function isDetailRoute(pathname: string): boolean {
  if (/^\/portal\/contacts\/[^/]+$/.test(pathname) && !pathname.endsWith("/new")) return true;
  if (/^\/portal\/households\/[^/]+$/.test(pathname)) return true;
  if (/^\/portal\/pipeline\/[^/]+$/.test(pathname)) return true;
  if (/^\/portal\/mindmap\/[^/]+$/.test(pathname)) return true;
  if (/^\/portal\/contracts\/review\/[^/]+$/.test(pathname)) return true;
  if (/^\/portal\/calculators\/[^/]+$/.test(pathname)) return true;
  if (pathname.startsWith("/portal/analyses/financial")) return true;
  return false;
}

/** Resolve the logical parent route for the back button. */
function resolveParentRoute(pathname: string): string {
  if (pathname.startsWith("/portal/analyses/financial")) return "/portal/analyses";
  if (/^\/portal\/contacts\/[^/]+/.test(pathname)) return "/portal/contacts";
  if (/^\/portal\/households\/[^/]+/.test(pathname)) return "/portal/households";
  if (/^\/portal\/pipeline\/[^/]+/.test(pathname)) return "/portal/pipeline";
  if (/^\/portal\/mindmap\/[^/]+/.test(pathname)) return "/portal/mindmap";
  if (/^\/portal\/contracts\/review\/[^/]+/.test(pathname)) return "/portal/contracts/review";
  if (/^\/portal\/calculators\/[^/]+/.test(pathname)) return "/portal/calculators";
  return "/portal/today";
}

/* ------------------------------------------------------------------ */
/*  Route metadata — replaces nested ternary header title chains       */
/* ------------------------------------------------------------------ */

const ROUTE_META: Array<{
  test: (p: string) => boolean;
  title: string;
  subtitle: string;
}> = [
  { test: (p) => p.startsWith("/portal/messages"), title: "Zprávy", subtitle: "Konverzace s klienty" },
  { test: (p) => p.startsWith("/portal/notes"), title: "Zápisky", subtitle: "Poznámky ze schůzek" },
  { test: (p) => p === "/portal/board" || p.startsWith("/portal/board/"), title: "Board", subtitle: "Přehled obchodů" },
  { test: (p) => p.startsWith("/portal/cold-contacts"), title: "Studené kontakty", subtitle: "Telefonáty a leady" },
  { test: (p) => p === "/portal/households" || p === "/portal/households/", title: "Domácnosti", subtitle: "Seznam domácností" },
  { test: (p) => /^\/portal\/households\/[^/]+/.test(p), title: "Domácnost", subtitle: "Detail domácnosti" },
  { test: (p) => p === "/portal/mindmap" || p === "/portal/mindmap/", title: "Mindmap", subtitle: "Výběr map" },
  { test: (p) => /^\/portal\/mindmap\/[^/]+$/.test(p), title: "Mapa", subtitle: "Úprava mapy" },
  { test: (p) => p.startsWith("/portal/contracts/review"), title: "AI smlouvy", subtitle: "Review queue" },
  { test: (p) => p.startsWith("/portal/contracts"), title: "Smlouvy", subtitle: "Ostatní sekce smluv" },
  { test: (p) => p.startsWith("/portal/analyses/financial"), title: "Finanční analýza", subtitle: "Průvodce analýzou" },
  { test: (p) => p.startsWith("/portal/analyses"), title: "Analýzy", subtitle: "Finanční analýzy" },
  { test: (p) => p.startsWith("/portal/calculators"), title: "Kalkulačky", subtitle: "Výpočty a CTA" },
  { test: (p) => p.startsWith("/portal/business-plan"), title: "Můj plán", subtitle: "Business plán" },
  { test: (p) => p.startsWith("/portal/team-overview"), title: "Týmový přehled", subtitle: "Týmové KPI a alerty" },
  { test: (p) => p.startsWith("/portal/setup") || p.startsWith("/portal/profile"), title: "Nastavení", subtitle: "Profil, preference, integrace" },
  { test: (p) => p.startsWith("/portal/notifications"), title: "Notifikace", subtitle: "Inbox a log notifikací" },
  { test: (p) => p.startsWith("/portal/calendar"), title: "Kalendář", subtitle: "Schůzky a události" },
  { test: (p) => p.startsWith("/portal/ai"), title: "AI Asistent", subtitle: "Váš CRM asistent s přístupem k datům" },
  { test: (p) => p.startsWith("/portal/production"), title: "Produkce", subtitle: "Uzavřené smlouvy a pojistné" },
  { test: (p) => p.startsWith("/portal/documents"), title: "Dokumenty", subtitle: "Nahrané dokumenty a skeny" },
  { test: (p) => p.startsWith("/portal/tools"), title: "Nástroje Google", subtitle: "Gmail a Google Drive" },
];

/** First-match lookup through ROUTE_META, then tab-based fallback. */
function resolveHeaderMeta(
  pathname: string,
  tab: TabId,
  advisorName: string,
  selectedContact: ContactRow | null,
): { title: string; subtitle: string } {
  if (selectedContact) {
    return { title: `${selectedContact.firstName} ${selectedContact.lastName}`, subtitle: "Klientský profil" };
  }
  for (const entry of ROUTE_META) {
    if (entry.test(pathname)) return { title: entry.title, subtitle: entry.subtitle };
  }
  const subtitle = tab === "none" ? `Menu • ${advisorName}` : `Advisor • ${advisorName}`;
  if (tab === "home") return { title: "Přehled", subtitle };
  if (tab === "tasks") return { title: "Úkoly", subtitle };
  if (tab === "clients") return { title: "Klienti", subtitle };
  if (tab === "pipeline") return { title: "Pipeline", subtitle };
  if (tab === "ai") return { title: "AI Asistent", subtitle };
  return { title: "Aidvisora", subtitle };
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
  canWriteCalendar = true,
  roleName = "Advisor",
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
  canWriteCalendar?: boolean;
  roleName?: RoleName;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deviceClass = useDeviceClass();
  const { toast, showToast, dismissToast } = useToast();
  const [tab, setTab] = useState<TabId>(() => pathnameToBottomTab(pathname));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [kpis] = useState<DashboardKpis>(initialKpis);
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const [taskCounts, setTaskCounts] = useState<TaskCounts>(initialTaskCounts);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [contacts, setContacts] = useState<ContactRow[]>(initialContacts);
  const [pipeline, setPipeline] = useState<StageWithOpportunities[]>(initialPipeline);
  const [shellPending, startTransition] = useTransition();
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
  const onContractsOtherRoute =
    pathname.startsWith("/portal/contracts") && !pathname.startsWith("/portal/contracts/review");
  const onAnalysesRoute = pathname.startsWith("/portal/analyses");
  const onAnalysesFinancialRoute = pathname.startsWith("/portal/analyses/financial");
  const onAnalysesCompanyRoute = pathname.startsWith("/portal/analyses/company");
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
  const onMessagesRoute = pathname.startsWith("/portal/messages");
  const onNotesRoute = pathname.startsWith("/portal/notes");
  const onBoardRoute = pathname === "/portal/board" || pathname.startsWith("/portal/board/");
  const onColdContactsRoute = pathname.startsWith("/portal/cold-contacts");
  const mindmapMapId = parseMindmapMapId(pathname);
  const onMindmapHubRoute = pathname === "/portal/mindmap" || pathname === "/portal/mindmap/";
  const onMindmapMapRoute = Boolean(mindmapMapId);
  const onHouseholdsListRoute = pathname === "/portal/households";
  const onActionCenterRoute = pathname.startsWith("/portal/action-center");

  const browserPluginLikelyAvailable =
    !Capacitor.isNativePlatform() ||
    (typeof Capacitor.isPluginAvailable === "function" && Capacitor.isPluginAvailable("Browser"));

  useEffect(() => {
    notifyWebviewReady();
  }, []);

  useEffect(() => {
    notifyRouteForWebview(pathname, searchParams.toString());
  }, [pathname, searchParams]);

  useEffect(() => {
    setTab(pathnameToBottomTab(pathname));
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
        setUnreadMessagesCount(unreadInbox);
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

  const headerMeta = useMemo(
    () => resolveHeaderMeta(pathname, tab, advisorName, selectedContact),
    [pathname, tab, advisorName, selectedContact],
  );

  const stageOptions = useMemo(() => pipeline.map((s) => ({ id: s.id, label: s.name })), [pipeline]);
  const pipelineContactOptions = useMemo(
    () =>
      contacts.map((c) => ({
        id: c.id,
        label: [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "Kontakt",
      })),
    [contacts]
  );

  function navigateTab(next: TabId) {
    setDrawerOpen(false);
    if (next === "home") router.push("/portal/today");
    else if (next === "tasks") router.push("/portal/tasks");
    else if (next === "clients") router.push("/portal/contacts");
    else if (next === "pipeline") router.push("/portal/pipeline");
    else if (next === "ai") router.push("/portal/ai");
    else return;
    setTab(next);
  }

  const detailRouteActive = isDetailRoute(pathname);

  function handleHeaderBack() {
    setDrawerOpen(false);
    if (detailRouteActive) {
      router.push(resolveParentRoute(pathname));
      return;
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
        showToast("Případ byl přesunut", "success");
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
    { id: "ai", label: "AI", icon: Sparkles, badge: notificationBadgeCount > 0 ? notificationBadgeCount : undefined },
  ];

  /** Exactly one screen mounts per render — no more overlapping conditionals. */
  function resolveActiveScreen(): React.ReactNode {
    // Detail routes (dynamic segment) — check before their parent hub
    if (selectedHouseholdId) {
      return <HouseholdDetailScreen householdId={selectedHouseholdId} contacts={contacts} />;
    }
    if (onAnalysesFinancialRoute) return <FinancialAnalysisWizardScreen />;
    if (onMindmapMapRoute && mindmapMapId) return <MindmapMapMobileScreen mapId={mindmapMapId} />;

    // Pathname-based section / hub routes
    if (onHouseholdsListRoute) return <HouseholdsListMobileScreen />;
    if (onActionCenterRoute) return <ActionCenterScreen />;
    if (onMindmapHubRoute) return <MindmapHubMobileScreen />;
    if (onMessagesRoute) return <MessagesMobileScreen />;
    if (onNotesRoute) return <NotesMobileScreen />;
    if (onBoardRoute) return <BoardMobileScreen />;
    if (onColdContactsRoute) return <ColdContactsMobileScreen />;
    if (onContractsRoute) return <ContractsReviewScreen detailIdFromPath={selectedContractReviewId} />;
    if (onContractsOtherRoute) {
      return <PlaceholderScreen title="Smlouvy" description="Tato část smluv (mimo AI review) je zatím optimalizovaná pro desktop." icon={FileText} />;
    }
    if (onAnalysesCompanyRoute) {
      return <PlaceholderScreen title="Firemní analýza" description="Firemní finanční analýza je optimalizovaná pro desktop. Otevřete ji na počítači pro plnou funkcionalitu." icon={Briefcase} />;
    }
    if (onAnalysesRoute) return <AnalysesHubScreen detailIdFromPath={selectedAnalysisIdFromQuery} deviceClass={deviceClass} />;
    if (onCalculatorsRoute) {
      return (
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
      );
    }
    if (onBusinessPlanRoute) return <BusinessPlanScreen deviceClass={deviceClass} />;
    if (onTeamOverviewRoute) return <TeamOverviewScreen deviceClass={deviceClass} />;
    if (onSetupRoute) return <SettingsProfileScreen advisorName={advisorName} />;
    if (onNotificationsRoute) return <NotificationsInboxScreen onBadgeCountChange={setNotificationBadgeCount} />;
    if (onCalendarRoute)
      return (
        <CalendarScreen
          contacts={contacts}
          deviceClass={deviceClass}
          canWriteCalendar={canWriteCalendar}
          onOpenGlobalAppMenu={() => setDrawerOpen(true)}
        />
      );
    if (onAiRoute) return <AiAssistantChatScreen />;
    if (onDocumentsRoute) return <DocumentsHubScreen deviceClass={deviceClass} />;
    if (onProductionRoute) return <ProductionScreen deviceClass={deviceClass} />;
    if (onToolsRoute) {
      return (
        <MobileSection title="Nástroje Google">
          {!browserPluginLikelyAvailable ? (
            <MobileCard className="p-3 mb-2 border-amber-200 bg-amber-50">
              <p className="text-xs font-bold text-amber-900">
                V této aplikaci chybí plugin prohlížeče (Capacitor Browser). OAuth přihlášení ke Google může selhat — použijte webový prohlížeč nebo aktualizujte build.
              </p>
            </MobileCard>
          ) : null}
          <div className="grid grid-cols-1 gap-2">
            <MobileCard>
              <p className="text-sm font-bold text-slate-900">Gmail Workspace</p>
              <p className="mt-1 text-xs text-slate-600">
                Na mobilu otevřete Gmail integraci přes Nastavení &gt; Integrace nebo desktop režim.
              </p>
              <button
                type="button"
                onClick={() => router.push("/portal/setup?tab=integrace&provider=gmail")}
                className="mt-3 min-h-[44px] w-full rounded-xl border border-slate-300 text-sm font-bold text-slate-700 active:scale-[0.99] transition-transform"
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
                className="mt-3 min-h-[44px] w-full rounded-xl border border-slate-300 text-sm font-bold text-slate-700 active:scale-[0.99] transition-transform"
              >
                Otevřít Drive integraci
              </button>
            </MobileCard>
          </div>
        </MobileSection>
      );
    }

    // Tab-based (bottom nav primary screens)
    if (tab === "tasks") {
      return (
        <TasksScreen
          tasks={tasks}
          taskCounts={taskCounts}
          taskFilter={taskFilter}
          contacts={contacts}
          deviceClass={deviceClass}
          refreshing={shellPending}
          onFilterChange={(next) => {
            setTaskFilter(next);
            refreshTasks(next);
          }}
          onToggleTask={onTaskToggle}
          onDeleteTask={onTaskDelete}
          onQuickOverdueFix={onTaskQuickOverdueFix}
        />
      );
    }
    if (tab === "clients") {
      return (
        <ContactsScreen
          contacts={contacts}
          selectedContactId={selectedContactId}
          deviceClass={deviceClass}
          refreshing={shellPending}
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
      );
    }
    if (tab === "pipeline") {
      return (
        <PipelineScreen
          pipeline={pipeline}
          deviceClass={deviceClass}
          refreshing={shellPending}
          onMoveOpportunity={onOpportunityMove}
          contactOptions={pipelineContactOptions}
          onOpenContact={(id) => router.push(`/portal/contacts/${id}`)}
          onPipelineRefresh={refreshPipeline}
        />
      );
    }

    // Default fallback: Dashboard
    return (
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
    );
  }

  return (
    <ToastProvider>
    <MobileAppShell deviceClass={deviceClass}>
      {/* Global banners */}
      <OfflineBanner />
      {toast ? <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} /> : null}

      <MobileHeader
        title={headerMeta.title}
        subtitle={headerMeta.subtitle}
        deviceClass={deviceClass}
        left={
          detailRouteActive ? (
            <button
              type="button"
              onClick={handleHeaderBack}
              className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 grid place-items-center active:scale-95 transition-transform"
              aria-label="Zpět"
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 grid place-items-center active:scale-95 transition-transform"
              aria-label="Otevřít menu"
            >
              <Menu size={20} />
            </button>
          )
        }
        right={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setGlobalSearchOpen(true)}
              className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 grid place-items-center active:scale-95 transition-transform"
              aria-label="Hledat"
            >
              <Search size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                setDrawerOpen(false);
                router.push("/portal/ai");
              }}
              className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 grid place-items-center active:scale-95 transition-transform text-indigo-600"
              aria-label="Zeptat se AI"
            >
              <Sparkles size={18} />
            </button>
            <button
              type="button"
              onClick={() => router.push("/portal/notifications")}
              className="relative min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 grid place-items-center active:scale-95 transition-transform"
              aria-label="Notifikace"
            >
              <Bell size={18} />
              {notificationBadgeCount > 0 ? (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] leading-4 text-center">
                  {notificationBadgeCount > 9 ? "9+" : notificationBadgeCount}
                </span>
              ) : null}
            </button>
          </div>
        }
      />

      <MobileSideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        pathname={pathname}
        onNavigate={(href) => {
          setDrawerOpen(false);
          router.push(href);
        }}
        showTeamOverview={showTeamOverview}
        advisorName={advisorName}
        deviceClass={deviceClass}
        tasksBadge={taskCounts.overdue > 0 ? taskCounts.overdue : undefined}
        messagesBadge={unreadMessagesCount > 0 ? unreadMessagesCount : undefined}
        onOpenAi={() => router.push("/portal/ai")}
        roleName={roleName}
        searchSlot={
          <button
            type="button"
            onClick={() => {
              setDrawerOpen(false);
              setGlobalSearchOpen(true);
            }}
            className="w-full flex items-center gap-2 min-h-[44px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500 text-left active:scale-[0.99] transition-transform"
          >
            <Search size={16} className="shrink-0 text-slate-400" />
            <span className="truncate">Hledat v CRM…</span>
          </button>
        }
      />

      <MobileGlobalSearchOverlay open={globalSearchOpen} onClose={() => setGlobalSearchOpen(false)} />

      <MobileScreen
        key={pathname}
        className={`page-enter${onCalendarRoute ? " !min-h-0 flex flex-1 flex-col px-0 !space-y-0 pt-2" : ""}`}
      >
        {error ? <ErrorState title={error} onRetry={() => { refreshTasks(taskFilter); refreshContacts(); refreshPipeline(); }} /> : null}

        <MobileShellErrorBoundary>
          {resolveActiveScreen()}
        </MobileShellErrorBoundary>
      </MobileScreen>

      {!detailRouteActive && tab === "tasks" ? (
        <FloatingActionButton onClick={() => setTaskCreateOpen(true)} label="Nový úkol" />
      ) : null}
      {!detailRouteActive && tab === "clients" ? (
        <FloatingActionButton onClick={() => setClientCreateOpen(true)} label="Nový klient" />
      ) : null}
      {!detailRouteActive && tab === "pipeline" ? (
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
          <div className="space-y-4">
            <MobileCard>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Obchodní případ
              </p>
              <p className="text-lg font-black text-slate-900 mt-1 leading-tight">
                {selectedOpportunity.title}
              </p>
              <div className="mt-3 min-h-[44px] flex items-center">
                {selectedOpportunity.contactId ? (
                  <Link
                    href={`/portal/contacts/${selectedOpportunity.contactId}`}
                    className="text-sm font-black text-indigo-600 hover:underline py-2 -my-2"
                  >
                    {selectedOpportunity.contactName}
                  </Link>
                ) : (
                  <span className="text-sm text-slate-600">
                    {selectedOpportunity.contactName || "Bez klienta"}
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusBadge tone="info">{selectedOpportunity.stageName}</StatusBadge>
                <StatusBadge>{selectedOpportunity.caseType || "Jiné"}</StatusBadge>
              </div>
            </MobileCard>

            <MobileCard>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Konečná cena
                  </p>
                  <p className="text-base font-black text-slate-900 mt-1">
                    {selectedOpportunity.expectedValue
                      ? `${Number(selectedOpportunity.expectedValue).toLocaleString("cs-CZ")} Kč`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Odhad uzavření
                  </p>
                  <p className="text-base font-bold text-slate-800 mt-1">
                    {selectedOpportunity.expectedCloseDate
                      ? (() => {
                          const d = new Date(selectedOpportunity.expectedCloseDate!);
                          return Number.isNaN(d.getTime())
                            ? selectedOpportunity.expectedCloseDate
                            : d.toLocaleDateString("cs-CZ");
                        })()
                      : "—"}
                  </p>
                </div>
              </div>
            </MobileCard>

            <MobileCard>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-black">
                Posunout do fáze
              </p>
              <div className="mt-3 space-y-2">
                {stageOptions.map((stage) => {
                  const active = stage.id === selectedOpportunity.stageId;
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => onOpportunityMove(selectedOpportunity.id, stage.id)}
                      className={`w-full min-h-[44px] rounded-xl border text-left px-3 text-sm font-semibold transition-colors touch-manipulation ${
                        active
                          ? "border-blue-600 bg-blue-50 text-blue-800"
                          : "border-slate-200 text-slate-800 hover:bg-slate-50 active:bg-slate-100"
                      }`}
                    >
                      {stage.label}
                    </button>
                  );
                })}
              </div>
            </MobileCard>
          </div>
        )}
      </FullscreenSheet>

      <MobileBottomNav
        items={navItems}
        activeId={tab === "none" ? null : tab}
        onSelect={(id) => navigateTab(id as TabId)}
        deviceClass={deviceClass}
      />
    </MobileAppShell>
    <PortalFeedbackLauncher variant="mobile" />
    </ToastProvider>
  );
}
