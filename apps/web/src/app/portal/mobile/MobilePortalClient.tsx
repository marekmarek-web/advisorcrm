"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  Briefcase,
  Menu,
  Bell,
  ArrowLeft,
  Phone,
  Mail,
  ChevronRight,
} from "lucide-react";
import type { DashboardKpis } from "@/app/actions/dashboard";
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
import {
  BottomSheet,
  EmptyState,
  ErrorState,
  FilterChips,
  FloatingActionButton,
  FullscreenSheet,
  LoadingSkeleton,
  MetricCard,
  MobileAppShell,
  MobileBottomNav,
  MobileCard,
  MobileHeader,
  MobileScreen,
  MobileSection,
  SearchBar,
  StatusBadge,
  StepWizard,
} from "@/app/shared/mobile-ui/primitives";
import { ClientProfileScreen } from "./screens/ClientProfileScreen";
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
  if (pathname.startsWith("/portal/today")) return "home";
  return "menu";
}

function formatDateLabel(date: string | null) {
  if (!date) return "Bez termínu";
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "short" });
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
}: {
  advisorName: string;
  initialKpis: DashboardKpis;
  initialTasks: TaskRow[];
  initialTaskCounts: TaskCounts;
  initialContacts: ContactRow[];
  initialPipeline: StageWithOpportunities[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => toTaskFilter(pathname));
  const [kpis] = useState<DashboardKpis>(initialKpis);
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const [taskCounts, setTaskCounts] = useState<TaskCounts>(initialTaskCounts);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [taskSearch, setTaskSearch] = useState("");
  const [contacts, setContacts] = useState<ContactRow[]>(initialContacts);
  const [contactSearch, setContactSearch] = useState("");
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

  const taskFilterOptions = useMemo(
    () => [
      { id: "all", label: "Vše", badge: taskCounts.all },
      { id: "today", label: "Dnes", badge: taskCounts.today },
      { id: "week", label: "Týden", badge: taskCounts.week },
      { id: "overdue", label: "Po termínu", badge: taskCounts.overdue, tone: "warning" as const },
      { id: "completed", label: "Hotovo", badge: taskCounts.completed },
    ],
    [taskCounts]
  );

  const filteredTasks = useMemo(() => {
    const query = taskSearch.trim().toLowerCase();
    return tasks.filter((task) => {
      if (!query) return true;
      return task.title.toLowerCase().includes(query) || (task.contactName ?? "").toLowerCase().includes(query);
    });
  }, [taskSearch, tasks]);

  const filteredContacts = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();
    return contacts.filter((c) => {
      if (!query) return true;
      const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
      return fullName.includes(query) || (c.email ?? "").toLowerCase().includes(query) || (c.phone ?? "").toLowerCase().includes(query);
    });
  }, [contactSearch, contacts]);

  const stageOptions = useMemo(() => pipeline.map((s) => ({ id: s.id, label: s.name })), [pipeline]);

  function navigateTab(next: TabId) {
    setTab(next);
    if (next === "home") router.push("/portal/today");
    else if (next === "tasks") router.push("/portal/tasks");
    else if (next === "clients") router.push("/portal/contacts");
    else if (next === "pipeline") router.push("/portal/pipeline");
    else router.push("/portal/setup");
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
        onNotificationsRoute
    );
  }

  function handleHeaderBack() {
    if (selectedContactId) {
      router.push("/portal/contacts");
      return;
    }
    if (selectedHouseholdId) {
      router.push("/portal/households");
      return;
    }
    if (
      onContractsRoute ||
      onAnalysesRoute ||
      onCalculatorsRoute ||
      onBusinessPlanRoute ||
      onTeamOverviewRoute ||
      onSetupRoute ||
      onNotificationsRoute ||
      onCalendarRoute
    ) {
      router.push("/portal/setup");
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
    { id: "menu", label: "Menu", icon: Menu },
  ];

  const overdueFirstTask = tasks.find((t) => !t.completedAt && !!t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10));
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
                    : onCalendarRoute
                      ? "Schůzky a události"
            : `Advisor • ${advisorName}`;

  return (
    <MobileAppShell>
      <MobileHeader
        title={headerTitle}
        subtitle={headerSubtitle}
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

      <MobileScreen>
        {error ? <ErrorState title={error} onRetry={() => { refreshTasks(taskFilter); refreshContacts(); refreshPipeline(); }} /> : null}
        {busy ? <LoadingSkeleton rows={2} /> : null}

        {!selectedContact && tab === "home" ? (
          <>
            <MobileSection>
              <MobileCard className="bg-gradient-to-br from-[#1a1c2e] to-indigo-950 text-white border-slate-800">
                <p className="text-[11px] uppercase tracking-wider text-indigo-200 font-black">Dnešní kontext</p>
                <p className="mt-2 text-sm font-semibold leading-relaxed">
                  Máte {kpis.tasksDueToday.length} úkolů na dnes, {kpis.overdueTasks.length} po termínu a {kpis.meetingsToday} schůzek.
                </p>
                <button
                  type="button"
                  onClick={() => navigateTab("tasks")}
                  className="mt-3 min-h-[44px] w-full rounded-xl bg-indigo-600 text-white text-sm font-bold"
                >
                  Otevřít dnešní agendu
                </button>
              </MobileCard>
            </MobileSection>

            <MobileSection title="Metriky">
              <div className="grid grid-cols-2 gap-2">
                <MetricCard label="Schůzky dnes" value={kpis.meetingsToday} />
                <MetricCard label="Otevřené úkoly" value={kpis.tasksOpen} tone={kpis.overdueTasks.length > 0 ? "warning" : "default"} />
                <MetricCard label="Otevřené případy" value={kpis.opportunitiesOpen} />
                <MetricCard label="Kontakty" value={kpis.totalContacts} />
              </div>
            </MobileSection>

            <MobileSection title="Rychlé vstupy">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "tasks", label: "Úkoly", onClick: () => navigateTab("tasks") },
                  { id: "clients", label: "Klienti", onClick: () => navigateTab("clients") },
                  { id: "pipeline", label: "Pipeline", onClick: () => navigateTab("pipeline") },
                  { id: "menu", label: "Nástroje", onClick: () => navigateTab("menu") },
                ].map((x) => (
                  <MobileCard key={x.id} className="p-3">
                    <button type="button" onClick={x.onClick} className="w-full text-left min-h-[44px]">
                      <p className="text-sm font-bold">{x.label}</p>
                    </button>
                  </MobileCard>
                ))}
              </div>
            </MobileSection>
          </>
        ) : null}

        {!selectedContact && tab === "tasks" ? (
          <>
            <SearchBar value={taskSearch} onChange={setTaskSearch} placeholder="Hledat úkol..." />
            <FilterChips
              value={taskFilter}
              onChange={(id) => {
                const next = id as TaskFilter;
                setTaskFilter(next);
                refreshTasks(next);
              }}
              options={taskFilterOptions}
            />
            {overdueFirstTask ? (
              <MobileCard className="border-rose-200 bg-rose-50/50">
                <p className="text-sm font-bold text-rose-800">AI priorita</p>
                <p className="text-sm text-rose-700 mt-1">Úkol „{overdueFirstTask.title}“ je po termínu.</p>
                <button
                  type="button"
                  onClick={() => onTaskQuickOverdueFix(overdueFirstTask)}
                  className="mt-2 min-h-[40px] rounded-lg px-3 border border-rose-200 bg-white text-rose-700 text-sm font-bold"
                >
                  Přesunout na dnešek
                </button>
              </MobileCard>
            ) : null}
            {filteredTasks.length === 0 ? (
              <EmptyState title="Žádné úkoly" description="V tomto filtru nejsou žádné položky." />
            ) : (
              filteredTasks.map((task) => (
                <MobileCard key={task.id} className="p-3.5">
                  <div className="flex items-start gap-3">
                    <button type="button" onClick={() => onTaskToggle(task)} className="mt-0.5 min-h-[24px] min-w-[24px] rounded-full border border-slate-300">
                      {task.completedAt ? "✓" : ""}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-bold ${task.completedAt ? "line-through text-slate-400" : "text-slate-900"}`}>{task.title}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge tone={!task.completedAt && !!task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10) ? "danger" : "neutral"}>
                          {formatDateLabel(task.dueDate)}
                        </StatusBadge>
                        {task.contactName ? <StatusBadge tone="info">{task.contactName}</StatusBadge> : null}
                      </div>
                    </div>
                    <button type="button" onClick={() => onTaskDelete(task.id)} className="text-xs text-rose-700 font-bold min-h-[30px]">
                      Smazat
                    </button>
                  </div>
                </MobileCard>
              ))
            )}
          </>
        ) : null}

        {selectedContact || tab === "clients" ? (
          <>
            {!selectedContact ? (
              <>
                <SearchBar value={contactSearch} onChange={setContactSearch} placeholder="Hledat klienta..." />
                {filteredContacts.length === 0 ? (
                  <EmptyState title="Žádní klienti" />
                ) : (
                  filteredContacts.map((c) => (
                    <MobileCard key={c.id} className="p-3.5">
                      <button type="button" onClick={() => router.push(`/portal/contacts/${c.id}`)} className="w-full text-left">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{c.firstName} {c.lastName}</p>
                            <p className="text-xs text-slate-500 truncate">{c.email ?? "Bez e-mailu"}</p>
                            <p className="text-xs text-slate-500">{c.phone ?? "Bez telefonu"}</p>
                          </div>
                          <ChevronRight size={16} className="text-slate-400 mt-0.5" />
                        </div>
                      </button>
                      <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2">
                        {c.phone ? (
                          <a href={`tel:${c.phone}`} className="min-h-[44px] flex-1 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold grid place-items-center">
                            <Phone size={14} />
                          </a>
                        ) : null}
                        {c.email ? (
                          <a href={`mailto:${c.email}`} className="min-h-[44px] flex-1 rounded-lg border border-slate-200 text-slate-700 text-xs font-bold grid place-items-center">
                            <Mail size={14} />
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setTaskDraft((prev) => ({ ...prev, contactId: c.id }));
                            setTaskCreateOpen(true);
                          }}
                          className="min-h-[44px] flex-1 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold"
                        >
                          Úkol
                        </button>
                      </div>
                    </MobileCard>
                  ))
                )}
              </>
            ) : (
              <ClientProfileScreen
                contactId={selectedContact.id}
                onOpenTaskWizard={(contactId) => {
                  setTaskDraft((prev) => ({
                    ...prev,
                    title: prev.title || "Navazující úkol po klientském profilu",
                    contactId,
                  }));
                  setTaskCreateOpen(true);
                }}
                onOpenOpportunityWizard={(contactId) => {
                  setOpportunityDraft((prev) => ({ ...prev, contactId }));
                  setOpportunityCreateOpen(true);
                }}
                onOpenHousehold={(householdId) => router.push(`/portal/households/${householdId}`)}
              />
            )}
          </>
        ) : null}

        {!selectedContact && tab === "pipeline" ? (
          <>
            {pipeline.length === 0 ? (
              <EmptyState title="Pipeline je prázdná" />
            ) : (
              pipeline.map((stage) => (
                <MobileCard key={stage.id} className="p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black">{stage.name}</p>
                    <StatusBadge>{stage.opportunities.length}</StatusBadge>
                  </div>
                  <div className="mt-3 space-y-2">
                    {stage.opportunities.length === 0 ? (
                      <p className="text-xs text-slate-500">Žádné případy</p>
                    ) : (
                      stage.opportunities.map((opp) => (
                        <button
                          key={opp.id}
                          type="button"
                          onClick={() => router.push(`/portal/pipeline/${opp.id}`)}
                          className="w-full rounded-xl border border-slate-200 p-3 text-left"
                        >
                          <p className="text-sm font-bold">{opp.title}</p>
                          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                            <span>{opp.contactName || "Bez kontaktu"}</span>
                            <span>{opp.expectedValue ? `${Number(opp.expectedValue).toLocaleString("cs-CZ")} Kč` : "—"}</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </MobileCard>
              ))
            )}
          </>
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
        tab === "menu" ? (
          <MobileSection title="Nástroje">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Kalendář", href: "/portal/calendar" },
                { label: "Analýzy", href: "/portal/analyses" },
                { label: "AI smlouvy", href: "/portal/contracts/review" },
                { label: "Kalkulačky", href: "/portal/calculators" },
                { label: "Domácnosti", href: "/portal/households" },
                { label: "Můj plán", href: "/portal/business-plan" },
                { label: "Můj tým", href: "/portal/team-overview" },
                { label: "Nastavení", href: "/portal/setup" },
                { label: "Notifikace", href: "/portal/notifications" },
              ].map((item) => (
                <MobileCard key={item.href} className="p-0">
                  <button type="button" onClick={() => router.push(item.href)} className="w-full text-left px-3 py-4 min-h-[56px] text-sm font-bold">
                    {item.label}
                  </button>
                </MobileCard>
              ))}
            </div>
            <MobileCard>
              <p className="text-xs text-slate-600">Beta přepínač mobilní vlny</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await fetch("/api/feature-flags/mobile-ui-v1", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ enabled: true }),
                    });
                    window.location.reload();
                  }}
                  className="min-h-[40px] rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-emerald-700 text-sm font-bold"
                >
                  Zapnout beta
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch("/api/feature-flags/mobile-ui-v1", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ enabled: false }),
                    });
                    window.location.reload();
                  }}
                  className="min-h-[40px] rounded-lg border border-slate-200 px-3 text-slate-700 text-sm font-bold"
                >
                  Vypnout beta
                </button>
              </div>
            </MobileCard>
          </MobileSection>
        ) : null}

        {selectedHouseholdId ? (
          <HouseholdDetailScreen householdId={selectedHouseholdId} contacts={contacts} />
        ) : null}

        {onContractsRoute ? (
          <ContractsReviewScreen detailIdFromPath={selectedContractReviewId} />
        ) : null}

        {onAnalysesRoute ? (
          <AnalysesHubScreen detailIdFromPath={selectedAnalysisIdFromQuery} />
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
          />
        ) : null}

        {onBusinessPlanRoute ? <BusinessPlanScreen /> : null}

        {onTeamOverviewRoute ? <TeamOverviewScreen /> : null}

        {onSetupRoute ? <SettingsProfileScreen advisorName={advisorName} /> : null}

        {onNotificationsRoute ? (
          <NotificationsInboxScreen onBadgeCountChange={setNotificationBadgeCount} />
        ) : null}

        {onCalendarRoute ? <CalendarMobileScreen contacts={contacts} /> : null}
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
              <select
                value={taskDraft.contactId}
                onChange={(e) => setTaskDraft((prev) => ({ ...prev, contactId: e.target.value }))}
                className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm bg-white"
              >
                <option value="">Bez klienta</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName}
                  </option>
                ))}
              </select>
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
          <select
            value={opportunityDraft.caseType}
            onChange={(e) => setOpportunityDraft((prev) => ({ ...prev, caseType: e.target.value }))}
            className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm bg-white"
          >
            <option value="hypotéka">Hypotéka</option>
            <option value="investice">Investice</option>
            <option value="pojištění">Pojištění</option>
            <option value="úvěr">Úvěr</option>
            <option value="jiné">Jiné</option>
          </select>
          <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">Fáze</label>
          <select
            value={opportunityDraft.stageId}
            onChange={(e) => setOpportunityDraft((prev) => ({ ...prev, stageId: e.target.value }))}
            className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm bg-white"
          >
            {stageOptions.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.label}
              </option>
            ))}
          </select>
          <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">Klient</label>
          <select
            value={opportunityDraft.contactId}
            onChange={(e) => setOpportunityDraft((prev) => ({ ...prev, contactId: e.target.value }))}
            className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm bg-white"
          >
            <option value="">Bez klienta</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
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

      <MobileBottomNav items={navItems} activeId={tab} onSelect={(id) => navigateTab(id as TabId)} />
    </MobileAppShell>
  );
}
