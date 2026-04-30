"use client";

import * as Sentry from "@sentry/nextjs";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useTransition, type UIEvent } from "react";
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
  Search,
  FileText,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import type { DashboardKpis } from "@/app/actions/dashboard";
import type { ServiceRecommendationWithContact } from "@/app/actions/service-engine";
import type { MeetingNoteForBoard } from "@/app/actions/meeting-notes";
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
import { getServiceRecommendationsForDashboard } from "@/app/actions/service-engine";
import { getMeetingNotesForBoard } from "@/app/actions/meeting-notes";
import { listFinancialAnalyses, type FinancialAnalysisListItem } from "@/app/actions/financial-analyses";
import { getPortalShellBadgeCounts } from "@/app/actions/portal-badges";
import { defaultTaskDueDateYmd, localCalendarTodayYmd } from "@/lib/date/date-only";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import {
  BottomSheet,
  EmptyState,
  ErrorState,
  FullscreenSheet,
  MobileAppShell,
  MobileBottomNav,
  MobileCard,
  MobileCurrentSectionPill,
  MobileHeader,
  MobileScreen,
  MobileSection,
  MobileUnsupportedRouteScreen,
  MobileWebOnlyRoutePlaceholder,
  OfflineBanner,
  StatusBadge,
  StepWizard,
  Toast,
  useToast,
} from "@/app/shared/mobile-ui/primitives";
import { notifyRouteForWebview, notifyWebviewReady } from "@/app/shared/mobile-ui/webview-bridge";
import { registerBackHandler } from "@/app/shared/mobile-ui/native-back-stack";
import { openIntegrationConnect } from "@/lib/native/open-integration-connect";
import { useDeviceClass } from "@/lib/ui/useDeviceClass";
import { useMobilePortalDocumentViewportLock } from "@/lib/ui/useMobilePortalDocumentViewportLock";
import { DashboardScreen } from "./screens/DashboardScreen";
import { TasksScreen } from "./screens/TasksScreen";
import { ContactsScreen } from "./screens/ContactsScreen";
import { MobileSideDrawer } from "@/app/shared/mobile-ui/MobileSideDrawer";
import { MobileGlobalSearchOverlay } from "./MobileGlobalSearchOverlay";
import { MobileShellErrorBoundary } from "@/app/shared/mobile-ui/MobileShellErrorBoundary";
import { ToastProvider } from "@/app/components/Toast";
import { ForceUpdateGate } from "@/app/components/ForceUpdateGate";
import { AdvisorInAppNotificationsProvider } from "@/app/portal/AdvisorInAppNotificationsContext";
import { AdvisorClientRequestToastStack } from "@/app/portal/AdvisorClientRequestToastStack";
import { PortalFeedbackLauncher } from "@/app/portal/PortalFeedbackLauncher";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";
import { PlaceholderScreen } from "./screens/PlaceholderScreen";
import { QuickNewMobileSheet } from "./QuickNewMobileSheet";
import { hasPermission, type RoleName } from "@/shared/rolePermissions";
import { isPortalMultiPageScanEnabled } from "@/lib/portal/portal-scan-enabled";

function RouteLoadingSkeleton() {
  return (
    <div className="flex flex-1 min-h-[40vh] items-center justify-center px-4 text-[color:var(--wp-text-secondary)] text-sm">
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
const ScanPage = dynamic(() => import("../scan/page"), {
  loading: () => <RouteLoadingSkeleton />,
});
const HouseholdDetailScreen = dynamic(
  () => import("./screens/HouseholdDetailScreen").then((m) => m.HouseholdDetailScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);
const ContractsReviewScreen = dynamic(
  () => import("./screens/ContractsReviewScreen").then((m) => m.ContractsReviewScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);
const AnalysesHubScreen = dynamic(
  () => import("./screens/AnalysesHubScreen").then((m) => m.AnalysesHubScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);
const BusinessPlanScreen = dynamic(
  () => import("./screens/BusinessPlanScreen").then((m) => m.BusinessPlanScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);
const SettingsProfileScreen = dynamic(
  () => import("./screens/SettingsProfileScreen").then((m) => m.SettingsProfileScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);
const ClientPortalRequestsInboxLoader = dynamic(
  () => import("../notifications/ClientPortalRequestsInboxLoader").then((m) => m.ClientPortalRequestsInboxLoader),
  { loading: () => <RouteLoadingSkeleton /> },
);
const AiAssistantChatScreen = dynamic(
  () => import("./screens/AiAssistantChatScreen").then((m) => m.AiAssistantChatScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);
const DocumentsHubScreen = dynamic(
  () => import("./screens/DocumentsHubScreen").then((m) => m.DocumentsHubScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);
const ProductionScreen = dynamic(
  () => import("./screens/ProductionScreen").then((m) => m.ProductionScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);
const HouseholdsListMobileScreen = dynamic(
  () => import("./screens/HouseholdsListMobileScreen").then((m) => m.HouseholdsListMobileScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);
const MessagesMobileScreen = dynamic(
  () => import("./screens/MessagesMobileScreen").then((m) => m.MessagesMobileScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);
const NotesMobileScreen = dynamic(
  () => import("./screens/NotesMobileScreen").then((m) => m.NotesMobileScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);
const ColdContactsMobileScreen = dynamic(
  () => import("./screens/ColdContactsMobileScreen").then((m) => m.ColdContactsMobileScreen),
  { loading: () => <RouteLoadingSkeleton /> },
);

// Navigation helpers extracted to a pure module for unit-testing. See
// `./route-helpers.ts` — the mobile portal must keep using these imports so
// that unit tests and this client stay in sync.
import {
  type TabId,
  classifyMobilePortalRoute,
  pathnameToBottomTab,
  normalizePortalPathname,
  isDetailRoute,
  decideHeaderBackAction,
  parseContactIdFromPath,
  parseOpportunityIdFromPath,
  parseHouseholdIdFromPath,
  isPrimaryTabHubPath,
} from "./route-helpers";

type TaskFilter = "all" | "today" | "week" | "overdue" | "completed";

function parseContractReviewIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/portal\/contracts\/review\/([^/]+)/);
  return m?.[1] ?? null;
}

function parseMindmapMapId(pathname: string): string | null {
  const m = pathname.match(/^\/portal\/mindmap\/([^/]+)$/);
  return m?.[1] ?? null;
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
  { test: (p) => p.startsWith("/portal/setup"), title: "Nastavení", subtitle: "Profil, preference, integrace" },
  { test: (p) => p.startsWith("/portal/notifications"), title: "Klientské požadavky", subtitle: "Inbox z klientského portálu" },
  { test: (p) => p.startsWith("/portal/calendar"), title: "Kalendář", subtitle: "Schůzky a události" },
  { test: (p) => p.startsWith("/portal/ai"), title: "AI Asistent", subtitle: "Váš CRM asistent s přístupem k datům" },
  { test: (p) => p.startsWith("/portal/production"), title: "Produkce", subtitle: "Uzavřené smlouvy a pojistné" },
  { test: (p) => p.startsWith("/portal/scan"), title: "Skenovat dokument", subtitle: "Vícestránkový sken" },
  { test: (p) => p.startsWith("/portal/documents"), title: "Dokumenty", subtitle: "Nahrané dokumenty a skeny" },
  { test: (p) => p.startsWith("/portal/tools"), title: "Nástroje Google", subtitle: "Gmail a Google Drive" },
  {
    test: (p) => p === "/portal/pipeline" || p.startsWith("/portal/pipeline/"),
    title: "Obchodní nástěnka",
    subtitle: "Obchodní případy ve fázích",
  },
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
  const subtitle = tab === "none" ? `Menu • ${advisorName}` : `Advisor \u2022 ${advisorName}`;
  if (tab === "home") return { title: "Přehled", subtitle };
  if (tab === "tasks") return { title: "Úkoly", subtitle };
  if (tab === "clients") return { title: "Klienti", subtitle };
  if (tab === "pipeline") return { title: "Obchodní nástěnka", subtitle };
  return { title: "Aidvisora", subtitle };
}

function resolvePrimaryHubPillLabel(tab: TabId, pathname: string): string {
  const currentTab = tab !== "none" ? tab : pathnameToBottomTab(pathname);
  if (currentTab === "home") return "Nástěnka";
  if (currentTab === "tasks") return "Úkoly";
  if (currentTab === "clients") return "Klienti";
  if (currentTab === "pipeline") return "Obchody";
  return "Aidvisora";
}

export function MobilePortalClient({
  advisorName,
  initialKpis,
  initialTasks,
  initialTaskCounts,
  initialContacts,
  initialPipeline,
  showTeamOverview = true,
  serviceRecommendations: initialServiceRecommendations = [],
  initialNotes: initialMeetingNotes = [],
  initialAnalyses: initialFinancialAnalyses = [],
  canWriteCalendar = true,
  roleName = "Advisor",
  deferDataHydration = false,
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
  canWriteCalendar?: boolean;
  roleName?: RoleName;
  /** Načte úkoly, kontakty, pipeline a doplňková data po idle — rychlejší první paint shellu. */
  deferDataHydration?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deviceClass = useDeviceClass();
  const { toast, showToast, dismissToast } = useToast();
  useMobilePortalDocumentViewportLock();

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
  const [serviceRecommendations, setServiceRecommendations] = useState(initialServiceRecommendations);
  const [meetingNotes, setMeetingNotes] = useState(initialMeetingNotes);
  const [financialAnalyses, setFinancialAnalyses] = useState(initialFinancialAnalyses);
  const [shellPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notificationBadgeCount, setNotificationBadgeCount] = useState(0);

  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [taskWizardStep, setTaskWizardStep] = useState(1);
  const [taskDraft, setTaskDraft] = useState<{ title: string; dueDate: string; contactId: string; description: string }>({
    title: "",
    dueDate: defaultTaskDueDateYmd(),
    contactId: "",
    description: "",
  });

  const [clientCreateOpen, setClientCreateOpen] = useState(false);
  const [opportunityCreateOpen, setOpportunityCreateOpen] = useState(false);
  const [opportunityDraft, setOpportunityDraft] = useState<{ title: string; caseType: string; stageId: string; contactId: string; expectedValue: string; expectedCloseDate: string }>({
    title: "",
    caseType: "hypotéka",
    stageId: "",
    contactId: "",
    expectedValue: "",
    expectedCloseDate: "",
  });
  const [opportunityDetailOpen, setOpportunityDetailOpen] = useState(false);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [quickNewOpen, setQuickNewOpen] = useState(false);

  useEffect(() => {
    setOpportunityDraft((d) => {
      if (d.stageId || pipeline.length === 0) return d;
      return { ...d, stageId: pipeline[0]!.id };
    });
  }, [pipeline]);

  /**
   * Sloučený hydrate — dřív to bylo ve dvou `Promise.allSettled` po sobě
   * (waterfall), což zbytečně prodlužovalo čas k plně hydratovanému mobilnímu
   * UI. Jedna vlna je měřitelně rychlejší a dispatchuje všechny setters
   * naráz (méně renderů).
   */
  useEffect(() => {
    if (!deferDataHydration) return;
    let cancelled = false;
    async function hydrate() {
      const [
        tasksRes,
        countsRes,
        contactsRes,
        pipelineRes,
        serviceRes,
        notesRes,
        analysesRes,
      ] = await Promise.allSettled([
        getTasksList("all"),
        getTasksCounts(),
        getContactsList(),
        getPipeline(),
        getServiceRecommendationsForDashboard(10),
        getMeetingNotesForBoard(),
        listFinancialAnalyses(),
      ]);
      if (cancelled) return;
      if (tasksRes.status === "fulfilled") setTasks(tasksRes.value);
      if (countsRes.status === "fulfilled") setTaskCounts(countsRes.value);
      if (contactsRes.status === "fulfilled") setContacts(contactsRes.value);
      if (pipelineRes.status === "fulfilled") setPipeline(pipelineRes.value);
      if (serviceRes.status === "fulfilled") setServiceRecommendations(serviceRes.value);
      if (notesRes.status === "fulfilled") setMeetingNotes(notesRes.value);
      if (analysesRes.status === "fulfilled") setFinancialAnalyses(analysesRes.value);
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [deferDataHydration]);

  const selectedContactId = parseContactIdFromPath(pathname);
  const selectedOpportunityPathId = parseOpportunityIdFromPath(pathname);
  const selectedHouseholdId = parseHouseholdIdFromPath(pathname);
  const selectedContractReviewId = parseContractReviewIdFromPath(pathname);
  const selectedAnalysisIdFromQuery = searchParams.get("id");
  const onContractsRoute = pathname.startsWith("/portal/contracts/review");
  const onContractsOtherRoute =
    pathname.startsWith("/portal/contracts") && !pathname.startsWith("/portal/contracts/review");
  const onAnalysesRoute = pathname.startsWith("/portal/analyses");
  const onAnalysesFinancialRoute = pathname.startsWith("/portal/analyses/financial");
  const onAnalysesCompanyRoute = pathname.startsWith("/portal/analyses/company");
  const onBusinessPlanRoute = pathname.startsWith("/portal/business-plan");
  const onSetupRoute = pathname.startsWith("/portal/setup");
  const onNotificationsRoute = pathname.startsWith("/portal/notifications");
  const onCalendarRoute = pathname.startsWith("/portal/calendar");
  const onToolsRoute = pathname.startsWith("/portal/tools");
  const onAiRoute = pathname.startsWith("/portal/ai");
  const onProductionRoute = pathname.startsWith("/portal/production");
  const onScanRoute = pathname.startsWith("/portal/scan");
  const onDocumentsRoute = pathname.startsWith("/portal/documents");
  const onMessagesRoute = pathname.startsWith("/portal/messages");
  const onNotesRoute = pathname.startsWith("/portal/notes");
  const onBoardRoute = pathname === "/portal/board" || pathname.startsWith("/portal/board/");
  const onColdContactsRoute = pathname.startsWith("/portal/cold-contacts");
  const mindmapMapId = parseMindmapMapId(pathname);
  const onMindmapHubRoute = pathname === "/portal/mindmap" || pathname === "/portal/mindmap/";
  const onMindmapMapRoute = Boolean(mindmapMapId);
  const onHouseholdsListRoute = pathname === "/portal/households";

  const browserPluginLikelyAvailable =
    !Capacitor.isNativePlatform() ||
    (typeof Capacitor.isPluginAvailable === "function" && Capacitor.isPluginAvailable("Browser"));

  useEffect(() => {
    notifyWebviewReady();
  }, []);

  /**
   * Notify the native shell when the pathname changes. `searchParams` is
   * intentionally NOT a dependency — many screens (Calendar, Messages,
   * Board, Documents) use `router.replace(?foo=bar)` to sync UI state into
   * the URL, and we don't want to spam the native shell with route events
   * for every filter tweak. The native side only cares about coarse
   * navigation.
   */
  useEffect(() => {
    notifyRouteForWebview(pathname, searchParams.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      (window as Window & { __AIDV_LAST_PORTAL_PATH__?: string }).__AIDV_LAST_PORTAL_PATH__ = pathname;
    } catch {
      /* ignore */
    }
    try {
      Sentry.addBreadcrumb({
        category: "portal.mobile",
        message: pathname,
        level: "info",
      });
    } catch {
      /* ignore */
    }
  }, [pathname]);

  useEffect(() => {
    setTab(pathnameToBottomTab(pathname));
    if (selectedOpportunityPathId) {
      setSelectedOpportunityId(selectedOpportunityPathId);
      setOpportunityDetailOpen(true);
    } else {
      setOpportunityDetailOpen(false);
    }
  }, [pathname, selectedOpportunityPathId]);

  /**
   * Hook the side drawer and global search into the shared back stack so
   * Android hw back / iOS edge-swipe / Esc all dismiss them consistently
   * before popping the Next.js router history.
   */
  useEffect(() => {
    if (!drawerOpen) return;
    return registerBackHandler(() => setDrawerOpen(false));
  }, [drawerOpen]);

  useEffect(() => {
    if (!globalSearchOpen) return;
    return registerBackHandler(() => setGlobalSearchOpen(false));
  }, [globalSearchOpen]);

  /**
   * Badge refetch — nezávislý na `pathname`. Dřívější varianta refetchovala
   * při každé změně cesty (tj. prakticky při každém kliknutí v portálu),
   * což přidávalo 2 round-tripy na každou navigaci. Nyní jen při vstupu do
   * obrazovky + každých 60 s, a když se okno vrátí do fokusu / tab se
   * probudí. To je přesnější i levnější.
   */
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      startTransition(async () => {
        try {
          /**
           * Dříve jsme sčítali `notification_log` (tenant-wide odchozí notifikace
           * za posledních 7 dní, bez konceptu unread) + `getUnreadConversationsCount`.
           * To držel bell trvale nenulový i poté, co poradce všechno vyřešil.
           * Nyní používáme stejný zdroj jako desktop: `advisor_notifications`
           * kde `status = 'unread'` a `target_user_id = <já>` + nepřečtené zprávy.
           */
          const { notifications: unreadNotifications, unreadConversations } =
            await getPortalShellBadgeCounts();
          if (cancelled) return;
          setUnreadMessagesCount(unreadConversations);
          setNotificationBadgeCount(unreadNotifications + unreadConversations);
        } catch {
          if (!cancelled) setNotificationBadgeCount(0);
        }
      });
    };
    refresh();
    const intervalId = window.setInterval(refresh, 60_000);
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

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

  const headerTitleMode = useMemo(() => (isPrimaryTabHubPath(pathname) ? "accessibilityOnly" : "default"), [pathname]);

  const chromeActionBtn =
    "min-h-[48px] min-w-[48px] rounded-[20px] border border-white/70 bg-white/55 text-[color:var(--wp-text)] shadow-[0_12px_26px_rgba(15,23,42,0.07)] ring-1 ring-[color:var(--wp-surface-card-border)]/40 backdrop-blur-2xl grid place-items-center active:scale-95 transition-transform";

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
    else return;
    setTab(next);
  }

  const mobileScrollLastY = useRef(0);
  const [mobileScrollChrome, setMobileScrollChrome] = useState({
    showBottomNav: true,
    showSectionPill: false,
  });

  useEffect(() => {
    mobileScrollLastY.current = 0;
    setMobileScrollChrome({ showBottomNav: true, showSectionPill: false });
  }, [pathname]);

  function handleMobileMainScroll(e: UIEvent<HTMLElement>) {
    const y = e.currentTarget.scrollTop;
    const dy = y - mobileScrollLastY.current;
    mobileScrollLastY.current = y;
    setMobileScrollChrome((prev) => {
      let nextBottom = prev.showBottomNav;
      const nextPill = y >= 8;
      if (y < 30) {
        nextBottom = true;
      } else {
        if (dy > 8) nextBottom = false;
        else if (dy < -8) nextBottom = true;
      }
      if (nextBottom === prev.showBottomNav && nextPill === prev.showSectionPill) return prev;
      return { showBottomNav: nextBottom, showSectionPill: nextPill };
    });
  }

  const primaryHubPillLabel = resolvePrimaryHubPillLabel(tab, pathname);

  const detailRouteActive = isDetailRoute(pathname);

  /**
   * Header back. Uses `router.back()` so we pop the existing history entry
   * instead of pushing a new one — critical for the "returning from click
   * back to origin" bug where `router.push(parent)` kept doubling history.
   *
   * Fallback: when there's no prior entry (deep-link cold start), we
   * `replace()` to the logical parent so the user still lands somewhere
   * sensible without leaving a broken "back" entry in the stack.
   */
  function handleHeaderBack() {
    setDrawerOpen(false);
    const historyLength =
      typeof window !== "undefined" ? window.history.length : 0;
    const decision = decideHeaderBackAction({ pathname, historyLength });
    Sentry.addBreadcrumb({
      category: "nav.header-back",
      level: "info",
      message: decision.kind === "back" ? "router_back" : "router_replace_parent",
      data: {
        pathname,
        historyLength,
        target: decision.kind === "replace" ? decision.target : undefined,
      },
    });
    if (decision.kind === "back") {
      router.back();
      return;
    }
    router.replace(decision.target);
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
        setError(e instanceof Error ? e.message : "Nepodařilo se načíst obchody.");
      }
    });
  }

  async function onTaskToggle(task: TaskRow) {
    startTransition(async () => {
      try {
        if (task.completedAt) await reopenTask(task.id);
        else await completeTask(task.id);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("portal-tasks-badge-refresh"));
        }
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
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("portal-tasks-badge-refresh"));
        }
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
        setTaskDraft({ title: "", dueDate: defaultTaskDueDateYmd(), contactId: "", description: "" });
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
        await updateTask(task.id, { dueDate: localCalendarTodayYmd() });
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
    { id: "pipeline", label: "Obchody", icon: Briefcase },
  ];

  const quickNewPreferScan =
    hasPermission(roleName, "documents:read") && isPortalMultiPageScanEnabled();

  /** Exactly one screen mounts per render — no more overlapping conditionals. */
  function resolveActiveScreen(): React.ReactNode {
    const normalizedPath = normalizePortalPathname(pathname);
    const routeTier = classifyMobilePortalRoute(normalizedPath);
    if (routeTier.kind === "web_only") {
      return (
        <MobileWebOnlyRoutePlaceholder
          title={routeTier.title}
          description={routeTier.description}
          pathnameForWeb={routeTier.openPath}
        />
      );
    }
    if (routeTier.kind === "unsupported") {
      return <MobileUnsupportedRouteScreen pathname={routeTier.path} />;
    }

    // Detail routes (dynamic segment) — check before their parent hub
    if (selectedHouseholdId) {
      return <HouseholdDetailScreen householdId={selectedHouseholdId} contacts={contacts} />;
    }
    if (onAnalysesFinancialRoute) {
      return (
        <MobileShellErrorBoundary fallbackTitle="Finanční analýza se nepovedla zobrazit">
          <FinancialAnalysisWizardScreen />
        </MobileShellErrorBoundary>
      );
    }
    if (onMindmapMapRoute && mindmapMapId) return <MindmapMapMobileScreen mapId={mindmapMapId} />;

    // Pathname-based section / hub routes
    if (onHouseholdsListRoute) return <HouseholdsListMobileScreen />;
    if (onMindmapHubRoute) return <MindmapHubMobileScreen />;
    if (onMessagesRoute) return <MessagesMobileScreen />;
    if (onNotesRoute) return <NotesMobileScreen seededMeetingNotes={meetingNotes} />;
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
    if (onBusinessPlanRoute) return <BusinessPlanScreen deviceClass={deviceClass} />;
    if (onSetupRoute) return <SettingsProfileScreen advisorName={advisorName} roleName={roleName} />;
    if (onNotificationsRoute) return <ClientPortalRequestsInboxLoader />;
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
    if (onScanRoute && !isPortalMultiPageScanEnabled()) {
      return (
        <MobileScreen>
          <MobileSection title="Dokumenty">
            <MobileCard className="p-4">
              <p className="text-sm text-[color:var(--wp-text-secondary)] leading-relaxed">
                Vícestránkový sken dokumentů je v této instalaci vypnutý. Nahrajte PDF nebo obrázek v sekci Dokumenty (tlačítko + nebo záložka Dokumenty).
              </p>
              <button
                type="button"
                onClick={() => router.push("/portal/documents")}
                className="mt-4 min-h-[48px] w-full rounded-xl bg-blue-600 px-4 text-sm font-bold text-white active:scale-[0.99] transition-transform"
              >
                Otevřít dokumenty
              </button>
            </MobileCard>
          </MobileSection>
        </MobileScreen>
      );
    }
    if (onScanRoute) return <ScanPage />;
    if (onDocumentsRoute) return <DocumentsHubScreen deviceClass={deviceClass} hideScreenFab />;
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
              <p className="text-sm font-bold text-[color:var(--wp-text)]">Gmail</p>
              <p className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">
                Přihlášení Google účtu pro integraci zpráv. V nativní aplikaci se otevře bezpečný prohlížeč.
              </p>
              <button
                type="button"
                onClick={() => void openIntegrationConnect("/api/integrations/gmail/connect")}
                className="mt-3 min-h-[44px] w-full rounded-xl bg-indigo-600 text-white text-sm font-bold active:scale-[0.99] transition-transform"
              >
                Připojit Gmail
              </button>
              <button
                type="button"
                onClick={() => router.push("/portal/setup")}
                className="mt-2 min-h-[40px] w-full rounded-xl border border-[color:var(--wp-surface-card-border)] text-xs font-bold text-[color:var(--wp-text-secondary)] active:scale-[0.99] transition-transform"
              >
                Nastavení integrací
              </button>
            </MobileCard>
            <MobileCard>
              <p className="text-sm font-bold text-[color:var(--wp-text)]">Google Disk</p>
              <p className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">
                Přihlášení pro náhledy a práci se soubory. Stav připojení upravíte i v Nastavení.
              </p>
              <button
                type="button"
                onClick={() => void openIntegrationConnect("/api/integrations/google-drive/connect")}
                className="mt-3 min-h-[44px] w-full rounded-xl bg-indigo-600 text-white text-sm font-bold active:scale-[0.99] transition-transform"
              >
                Připojit Disk
              </button>
              <button
                type="button"
                onClick={() => router.push("/portal/setup")}
                className="mt-2 min-h-[40px] w-full rounded-xl border border-[color:var(--wp-surface-card-border)] text-xs font-bold text-[color:var(--wp-text-secondary)] active:scale-[0.99] transition-transform"
              >
                Nastavení integrací
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
        initialNotes={meetingNotes}
        initialAnalyses={financialAnalyses}
        deviceClass={deviceClass}
        onNewTask={() => setTaskCreateOpen(true)}
        onNewClient={() => setClientCreateOpen(true)}
        onNewOpportunity={() => setOpportunityCreateOpen(true)}
      />
    );
  }

  return (
    <ToastProvider>
      <AdvisorInAppNotificationsProvider>
      <AdvisorClientRequestToastStack />
    <MobileAppShell deviceClass={deviceClass}>
      {/* Delta A9+A11: Force-update gate — blokuje UI při zastaralém app buildu. */}
      <ForceUpdateGate />
      {/* Global banners */}
      <OfflineBanner />
      {toast ? <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} /> : null}

      {!onAiRoute ? (
        <div className="sticky top-0 z-40 shrink-0">
          <MobileHeader
            title={headerMeta.title}
            subtitle={headerMeta.subtitle}
            deviceClass={deviceClass}
            titleMode={headerTitleMode}
            left={
              detailRouteActive ? (
                <button
                  type="button"
                  onClick={handleHeaderBack}
                  className={chromeActionBtn}
                  aria-label="Zpět"
                >
                  <ArrowLeft size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className={chromeActionBtn}
                  aria-label="Otevřít menu"
                >
                  <Menu size={20} />
                </button>
              )
            }
            right={
              <div className="flex items-center gap-1">
                <PortalFeedbackLauncher variant="mobileHeader" />
                <button
                  type="button"
                  onClick={() => setGlobalSearchOpen(true)}
                  className={chromeActionBtn}
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
                  className={`${chromeActionBtn} text-indigo-600`}
                  aria-label="Zeptat se AI"
                >
                  <AiAssistantBrandIcon size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/portal/notifications")}
                  className={`${chromeActionBtn} relative`}
                  aria-label="Klientské požadavky"
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
          {isPrimaryTabHubPath(pathname) && !detailRouteActive ? (
            <MobileCurrentSectionPill
              label={primaryHubPillLabel}
              visible={mobileScrollChrome.showSectionPill}
              deviceClass={deviceClass}
            />
          ) : null}
        </div>
      ) : null}

      {!onAiRoute ? (
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
              className="w-full flex items-center gap-2 min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] px-3 text-sm font-semibold text-[color:var(--wp-text-secondary)] text-left active:scale-[0.99] transition-transform"
            >
              <Search size={16} className="shrink-0 text-[color:var(--wp-text-tertiary)]" />
              <span className="truncate">Hledat v Aidvisory…</span>
            </button>
          }
        />
      ) : null}

      <MobileGlobalSearchOverlay open={globalSearchOpen} onClose={() => setGlobalSearchOpen(false)} />

      {/*
        NOTE: We intentionally DO NOT set `key={pathname}` on MobileScreen.
        Remounting the entire screen subtree on every navigation destroyed
        scroll position, form drafts, and in-flight requests. Individual
        screen components use their own pathname-derived state if they
        need to react to route changes.
      */}
      <MobileScreen
        onScroll={onAiRoute ? undefined : handleMobileMainScroll}
        className={`page-enter${
          onCalendarRoute
            ? " !min-h-0 flex flex-1 flex-col px-0 !space-y-0 pt-2"
            : onAiRoute
              ? " !min-h-0 flex flex-1 flex-col !px-0 !pt-0 !pb-0 !space-y-0"
              : onMessagesRoute
                ? " !min-h-0 flex flex-1 flex-col px-0 !space-y-0 !pt-0 !pb-0 !overflow-hidden"
                : onNotesRoute
                  ? " !min-h-0 flex flex-1 flex-col px-0 !space-y-0 !pt-0"
                  : ""
        }`}
      >
        {error ? <ErrorState title={error} onRetry={() => { refreshTasks(taskFilter); refreshContacts(); refreshPipeline(); }} /> : null}

        <MobileShellErrorBoundary>
          {resolveActiveScreen()}
        </MobileShellErrorBoundary>
      </MobileScreen>

      <BottomSheet open={taskCreateOpen} onClose={() => setTaskCreateOpen(false)} title="Nový úkol">
        <StepWizard step={taskWizardStep} total={3}>
          {taskWizardStep === 1 ? (
            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-wider text-[color:var(--wp-text-secondary)] block">Název</label>
              <input
                type="text"
                value={taskDraft.title}
                onChange={(e) => setTaskDraft((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
                placeholder="Např. Zavolat klientovi"
              />
              <label className="text-xs font-black uppercase tracking-wider text-[color:var(--wp-text-secondary)] block">Termín</label>
              <input
                type="date"
                value={taskDraft.dueDate}
                onChange={(e) => setTaskDraft((prev) => ({ ...prev, dueDate: e.target.value }))}
                className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
              />
            </div>
          ) : null}
          {taskWizardStep === 2 ? (
            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-wider text-[color:var(--wp-text-secondary)] block">Klient</label>
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
              <label className="text-xs font-black uppercase tracking-wider text-[color:var(--wp-text-secondary)] block">Popis</label>
              <textarea
                rows={4}
                value={taskDraft.description}
                onChange={(e) => setTaskDraft((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 py-2 text-sm"
                placeholder="Doplňte kontext…"
              />
            </div>
          ) : null}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => (taskWizardStep > 1 ? setTaskWizardStep((s) => s - 1) : setTaskCreateOpen(false))}
              className="flex-1 min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] text-sm font-bold"
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
              <CreateActionButton type="button" onClick={onTaskSave} className="min-h-[44px] flex-1" icon={null}>
                Vytvořit
              </CreateActionButton>
            )}
          </div>
        </StepWizard>
      </BottomSheet>

      <BottomSheet open={clientCreateOpen} onClose={() => setClientCreateOpen(false)} title="Nový klient">
        <p className="text-sm text-[color:var(--wp-text-secondary)]">Pro první vlnu je vytvoření klienta vedeno přes existující wizard.</p>
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
          <label className="text-xs font-black uppercase tracking-wider text-[color:var(--wp-text-secondary)] block">Název případu</label>
          <input
            type="text"
            value={opportunityDraft.title}
            onChange={(e) => setOpportunityDraft((prev) => ({ ...prev, title: e.target.value }))}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
          />
          <label className="text-xs font-black uppercase tracking-wider text-[color:var(--wp-text-secondary)] block">Typ případu</label>
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
          <label className="text-xs font-black uppercase tracking-wider text-[color:var(--wp-text-secondary)] block">Fáze</label>
          <CustomDropdown
            value={opportunityDraft.stageId}
            onChange={(id) => setOpportunityDraft((prev) => ({ ...prev, stageId: id }))}
            options={stageOptions.map((stage) => ({ id: stage.id, label: stage.label }))}
          />
          <label className="text-xs font-black uppercase tracking-wider text-[color:var(--wp-text-secondary)] block">Klient</label>
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
              className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
            />
            <input
              type="date"
              value={opportunityDraft.expectedCloseDate}
              onChange={(e) => setOpportunityDraft((prev) => ({ ...prev, expectedCloseDate: e.target.value }))}
              className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
            />
          </div>
          <CreateActionButton type="button" onClick={onOpportunityCreate} className="min-h-[44px] w-full" icon={null}>
            Vytvořit případ
          </CreateActionButton>
        </div>
      </BottomSheet>

                  <FullscreenSheet
                    open={opportunityDetailOpen}
                    onClose={() => {
                      // The sheet is opened by the pathname (/portal/pipeline/[id]) via
                      // the effect above, so closing must traverse history back — not
                      // push a NEW /portal/pipeline entry (that was the bug: it
                      // doubled the stack and the next header-back landed on this
                      // same page). The effect will flip `opportunityDetailOpen` to
                      // false once the pathname no longer contains an opportunity id.
                      const canGoBack =
                        selectedOpportunityPathId &&
                        typeof window !== "undefined" &&
                        window.history.length > 1;
                      Sentry.addBreadcrumb({
                        category: "nav.opportunity-detail-close",
                        level: "info",
                        message: canGoBack ? "router_back" : "router_replace_pipeline",
                        data: { selectedOpportunityPathId },
                      });
                      if (canGoBack) {
                        router.back();
                      } else {
                        setOpportunityDetailOpen(false);
                        if (selectedOpportunityPathId) router.replace("/portal/pipeline");
                      }
                    }}
                    title="Detail případu"
                  >
        {!selectedOpportunity ? (
          <EmptyState title="Případ nenalezen" />
        ) : (
          <div className="space-y-4">
            <MobileCard>
              <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                Obchodní případ
              </p>
              <p className="text-lg font-black text-[color:var(--wp-text)] mt-1 leading-tight">
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
                  <span className="text-sm text-[color:var(--wp-text-secondary)]">
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
                  <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                    Konečná cena
                  </p>
                  <p className="text-base font-black text-[color:var(--wp-text)] mt-1">
                    {selectedOpportunity.expectedValue
                      ? `${Number(selectedOpportunity.expectedValue).toLocaleString("cs-CZ")} Kč`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                    Odhad uzavření
                  </p>
                  <p className="text-base font-bold text-[color:var(--wp-text)] mt-1">
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
              <p className="text-xs uppercase tracking-wider text-[color:var(--wp-text-secondary)] font-black">
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
                          : "border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)] active:bg-[color:var(--wp-surface-muted)]"
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

      <QuickNewMobileSheet
        open={quickNewOpen}
        onClose={() => setQuickNewOpen(false)}
        onNewTask={() => setTaskCreateOpen(true)}
        onNewClient={() => setClientCreateOpen(true)}
        onNewOpportunity={() => setOpportunityCreateOpen(true)}
        showScanShortcut={quickNewPreferScan}
      />

      {!onAiRoute ? (
        <MobileBottomNav
          items={navItems}
          activeId={tab === "none" ? null : tab}
          onSelect={(id) => navigateTab(id as TabId)}
          deviceClass={deviceClass}
          visible={mobileScrollChrome.showBottomNav}
          centerFab={{
            onClick: () => {
              setDrawerOpen(false);
              setQuickNewOpen(true);
            },
            ariaLabel: "Nový – rychlé akce",
          }}
        />
      ) : null}
    </MobileAppShell>
    </AdvisorInAppNotificationsProvider>
    </ToastProvider>
  );
}
