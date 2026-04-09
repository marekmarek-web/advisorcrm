"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Users,
  TrendingUp,
  Calendar,
  AlertTriangle,
  UserPlus,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Minus,
  Check,
  X,
  Sparkles,
  RefreshCw,
  Target,
  ClipboardList,
  User,
  Filter,
  BarChart3,
  Briefcase,
  CheckCircle2,
  HeartHandshake,
} from "lucide-react";
import type {
  TeamOverviewKpis,
  TeamMemberInfo,
  TeamMemberMetrics,
  TeamAlert,
  NewcomerAdaptation,
  TeamPerformancePoint,
  TeamOverviewPeriod,
  TeamRhythmCalendarData,
} from "@/app/actions/team-overview";
import type { TeamOverviewScope, TeamTreeNode } from "@/lib/team-hierarchy-types";
import {
  getTeamOverviewKpis,
  getTeamMemberMetrics,
  buildTeamAlertsFromMemberMetrics,
  getNewcomerAdaptation,
  getTeamPerformanceOverTime,
  listTeamMembersWithNames,
  getTeamHierarchy,
  getTeamRhythmCalendarData,
} from "@/app/actions/team-overview";
import { generateTeamSummaryAction, getLatestTeamSummaryAction, submitAiFeedbackAction } from "@/app/actions/ai-generations";
import { createTeamActionFromAi } from "@/app/actions/ai-actions";
import type { AiFeedbackVerdict, AiFeedbackActionTaken } from "@/app/actions/ai-feedback";
import type { AiActionType } from "@/lib/ai/actions/action-suggestions";
import { SkeletonBlock } from "@/app/components/Skeleton";
import { TeamCalendarModal, TeamCalendarButtons, type TeamCalendarModalPrefill } from "./TeamCalendarModal";
import { TeamRhythmPanel } from "./TeamRhythmPanel";
import { computeTeamRhythmView } from "@/lib/team-rhythm/compute-view";
import { TeamStructurePanel } from "./TeamStructurePanel";
import clsx from "clsx";
import { AdvisorAiOutputNotice } from "@/app/components/ai/AdvisorAiOutputNotice";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";
import { buildTeamCoachingAttentionList } from "@/lib/career/career-coaching";
import { buildTeamCareerSummaryBlock } from "@/lib/career/team-career-aggregate";
import { careerCompletenessShortLabel, careerProgressShortLabel } from "@/lib/career/career-ui-labels";
import type { EvaluationCompleteness, ProgressEvaluation } from "@/lib/career/types";

function overviewCareerProgressBadgeClass(pe: ProgressEvaluation): string {
  if (pe === "on_track" || pe === "close_to_promotion" || pe === "promoted_ready") {
    return "bg-emerald-50 text-emerald-800 border border-emerald-200/70";
  }
  return "bg-amber-50 text-amber-900 border border-amber-200/70";
}

function overviewCareerCompletenessBadgeClass(ec: EvaluationCompleteness): string {
  if (ec === "full") return "bg-slate-50 text-slate-700 border border-slate-200/80";
  return "bg-violet-50 text-violet-800 border border-violet-200/70";
}

const PERIOD_OPTIONS: { value: TeamOverviewPeriod; label: string }[] = [
  { value: "week", label: "Týden" },
  { value: "month", label: "Měsíc" },
  { value: "quarter", label: "Kvartál" },
];

const FEEDBACK_VERDICTS: { value: AiFeedbackVerdict; label: string }[] = [
  { value: "accepted", label: "Přijato" },
  { value: "rejected", label: "Zamítnuto" },
  { value: "edited", label: "Upraveno" },
];

const FEEDBACK_ACTION_TAKEN: { value: AiFeedbackActionTaken; label: string }[] = [
  { value: "none", label: "Žádná akce" },
  { value: "task_created", label: "Vytvořena úloha" },
  { value: "meeting_created", label: "Vytvořena schůzka" },
  { value: "service_action_created", label: "Servisní akce" },
];

function TeamSummaryFeedback({
  onSubmit,
  saving,
  disabled,
}: {
  onSubmit: (verdict: AiFeedbackVerdict, actionTaken: AiFeedbackActionTaken) => void;
  saving: boolean;
  disabled: boolean;
}) {
  const [verdict, setVerdict] = useState<AiFeedbackVerdict>("accepted");
  const [actionTaken, setActionTaken] = useState<AiFeedbackActionTaken>("none");

  return (
    <div className="mt-4 pt-4 border-t border-[color:var(--wp-surface-card-border)]">
      <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] mb-2">Zpětná vazba k shrnutí</p>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {FEEDBACK_VERDICTS.map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => setVerdict(v.value)}
            disabled={disabled}
            className={`min-h-[44px] rounded-xl border px-3 py-2 text-sm font-medium disabled:opacity-60 ${
              verdict === v.value
                ? "border-violet-500 bg-violet-50 text-violet-700"
                : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-[color:var(--wp-text-secondary)]">Co jste udělali:</label>
        <CustomDropdown
          value={actionTaken}
          onChange={(id) => setActionTaken(id as AiFeedbackActionTaken)}
          options={FEEDBACK_ACTION_TAKEN.map((a) => ({ id: a.value, label: a.label }))}
          placeholder="Akce"
          icon={ClipboardList}
        />
        <button
          type="button"
          onClick={() => onSubmit(verdict, actionTaken)}
          disabled={disabled}
          className="min-h-[44px] rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {saving ? "Odesílám…" : "Odeslat zpětnou vazbu"}
        </button>
      </div>
    </div>
  );
}

const TEAM_ACTION_TYPES: { value: AiActionType; label: string }[] = [
  { value: "task", label: "Úkol" },
  { value: "meeting", label: "Schůzka" },
  { value: "service_action", label: "Servisní akce" },
];

function TeamSummaryFollowUp({
  members,
  onCreate,
  saving,
  error,
}: {
  members: TeamMemberInfo[];
  onCreate: (actionType: AiActionType, title: string, memberId: string | null, dueAt?: string) => void;
  saving: boolean;
  error: string | null;
}) {
  const [actionType, setActionType] = useState<AiActionType>("task");
  const [title, setTitle] = useState("");
  const [memberId, setMemberId] = useState<string>("");
  const [dueAt, setDueAt] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate(actionType, title.trim(), memberId || null, dueAt || undefined);
  };

  return (
    <div className="mt-4 pt-4 border-t border-[color:var(--wp-surface-card-border)]">
      <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] mb-2">Vytvořit follow-up z shrnutí</p>
      {error && <p className="mb-2 text-sm text-rose-600" role="alert">{error}</p>}
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <CustomDropdown
          value={actionType}
          onChange={(id) => setActionType(id as AiActionType)}
          options={TEAM_ACTION_TYPES.map((a) => ({ id: a.value, label: a.label }))}
          placeholder="Typ"
          icon={ClipboardList}
        />
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Název úkolu nebo schůzky"
          disabled={saving}
          className="min-h-[44px] flex-1 min-w-[160px] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-2 text-sm text-[color:var(--wp-text-secondary)] placeholder:text-[color:var(--wp-text-tertiary)] disabled:opacity-60"
        />
        <CustomDropdown
          value={memberId}
          onChange={setMemberId}
          options={[{ id: "", label: "— Přiřadit mně —" }, ...members.map((m) => ({ id: m.userId, label: m.displayName || m.email || m.userId }))]}
          placeholder="— Přiřadit mně —"
          icon={User}
        />
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          disabled={saving}
          className="min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-2 text-sm text-[color:var(--wp-text-secondary)] disabled:opacity-60"
          title="Termín"
        />
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className={clsx(portalPrimaryButtonClassName, "px-4 py-2 text-sm font-medium disabled:opacity-60")}
        >
          {saving ? "Vytvářím…" : "Vytvořit"}
        </button>
      </form>
    </div>
  );
}

const KPI_THEMES = {
  green: { bg: "bg-emerald-500/20", glow: "bg-emerald-500", subtitle: "text-emerald-600" },
  blue: { bg: "bg-blue-500/20", glow: "bg-blue-500", subtitle: "text-blue-600" },
  purple: { bg: "bg-violet-500/20", glow: "bg-violet-500", subtitle: "text-violet-600" },
  amber: { bg: "bg-amber-500/20", glow: "bg-amber-500", subtitle: "text-amber-600" },
  rose: { bg: "bg-rose-500/20", glow: "bg-rose-500", subtitle: "text-rose-600" },
} as const;

interface TeamOverviewViewProps {
  teamId: string;
  currentUserId: string;
  currentRole: string;
  initialScope: TeamOverviewScope;
  initialHierarchy: TeamTreeNode[];
  initialKpis: TeamOverviewKpis | null;
  initialMembers: TeamMemberInfo[];
  initialMetrics: TeamMemberMetrics[];
  initialAlerts: TeamAlert[];
  initialNewcomers: NewcomerAdaptation[];
  initialPerformanceOverTime: TeamPerformancePoint[];
  initialRhythmCalendar?: TeamRhythmCalendarData | null;
  defaultPeriod: TeamOverviewPeriod;
  canCreateTeamCalendar?: boolean;
  /** Úkol/schůzka z AI follow-up — stejná logika jako createTask (contacts:write | tasks:*). */
  canCreateAiTeamFollowUp?: boolean;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("cs-CZ");
}

function TrendIndicator({ trend }: { trend: number }) {
  if (trend > 0) return <span className="inline-flex items-center text-emerald-600 text-xs font-medium"><ArrowUp className="w-3.5 h-3.5 mr-0.5" />+{trend}</span>;
  if (trend < 0) return <span className="inline-flex items-center text-rose-600 text-xs font-medium"><ArrowDown className="w-3.5 h-3.5 mr-0.5" />{trend}</span>;
  return <span className="inline-flex items-center text-[color:var(--wp-text-secondary)] text-xs"><Minus className="w-3.5 h-3.5" /></span>;
}

export function TeamOverviewView({
  teamId,
  currentUserId,
  currentRole,
  initialScope,
  initialHierarchy,
  initialKpis,
  initialMembers,
  initialMetrics,
  initialAlerts,
  initialNewcomers,
  initialPerformanceOverTime,
  initialRhythmCalendar = null,
  defaultPeriod,
  canCreateTeamCalendar = false,
  canCreateAiTeamFollowUp = true,
}: TeamOverviewViewProps) {
  const [period, setPeriod] = useState<TeamOverviewPeriod>(defaultPeriod);
  const [scope, setScope] = useState<TeamOverviewScope>(initialScope);
  const [kpis, setKpis] = useState<TeamOverviewKpis | null>(initialKpis);
  const [members, setMembers] = useState<TeamMemberInfo[]>(initialMembers);
  const [metrics, setMetrics] = useState<TeamMemberMetrics[]>(initialMetrics);
  const [alerts, setAlerts] = useState<TeamAlert[]>(initialAlerts);
  const [newcomers, setNewcomers] = useState<NewcomerAdaptation[]>(initialNewcomers);
  const [performanceOverTime, setPerformanceOverTime] = useState<TeamPerformancePoint[]>(initialPerformanceOverTime);
  const [hierarchy, setHierarchy] = useState<TeamTreeNode[]>(initialHierarchy);
  const [roleFilter, setRoleFilter] = useState<"all" | "Advisor" | "Manager" | "Director">("all");
  const [riskOnly, setRiskOnly] = useState(false);
  const [onboardingOnly, setOnboardingOnly] = useState(false);
  const [performanceFilter, setPerformanceFilter] = useState<"all" | "top" | "bottom">("all");
  const [loading, setLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiGenerationId, setAiGenerationId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFeedbackSubmitted, setAiFeedbackSubmitted] = useState(false);
  const [aiFeedbackSaving, setAiFeedbackSaving] = useState(false);
  const [teamActionSaving, setTeamActionSaving] = useState(false);
  const [teamActionError, setTeamActionError] = useState<string | null>(null);
  const [teamCalendarModal, setTeamCalendarModal] = useState<"event" | "task" | null>(null);
  const [calendarPrefill, setCalendarPrefill] = useState<TeamCalendarModalPrefill | null>(null);
  const [rhythmCalendar, setRhythmCalendar] = useState<TeamRhythmCalendarData | null>(initialRhythmCalendar ?? null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [k, teamMembers, m, n, perf, tree, rhythm] = await Promise.all([
        getTeamOverviewKpis(period, scope),
        listTeamMembersWithNames(scope),
        getTeamMemberMetrics(period, scope),
        getNewcomerAdaptation(scope),
        getTeamPerformanceOverTime(period, scope),
        getTeamHierarchy(scope),
        getTeamRhythmCalendarData(scope),
      ]);
      setKpis(k ?? null);
      setMembers(teamMembers);
      setMetrics(m);
      setAlerts(buildTeamAlertsFromMemberMetrics(m));
      setNewcomers(n);
      setPerformanceOverTime(perf);
      setHierarchy(tree);
      setRhythmCalendar(rhythm);
    } finally {
      setLoading(false);
    }
  }, [period, scope]);

  const loadLatestTeamSummary = useCallback(async () => {
    setAiError(null);
    setAiLoading(true);
    try {
      const item = await getLatestTeamSummaryAction();
      if (item) {
        setAiSummary(item.outputText);
        setAiGenerationId(item.id);
      } else {
        setAiSummary(null);
        setAiGenerationId(null);
      }
    } catch {
      setAiError("Načtení shrnutí se nepovedlo.");
    } finally {
      setAiLoading(false);
    }
  }, []);

  const generateTeamSummary = useCallback(async () => {
    setAiError(null);
    setAiLoading(true);
    try {
      const result = await generateTeamSummaryAction(period, scope);
      if (result.ok) {
        setAiSummary(result.text);
        if (result.generationId) setAiGenerationId(result.generationId);
        setAiFeedbackSubmitted(false);
      } else {
        setAiError(result.error ?? "Generování se nepovedlo.");
      }
    } catch {
      setAiError("Generování se nepovedlo. Zkuste to později.");
    } finally {
      setAiLoading(false);
    }
  }, [period, scope]);

  const submitTeamSummaryFeedback = useCallback(
    async (verdict: AiFeedbackVerdict, actionTaken: AiFeedbackActionTaken) => {
      if (!aiGenerationId) return;
      setAiFeedbackSaving(true);
      setAiError(null);
      try {
        const result = await submitAiFeedbackAction(aiGenerationId, verdict, { actionTaken });
        if (result.ok) setAiFeedbackSubmitted(true);
        else setAiError(result.error ?? "Odeslání zpětné vazby se nepovedlo.");
      } catch {
        setAiError("Odeslání zpětné vazby se nepovedlo.");
      } finally {
        setAiFeedbackSaving(false);
      }
    },
    [aiGenerationId]
  );

  const createTeamFollowUp = useCallback(
    async (actionType: AiActionType, title: string, memberId: string | null, dueAt?: string) => {
      if (!aiGenerationId || actionType === "deal") return;
      setTeamActionSaving(true);
      setTeamActionError(null);
      try {
        const result = await createTeamActionFromAi(
          {
            sourceGenerationId: aiGenerationId,
            sourcePromptType: "teamSummary",
            actionType,
            title: title.trim(),
            dueAt: dueAt || undefined,
          },
          teamId,
          memberId,
          {
            sourceSurface: "portal_team",
            idempotencyKey: `${aiGenerationId}:${actionType}:${title.trim().toLowerCase()}:${memberId ?? "self"}`,
          }
        );
        if (result.ok) {
          setTeamActionError(null);
          if (result.entityType === "event") window.location.href = "/portal/calendar";
          else window.location.href = "/portal/tasks";
        } else {
          setTeamActionError(result.error ?? "Vytvoření akce se nepovedlo.");
        }
      } catch {
        setTeamActionError("Vytvoření akce se nepovedlo.");
      } finally {
        setTeamActionSaving(false);
      }
    },
    [aiGenerationId, teamId]
  );

  useEffect(() => {
    loadLatestTeamSummary();
  }, [loadLatestTeamSummary]);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const metricsByUser = new Map(metrics.map((m) => [m.userId, m]));
  const displayName = (m: TeamMemberInfo) => m.displayName || "Člen týmu";
  const newcomerSet = new Set(newcomers.map((n) => n.userId));

  const memberDetailHref = useCallback(
    (userId: string) => `/portal/team-overview/${userId}?period=${encodeURIComponent(period)}`,
    [period]
  );

  const careerTeamSummary = useMemo(() => {
    const byUser = new Map(metrics.map((m) => [m.userId, m]));
    const nu = new Set(newcomers.map((n) => n.userId));
    const rows = members
      .map((m) => {
        const met = byUser.get(m.userId);
        if (!met) return null;
        return {
          userId: m.userId,
          displayName: m.displayName,
          email: m.email,
          careerEvaluation: met.careerEvaluation,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);
    return buildTeamCareerSummaryBlock(rows, nu);
  }, [members, metrics, newcomers]);

  const coachingAttention = useMemo(() => {
    if (scope === "me") return [];
    const newcomerByUser = new Map(newcomers.map((n) => [n.userId, n]));
    const rows = members
      .map((m) => {
        const met = metricsByUser.get(m.userId);
        if (!met) return null;
        const n = newcomerByUser.get(m.userId);
        return {
          userId: m.userId,
          displayName: m.displayName,
          email: m.email,
          careerEvaluation: met.careerEvaluation,
          metrics: {
            meetingsThisPeriod: met.meetingsThisPeriod,
            unitsThisPeriod: met.unitsThisPeriod,
            activityCount: met.activityCount,
            daysWithoutActivity: met.daysWithoutActivity,
            directReportsCount: met.directReportsCount,
          },
          adaptation: n
            ? {
                adaptationStatus: n.adaptationStatus,
                daysInTeam: n.daysInTeam,
                adaptationScore: n.adaptationScore,
                warnings: n.warnings,
                incompleteChecklistLabels: n.checklist.filter((c) => !c.completed).map((c) => c.label),
              }
            : null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);
    return buildTeamCoachingAttentionList(rows, 5);
  }, [members, metrics, newcomers, scope]);

  const rhythmComputed = useMemo(
    () => computeTeamRhythmView(rhythmCalendar, members, metrics, newcomers, coachingAttention),
    [rhythmCalendar, members, metrics, newcomers, coachingAttention]
  );

  const openTeamEventModal = useCallback((prefill?: TeamCalendarModalPrefill | null) => {
    setCalendarPrefill(prefill ?? null);
    setTeamCalendarModal("event");
  }, []);

  const openTeamTaskModal = useCallback((prefill?: TeamCalendarModalPrefill | null) => {
    setCalendarPrefill(prefill ?? null);
    setTeamCalendarModal("task");
  }, []);

  const resolveRhythmMemberLabel = useCallback(
    (userId: string) => {
      const m = members.find((x) => x.userId === userId);
      return m ? displayName(m) : "Člen týmu";
    },
    [members]
  );

  const scopeOptions: { value: TeamOverviewScope; label: string }[] =
    currentRole === "Advisor" || currentRole === "Viewer"
      ? [{ value: "me", label: "Já" }]
      : currentRole === "Manager"
        ? [
            { value: "me", label: "Já" },
            { value: "my_team", label: "Můj tým" },
          ]
        : [
            { value: "me", label: "Já" },
            { value: "my_team", label: "Můj tým" },
            { value: "full", label: "Celá struktura" },
          ];

  const sortedMembers = [...members].sort((a, b) => {
    const ma = metricsByUser.get(a.userId);
    const mb = metricsByUser.get(b.userId);
    const byPerf = (mb?.productionThisPeriod ?? 0) - (ma?.productionThisPeriod ?? 0);
    if (performanceFilter === "top") return byPerf;
    if (performanceFilter === "bottom") return -byPerf;
    return (a.displayName || "").localeCompare(b.displayName || "", "cs-CZ");
  });
  const visibleMembers = sortedMembers.filter((m) => {
    const mm = metricsByUser.get(m.userId);
    if (!mm) return true;
    if (roleFilter !== "all" && m.roleName !== roleFilter) return false;
    if (riskOnly && mm.riskLevel === "ok") return false;
    if (onboardingOnly && !newcomerSet.has(m.userId)) return false;
    return true;
  });
  const rankedMetrics = [...metrics].sort((a, b) => b.productionThisPeriod - a.productionThisPeriod);
  const topMetric = rankedMetrics[0] ?? null;
  const bottomMetric = rankedMetrics.length > 0 ? rankedMetrics[rankedMetrics.length - 1] : null;

  const attentionCount = kpis?.riskyMemberCount ?? new Set(alerts.map((a) => a.memberId)).size;
  const topAttentionAlerts = alerts.slice(0, 5);
  const briefingHeadline = scope === "me" ? "Váš přehled" : "Přehled týmu";
  const briefingLead =
    scope === "me"
      ? "Váš kariérní kontext, metriky a doporučení na jednom místě — podklad pro rozhovor s vedením nebo vlastní plán."
      : attentionCount > 0
        ? `${attentionCount} ${attentionCount === 1 ? "člověk" : "lidí"} v tomto rozsahu má signály k pozornosti (CRM i kariéra), na které stojí za to reagovat — podpora, ne kontrola.`
        : newcomers.length > 0
          ? `${newcomers.length} ${newcomers.length === 1 ? "nováček potřebuje" : "nováčci potřebují"} hlavně klidný rytmus a krátké check-iny — adaptace je investice do týmu.`
          : "V tomto rozsahu neevidujeme naléhavé signály. Udržujte pravidelný kontakt, rytmus 1:1 a prostor pro růst.";

  const valueFramingLine =
    scope === "me"
      ? "Jeden přehled místo lovu dat v tabulkách — vhodné pro osobní plánování a přípravu na 1:1."
      : "Komu pomoct, kdo roste, kde doplnit data a co naplánovat — bez dalšího „reporting wall“. Doporučení vycházejí z kariéry, adaptace a signálů z CRM.";

  const weeklySnapshotLine =
    scope !== "me" && kpis
      ? `Tento týden: ${kpis.meetingsThisWeek} schůzek v CRM (tento rozsah) · období ${kpis.periodLabel}.`
      : scope === "me" && kpis
        ? `Období ${kpis.periodLabel}: ${kpis.unitsThisPeriod} jednotek · produkce ${formatNumber(kpis.productionThisPeriod)}.`
        : null;

  return (
    <div className="min-h-screen bg-[var(--wp-bg)]">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 py-6 md:py-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-5 md:mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[color:var(--wp-text)]">Přehled týmu</h1>
            <p className="mt-1 text-sm text-[color:var(--wp-text-secondary)] max-w-xl">
              Prémiový nástroj pro vedení: pozornost, růst, adaptace a rytmus — ne jen čísla z CRM.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/portal/setup?tab=tym"
              className="inline-flex items-center gap-2 min-h-[44px] rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-indigo-800 hover:bg-indigo-100 transition-colors"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              Pozvat člena
            </Link>
            <div id="team-calendar-actions" className="flex flex-wrap gap-2">
              <TeamCalendarButtons
                canCreate={canCreateTeamCalendar}
                onOpenEvent={() => openTeamEventModal(null)}
                onOpenTask={() => openTeamTaskModal(null)}
              />
            </div>
            <CustomDropdown
              value={scope}
              onChange={(id) => setScope(id as TeamOverviewScope)}
              options={scopeOptions.map((o) => ({ id: o.value, label: o.label }))}
              placeholder="Rozsah"
              icon={Users}
            />
            <CustomDropdown
              value={period}
              onChange={(id) => setPeriod(id as TeamOverviewPeriod)}
              options={PERIOD_OPTIONS.map((o) => ({ id: o.value, label: o.label }))}
              placeholder="Období"
              icon={Calendar}
            />
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 py-2 text-sm font-medium text-[color:var(--wp-text-secondary)] shadow-sm hover:bg-[color:var(--wp-surface-muted)] disabled:opacity-60"
              aria-label="Obnovit data"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {kpis && scope !== "me" && !kpis.hierarchyParentLinksConfigured ? (
          <div
            className="mb-5 rounded-2xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 shadow-sm sm:px-5"
            role="status"
          >
            <p className="font-semibold text-amber-950">Hierarchie týmu není zatím kompletně nastavena.</p>
            <p className="mt-1.5 text-xs leading-relaxed text-amber-900/95 sm:text-sm">
              V tenantu nejsou vyplněné vazby nadřízenosti (parent_id). Rozsah „Můj tým“ zobrazí jen vás, dokud se vazby nedoplní — jde o ochranu rozsahu, ne o prázdný tým. Rozsah „Celá struktura“ může zobrazit všechny členy jako samostatné kořeny; po doplnění nadřízených se strom srovná.
            </p>
          </div>
        ) : null}

        {/* 1. Manažerský briefing — first fold */}
        <section
          className="mb-8 rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50/95 via-[color:var(--wp-surface-card)] to-indigo-50/30 p-5 sm:p-7 shadow-sm ring-1 ring-slate-900/[0.04]"
          aria-labelledby="team-briefing-heading"
        >
          <div className="mb-6 max-w-3xl">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-indigo-700/85">Tento týden v týmu</p>
            <h2 id="team-briefing-heading" className="text-2xl font-bold tracking-tight text-[color:var(--wp-text)] sm:text-3xl">
              {briefingHeadline}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--wp-text-secondary)]">{briefingLead}</p>
            <p className="mt-3 border-l-2 border-indigo-200 pl-3 text-xs leading-relaxed text-[color:var(--wp-text-tertiary)]">{valueFramingLine}</p>
          </div>
          {kpis ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 py-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">
                  {scope === "me" ? "V rozsahu" : "Lidé v rozsahu"}
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-[color:var(--wp-text)]">{kpis.memberCount}</p>
                <p className="mt-1 text-xs text-[color:var(--wp-text-tertiary)]">
                  {scope === "full" ? "Celá struktura" : scope === "my_team" ? "Můj tým" : "Osobní"}
                </p>
              </div>
              <div
                className={clsx(
                  "rounded-xl border px-4 py-4 shadow-sm",
                  attentionCount > 0
                    ? "border-amber-200/80 bg-amber-50/60"
                    : "border-emerald-200/70 bg-emerald-50/40"
                )}
              >
                <p
                  className={clsx(
                    "text-[11px] font-bold uppercase tracking-wider",
                    attentionCount > 0 ? "text-amber-900/85" : "text-emerald-900/80"
                  )}
                >
                  Vyžaduje pozornost
                </p>
                <p
                  className={clsx(
                    "mt-1 text-3xl font-bold tabular-nums",
                    attentionCount > 0 ? "text-amber-950" : "text-emerald-900"
                  )}
                >
                  {attentionCount}
                </p>
                <p className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">
                  {attentionCount > 0 ? "CRM i kariéra — krátká reakce pomůže" : "Žádné naléhavé signály v tomto rozsahu"}
                </p>
              </div>
              <div className="rounded-xl border border-blue-200/70 bg-blue-50/50 px-4 py-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wider text-blue-900/80">V adaptaci</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-blue-950">{kpis.newcomersInAdaptation}</p>
                <p className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">Nováčci v okně adaptace</p>
              </div>
            </div>
          ) : loading ? (
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <SkeletonBlock key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : null}
          {weeklySnapshotLine ? (
            <p className="mt-5 text-sm text-[color:var(--wp-text-secondary)] border-t border-[color:var(--wp-surface-card-border)]/70 pt-4">
              {weeklySnapshotLine}
            </p>
          ) : null}
        </section>

        {/* 2. Co vyžaduje pozornost + doporučené navázání */}
        {scope !== "me" ? (
          <section className="mb-8" aria-labelledby="team-priority-heading">
            <div className="mb-4">
              <h2 id="team-priority-heading" className="text-lg font-bold text-[color:var(--wp-text)] sm:text-xl">
                Co vyžaduje pozornost a doporučené navázání
              </h2>
              <p className="mt-1 max-w-2xl text-xs text-[color:var(--wp-text-secondary)] sm:text-sm">
                Signály z CRM a doporučení z kariérní vrstvy — orientační návrh dalšího kroku, ne hodnocení lidí.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="flex flex-col rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-sm sm:p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[color:var(--wp-text)]">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                  Signály (CRM a kariéra)
                </h3>
                {topAttentionAlerts.length === 0 ? (
                  <div className="flex flex-1 flex-col justify-center rounded-xl border border-emerald-200/60 bg-emerald-50/35 px-4 py-5">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600" aria-hidden />
                      <div>
                        <p className="font-semibold text-emerald-900">V mezích</p>
                        <p className="mt-1 text-sm leading-relaxed text-emerald-900/85">
                          Žádné naléhavé signály pro tento rozsah. Udržujte klidný rytmus kontaktu — sekce níže ukáže růst, adaptaci a naplánované termíny.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {topAttentionAlerts.map((a, i) => {
                      const alertMember = members.find((m) => m.userId === a.memberId);
                      const name = alertMember ? displayName(alertMember) : "Člen týmu";
                      const tone =
                        a.severity === "critical" ? ("Vyžaduje podporu" as const) : ("Potřebuje pozornost" as const);
                      return (
                        <li key={`${a.memberId}-${i}`}>
                          <Link
                            href={memberDetailHref(a.memberId)}
                            className="block rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/35 px-3 py-2.5 transition hover:border-indigo-200 hover:bg-indigo-50/40"
                          >
                            <span className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-tertiary)]">
                              {tone}
                            </span>
                            <p className="mt-0.5 text-sm font-medium text-[color:var(--wp-text)]">{name}</p>
                            <p className="line-clamp-2 text-xs text-[color:var(--wp-text-secondary)]">{a.title}</p>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="flex flex-col rounded-2xl border border-violet-200/60 bg-gradient-to-b from-violet-50/40 to-[color:var(--wp-surface-card)] p-4 shadow-sm sm:p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[color:var(--wp-text)]">
                  <HeartHandshake className="h-4 w-4 shrink-0 text-violet-600" />
                  Doporučené navázání (kariéra &amp; coaching)
                </h3>
                {coachingAttention.length === 0 ? (
                  <div className="flex flex-1 flex-col justify-center rounded-xl border border-slate-200/80 bg-[color:var(--wp-surface-card)]/80 px-4 py-5">
                    <p className="font-semibold text-[color:var(--wp-text)]">Žádný výrazný návrh navíc</p>
                    <p className="mt-1 text-sm leading-relaxed text-[color:var(--wp-text-secondary)]">
                      Podle kariérní vrstvy a adaptace zatím nikdo nevyčnívá v prioritním seznamu — pokračujte v pravidelných 1:1 a sledujte blok „Kariérní přehled“ níže.
                    </p>
                  </div>
                ) : (
                  <>
                    <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                      {coachingAttention.map((c) => {
                        const mem = members.find((m) => m.userId === c.userId);
                        const name = mem ? displayName(mem) : c.displayName || c.email || "Člen týmu";
                        return (
                          <li key={c.userId}>
                            <Link
                              href={memberDetailHref(c.userId)}
                              className="block rounded-xl border border-violet-200/50 bg-violet-50/50 px-3 py-2.5 transition hover:bg-violet-50/90"
                            >
                              <p className="text-sm font-medium text-[color:var(--wp-text)]">{name}</p>
                              <p className="mt-0.5 text-[11px] text-[color:var(--wp-text-secondary)]">{c.reasonCs}</p>
                              <p className="mt-1 text-[11px] font-semibold text-violet-900">{c.recommendedActionLabelCs}</p>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                    {canCreateTeamCalendar ? (
                      <a
                        href="#team-calendar-actions"
                        className="mt-3 inline-flex text-xs font-medium text-indigo-600 hover:underline"
                      >
                        Naplánovat týmovou schůzku nebo úkol — akce v záhlaví
                      </a>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="mb-8 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm" aria-labelledby="self-priority-heading">
            <h2 id="self-priority-heading" className="text-lg font-bold text-[color:var(--wp-text)]">
              Váš kontext
            </h2>
            <p className="mt-2 text-sm text-[color:var(--wp-text-secondary)]">
              V režimu „Já“ jsou priorita a coaching u jednotlivých členů v detailu osoby. Níže najdete kariérní přehled, metriky a trendy.
            </p>
          </section>
        )}

        {members.length > 0 && (
          <section
            className="mb-8 rounded-2xl border border-violet-200/60 bg-gradient-to-br from-violet-50/45 via-[color:var(--wp-surface-card)] to-[color:var(--wp-surface-card)] p-5 shadow-sm ring-1 ring-violet-900/[0.04] sm:p-6"
            aria-labelledby="team-career-growth-heading"
          >
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-3xl">
                <h2 id="team-career-growth-heading" className="flex items-center gap-2 text-lg font-bold text-[color:var(--wp-text)] sm:text-xl">
                  <Briefcase className="h-5 w-5 shrink-0 text-violet-600" />
                  Růst a adaptace — kariérní přehled
                </h2>
                <p className="mt-1 text-xs text-[color:var(--wp-text-secondary)] sm:text-sm">
                  Kde tým roste, kde chybí data a kdo je v adaptaci. Orientační pohled z údajů v aplikaci a CRM — ne oficiální splnění řádu (BJ, licence). Chybějící údaje bereme jako příležitost doplnit v Nastavení → Tým.
                </p>
              </div>
              <Link
                href="/portal/setup?tab=tym"
                className="text-xs font-semibold text-violet-700 hover:text-violet-900 hover:underline"
              >
                Doplnit kariérní údaje
              </Link>
            </div>
            <div className="grid gap-4 lg:grid-cols-12">
              <div className="lg:col-span-4 space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Podle větve</p>
                <ul className="space-y-1.5 text-sm">
                  {careerTeamSummary.byTrack.length === 0 ? (
                    <li className="text-[color:var(--wp-text-secondary)]">
                      Zatím bez rozlišených větví — doplněním údajů zpřesníte doporučení (Nastavení → Tým).
                    </li>
                  ) : (
                    careerTeamSummary.byTrack.map((t) => (
                      <li key={t.trackId} className="flex justify-between gap-2 text-[color:var(--wp-text)]">
                        <span className="text-[color:var(--wp-text-secondary)] truncate">{t.label}</span>
                        <span className="font-semibold tabular-nums shrink-0">{t.count}</span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div className="lg:col-span-4 space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)]">Stav podle přehledu</p>
                <ul className="space-y-1.5 text-sm">
                  {(
                    [
                      "Na dobré cestě",
                      "Vyžaduje doplnění",
                      "Částečně vyhodnoceno",
                      "Potřebuje pozornost",
                      "Bez dostatku dat",
                    ] as const
                  ).map((label) => {
                    const c = careerTeamSummary.byManagerLabel[label] ?? 0;
                    if (c === 0) return null;
                    return (
                      <li key={label} className="flex justify-between gap-2">
                        <span className="text-[color:var(--wp-text-secondary)]">{label}</span>
                        <span className="font-semibold tabular-nums">{c}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/40 px-3 py-2 text-xs text-[color:var(--wp-text-secondary)] space-y-1">
                  <p>
                    <span className="font-semibold text-[color:var(--wp-text)]">Chybí data / doplnění:</span>{" "}
                    {careerTeamSummary.needsAttentionDataCount}{" "}
                    {careerTeamSummary.needsAttentionDataCount === 1 ? "osoba" : "lidí"}
                  </p>
                  <p>
                    <span className="font-semibold text-[color:var(--wp-text)]">Částečná nebo ruční část evaluace:</span>{" "}
                    {careerTeamSummary.manualOrPartialCount}
                  </p>
                  <p>
                    <span className="font-semibold text-[color:var(--wp-text)]">Start + adaptace:</span>{" "}
                    {careerTeamSummary.startersInAdaptationCount}{" "}
                    {careerTeamSummary.startersInAdaptationCount === 1 ? "osoba" : "lidí"} na prvním kroku větve a v adaptačním okně
                  </p>
                </div>
              </div>
              <div className="lg:col-span-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] mb-2">
                  Doporučené 1:1 (kariéra)
                </p>
                {careerTeamSummary.topAttention.length === 0 ? (
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-3 text-sm text-[color:var(--wp-text-secondary)]">
                    <p className="font-medium text-[color:var(--wp-text)]">Vyrovnaný přehled</p>
                    <p className="mt-1 text-xs leading-relaxed">
                      Z kariérního pohledu nikdo zásadně nevyčnívá — u malého týmu je to běžné. Udržujte pravidelný kontakt a sledujte signály výše.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {careerTeamSummary.topAttention.map((x) => {
                      const mem = members.find((m) => m.userId === x.userId);
                      const name = mem ? displayName(mem) : x.displayName || x.email || "Člen týmu";
                      return (
                        <li key={x.userId}>
                          <Link
                            href={memberDetailHref(x.userId)}
                            className="block rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-2 hover:border-violet-200 hover:bg-violet-50/30 transition"
                          >
                            <p className="font-medium text-sm text-[color:var(--wp-text)]">{name}</p>
                            <p className="text-[11px] text-violet-800/90 font-medium">{x.managerProgressLabel}</p>
                            <p className="text-xs text-[color:var(--wp-text-secondary)] mt-0.5 line-clamp-2">{x.reason}</p>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {careerTeamSummary.byTrack.length === 0 && members.length > 0 ? (
              <div className="mt-5 rounded-xl border border-amber-200/60 bg-amber-50/35 px-4 py-3 text-sm text-amber-950/90">
                <span className="font-semibold">Příležitost doplnit data:</span> bez vyplněných kariérních větví zůstávají souhrny obecnější. Údaje doplníte v Nastavení → Tým.
              </div>
            ) : null}

            <div className="mt-8 border-t border-[color:var(--wp-surface-card-border)]/80 pt-6" aria-labelledby="team-newcomers-inline-heading">
              <h3 id="team-newcomers-inline-heading" className="text-sm font-bold text-[color:var(--wp-text)]">
                Adaptace nováčků
              </h3>
              <p className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">
                Rozjezd v roli — stručný stav checklistu a signály z CRM.
              </p>
              {newcomers.length === 0 ? (
                <div className="mt-4 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/30 px-4 py-5 text-center text-sm text-[color:var(--wp-text-secondary)]">
                  <p className="font-medium text-[color:var(--wp-text)]">Žádní nováčci v adaptačním okně</p>
                  <p className="mt-1 text-xs leading-relaxed">
                    Jakmile někdo nový přistoupí do týmu, objeví se tady s checklistem — ideální podklad na krátký check-in.
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {newcomers.map((n) => {
                    const member = members.find((m) => m.userId === n.userId);
                    const name = member ? displayName(member) : "Člen týmu";
                    return (
                      <Link
                        key={n.userId}
                        href={memberDetailHref(n.userId)}
                        className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-[color:var(--wp-text)]">{name}</p>
                            <p className="text-xs text-[color:var(--wp-text-secondary)]">
                              {n.daysInTeam} dní v týmu · {n.adaptationStatus}
                            </p>
                          </div>
                          <div className="rounded-full bg-[color:var(--wp-surface-muted)] px-2 py-0.5 text-xs font-bold text-[color:var(--wp-text-secondary)]">
                            {n.adaptationScore} %
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1">
                          {n.checklist.map((s) => (
                            <span
                              key={s.key}
                              className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                                s.completed ? "bg-emerald-100 text-emerald-600" : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-tertiary)]"
                              }`}
                              title={s.label}
                            >
                              {s.completed ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            </span>
                          ))}
                        </div>
                        {n.warnings.length > 0 && <p className="mt-2 text-xs text-amber-600">{n.warnings.join(" · ")}</p>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        <TeamRhythmPanel
          computed={rhythmComputed}
          disclaimer={
            rhythmCalendar?.disclaimerCs ??
            "Týmové položky pocházejí z team_events / team_tasks a jsou filtrované podle rozsahu přehledu."
          }
          scope={scope}
          canCreate={canCreateTeamCalendar}
          memberDetailHref={memberDetailHref}
          resolveMemberLabel={resolveRhythmMemberLabel}
          onOpenEvent={openTeamEventModal}
          onOpenTask={openTeamTaskModal}
        />

        <TeamStructurePanel
          roots={hierarchy}
          currentUserId={currentUserId}
          scope={scope}
          memberDetailQuery={`?period=${encodeURIComponent(period)}`}
          hierarchyParentLinksConfigured={kpis?.hierarchyParentLinksConfigured !== false}
        />

        <div className="mb-6 border-t border-slate-200/70 pt-8">
          <h2 className="text-lg font-bold text-[color:var(--wp-text)]">Lidé a metriky v detailu</h2>
          <p className="mt-1 max-w-2xl text-xs text-[color:var(--wp-text-secondary)] sm:text-sm">
            Tabulka a filtry až po prioritách výše — pro hlubší pohled na jednotlivce otevřete detail.
          </p>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <CustomDropdown
            value={roleFilter}
            onChange={(id) => setRoleFilter(id as "all" | "Advisor" | "Manager" | "Director")}
            options={[
              { id: "all", label: "Všechny role" },
              { id: "Director", label: "Ředitelé" },
              { id: "Manager", label: "Manažeři" },
              { id: "Advisor", label: "Poradci" },
            ]}
            placeholder="Role"
            icon={Filter}
          />
          <CustomDropdown
            value={performanceFilter}
            onChange={(id) => setPerformanceFilter(id as "all" | "top" | "bottom")}
            options={[
              { id: "all", label: "Všichni výkon" },
              { id: "top", label: "Nejsilnější výkon" },
              { id: "bottom", label: "Podpora ve výkonu" },
            ]}
            placeholder="Výkon"
            icon={BarChart3}
          />
          <button
            type="button"
            onClick={() => setRiskOnly((v) => !v)}
            className={`min-h-[44px] rounded-xl border px-3 py-2 text-sm ${riskOnly ? "border-amber-300 bg-amber-50 text-amber-700" : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)]"}`}
          >
            Vyžaduje pozornost
          </button>
          <button
            type="button"
            onClick={() => setOnboardingOnly((v) => !v)}
            className={`min-h-[44px] rounded-xl border px-3 py-2 text-sm ${onboardingOnly ? "border-blue-300 bg-blue-50 text-blue-700" : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)]"}`}
          >
            V adaptaci
          </button>
        </div>

        <TeamCalendarModal
          open={teamCalendarModal != null}
          type={teamCalendarModal}
          onClose={() => {
            setTeamCalendarModal(null);
            setCalendarPrefill(null);
          }}
          members={members}
          metrics={metrics}
          newcomers={newcomers}
          onSuccess={refresh}
          prefill={calendarPrefill}
        />

        {/* Seznam členů */}
        <section id="clenove">
          <h2 className="text-lg font-bold text-[color:var(--wp-text)] mb-1">Tabulka členů</h2>
          <p className="mb-3 text-xs text-[color:var(--wp-text-secondary)] sm:text-sm">
            Metriky a kariérní štítky — otevřete řádek pro detail, 1:1 agendu a coaching.
          </p>
          <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-[color:var(--wp-surface-card-border)]">
                <thead>
                  <tr className="bg-[color:var(--wp-surface-muted)]/80">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Člen</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Jednotky</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Produkce</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Schůzky</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Konverze</th>
                    {scope === "full" && (
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Nadřízený</th>
                    )}
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Aktivita</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[color:var(--wp-text-secondary)]">Stav</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--wp-surface-card-border)]">
                  {visibleMembers.map((m) => {
                    const met = metricsByUser.get(m.userId);
                    const ce = met?.careerEvaluation;
                    return (
                      <tr key={m.userId} className="hover:bg-[color:var(--wp-surface-muted)]/50">
                        <td className="px-4 py-3">
                          <Link href={memberDetailHref(m.userId)} className="font-medium text-[color:var(--wp-text)] hover:underline">
                            {displayName(m)}
                          </Link>
                          <p className="text-xs text-[color:var(--wp-text-secondary)]">{m.roleName}{m.email ? ` · ${m.email}` : ""}</p>
                          {ce?.summaryLine ? (
                            <p className="text-[11px] text-[color:var(--wp-text-tertiary)] mt-0.5">{ce.summaryLine}</p>
                          ) : null}
                          {ce ? (
                            <div className="mt-1 space-y-0.5 max-w-[16rem]">
                              <p className="text-[10px] font-medium text-violet-900/85">{ce.managerProgressLabel}</p>
                              <div className="flex flex-wrap gap-1">
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${overviewCareerProgressBadgeClass(ce.progressEvaluation)}`}
                                  title="Technický stav evaluace (orientační)"
                                >
                                  {careerProgressShortLabel(ce.progressEvaluation)}
                                </span>
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${overviewCareerCompletenessBadgeClass(ce.evaluationCompleteness)}`}
                                  title="Úplnost automatické části evaluace"
                                >
                                  {careerCompletenessShortLabel(ce.evaluationCompleteness)}
                                </span>
                              </div>
                              <p className="text-[10px] leading-snug text-[color:var(--wp-text-secondary)]">{ce.hintShort}</p>
                              {ce.nextCareerPositionLabel ? (
                                <p className="text-[10px] text-[color:var(--wp-text-tertiary)]">
                                  Další krok: {ce.nextCareerPositionLabel}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-[color:var(--wp-text-secondary)]">{met?.unitsThisPeriod ?? "—"}</td>
                        <td className="px-4 py-3 text-right text-sm text-[color:var(--wp-text-secondary)]">{met ? formatNumber(met.productionThisPeriod) : "—"}</td>
                        <td className="px-4 py-3 text-right text-sm text-[color:var(--wp-text-secondary)]">{met?.meetingsThisPeriod ?? "—"}</td>
                        <td className="px-4 py-3 text-right text-sm text-[color:var(--wp-text-secondary)]">{met ? `${Math.round(met.conversionRate * 100)}%` : "—"}</td>
                        {scope === "full" && (
                          <td className="px-4 py-3 text-right text-sm text-[color:var(--wp-text-secondary)]">{m.managerName ?? "—"}</td>
                        )}
                        <td className="px-4 py-3 text-right text-sm text-[color:var(--wp-text-secondary)]">{met?.activityCount ?? "—"}</td>
                        <td className="px-4 py-3 text-right">
                          {met && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              met.riskLevel === "critical" ? "bg-rose-100 text-rose-700" :
                              met.riskLevel === "warning" ? "bg-amber-100 text-amber-700" :
                              "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]"
                            }`}>
                              {met.riskLevel === "critical" ? "Vyžaduje podporu" : met.riskLevel === "warning" ? "Potřebuje pozornost" : "Stabilní"}
                            </span>
                          )}
                        </td>
                        <td>
                          <Link href={memberDetailHref(m.userId)} className="inline-flex p-2 text-[color:var(--wp-text-tertiary)] hover:text-indigo-600" aria-label="Detail">
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-[color:var(--wp-surface-card-border)]">
              {visibleMembers.map((m) => {
                const met = metricsByUser.get(m.userId);
                const ce = met?.careerEvaluation;
                return (
                  <Link key={m.userId} href={memberDetailHref(m.userId)} className="relative block p-4 hover:bg-[color:var(--wp-surface-muted)]/50 active:bg-[color:var(--wp-surface-muted)]">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-[color:var(--wp-text)]">{displayName(m)}</p>
                        <p className="text-xs text-[color:var(--wp-text-secondary)]">{m.roleName}{m.email ? ` · ${m.email}` : ""}</p>
                        {ce?.summaryLine ? (
                          <p className="text-[11px] text-[color:var(--wp-text-tertiary)] mt-0.5">{ce.summaryLine}</p>
                        ) : null}
                        {ce ? (
                          <div className="mt-1 space-y-0.5">
                            <p className="text-[10px] font-medium text-violet-900/85">{ce.managerProgressLabel}</p>
                            <div className="flex flex-wrap gap-1">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${overviewCareerProgressBadgeClass(ce.progressEvaluation)}`}
                              >
                                {careerProgressShortLabel(ce.progressEvaluation)}
                              </span>
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${overviewCareerCompletenessBadgeClass(ce.evaluationCompleteness)}`}
                              >
                                {careerCompletenessShortLabel(ce.evaluationCompleteness)}
                              </span>
                            </div>
                            <p className="text-[10px] text-[color:var(--wp-text-secondary)]">{ce.hintShort}</p>
                            {ce.nextCareerPositionLabel ? (
                              <p className="text-[10px] text-[color:var(--wp-text-tertiary)]">Další krok: {ce.nextCareerPositionLabel}</p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        met?.riskLevel === "critical" ? "bg-rose-100 text-rose-700" :
                        met?.riskLevel === "warning" ? "bg-amber-100 text-amber-700" :
                        "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]"
                      }`}>
                        {met?.riskLevel === "critical" ? "Vyžaduje podporu" : met?.riskLevel === "warning" ? "Potřebuje pozornost" : "Stabilní"}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-[color:var(--wp-text-secondary)]">
                      <span>Jednotky: {met?.unitsThisPeriod ?? "—"}</span>
                      <span>Produkce: {met ? formatNumber(met.productionThisPeriod) : "—"}</span>
                      <span>Schůzky: {met?.meetingsThisPeriod ?? "—"}</span>
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">
                      Konverze: {met ? `${Math.round(met.conversionRate * 100)} %` : "—"}
                      {m.managerName ? ` · Nadřízený: ${m.managerName}` : ""}
                    </div>
                    <ChevronRight className="w-4 h-4 text-[color:var(--wp-text-tertiary)] absolute right-2 top-1/2 -translate-y-1/2" />
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mb-10 border-t border-slate-200/60 pt-8" aria-labelledby="team-kpi-detail-heading">
          <h2 id="team-kpi-detail-heading" className="text-lg font-bold text-[color:var(--wp-text)]">
            CRM metriky — doplňující přehled
          </h2>
          <p className="mt-1 mb-4 max-w-2xl text-xs text-[color:var(--wp-text-secondary)] sm:text-sm">
            Po prioritách výše: čísla z CRM za zvolené období — pro srovnání a kontext, ne jako jediný úsudek o týmu.
          </p>
          {loading && !kpis ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <SkeletonBlock key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : kpis ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="#clenove" className="group rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm transition hover:shadow-md hover:border-[color:var(--wp-surface-card-border)]">
                <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.blue.bg}`}>
                  <Users className={`w-5 h-5 ${KPI_THEMES.blue.subtitle}`} />
                </div>
                <p className="mt-2 text-2xl font-bold text-[color:var(--wp-text)]">{kpis.memberCount}</p>
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Členové týmu</p>
              </Link>
              <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm">
                <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.green.bg}`}>
                  <TrendingUp className={`w-5 h-5 ${KPI_THEMES.green.subtitle}`} />
                </div>
                <p className="mt-2 text-2xl font-bold text-[color:var(--wp-text)]">{kpis.unitsThisPeriod}</p>
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Jednotky ({kpis.periodLabel})</p>
                <div className="mt-1"><TrendIndicator trend={kpis.unitsTrend} /></div>
              </div>
              <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm">
                <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.purple.bg}`}>
                  <TrendingUp className={`w-5 h-5 ${KPI_THEMES.purple.subtitle}`} />
                </div>
                <p className="mt-2 text-2xl font-bold text-[color:var(--wp-text)]">{formatNumber(kpis.productionThisPeriod)}</p>
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Produkce ({kpis.periodLabel})</p>
                <div className="mt-1"><TrendIndicator trend={Math.round(kpis.productionTrend)} /></div>
              </div>
              <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm">
                <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.green.bg}`}>
                  <Calendar className={`w-5 h-5 ${KPI_THEMES.green.subtitle}`} />
                </div>
                <p className="mt-2 text-2xl font-bold text-[color:var(--wp-text)]">{kpis.meetingsThisWeek}</p>
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Schůzky tento týden</p>
              </div>
              <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm">
                <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.amber.bg}`}>
                  <UserPlus className={`w-5 h-5 ${KPI_THEMES.amber.subtitle}`} />
                </div>
                <p className="mt-2 text-2xl font-bold text-[color:var(--wp-text)]">{kpis.newcomersInAdaptation}</p>
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Nováčci v adaptaci</p>
              </div>
              <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm">
                <div className={`inline-flex rounded-xl p-2 ${KPI_THEMES.rose.bg}`}>
                  <AlertTriangle className={`w-5 h-5 ${KPI_THEMES.rose.subtitle}`} />
                </div>
                <p className="mt-2 text-2xl font-bold text-[color:var(--wp-text)]">{kpis.riskyMemberCount}</p>
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Vyžaduje pozornost</p>
              </div>
              <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm">
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Hodnota obchodů</p>
                <p className="mt-2 text-2xl font-bold text-[color:var(--wp-text)]">{formatNumber(Math.round(kpis.pipelineValue))}</p>
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Konverze: {Math.round(kpis.conversionRate * 100)} %</p>
              </div>
              <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm">
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Top performer</p>
                <p className="mt-2 text-base font-bold text-[color:var(--wp-text)]">
                  {topMetric ? (members.find((m) => m.userId === topMetric.userId)?.displayName || "Člen týmu") : "—"}
                </p>
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">{topMetric ? formatNumber(topMetric.productionThisPeriod) : "—"}</p>
              </div>
              <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm">
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Podpora ve výkonu</p>
                <p className="mt-2 text-base font-bold text-[color:var(--wp-text)]">
                  {bottomMetric ? (members.find((m) => m.userId === bottomMetric.userId)?.displayName || "Člen týmu") : "—"}
                </p>
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">{bottomMetric ? formatNumber(bottomMetric.productionThisPeriod) : "—"}</p>
              </div>
              {kpis.teamGoalTarget != null && kpis.teamGoalType && (
                <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm">
                  <div className="inline-flex rounded-xl p-2 bg-indigo-500/20">
                    <Target className="w-5 h-5 text-indigo-600" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-[color:var(--wp-text)]">
                    {kpis.teamGoalProgressPercent != null ? `${kpis.teamGoalProgressPercent} %` : "—"}
                  </p>
                  <p className="text-xs font-medium text-[color:var(--wp-text-secondary)]">Splnění týmového cíle</p>
                  <p className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">
                    {kpis.teamGoalActual != null ? formatNumber(kpis.teamGoalActual) : "0"} / {formatNumber(kpis.teamGoalTarget)}
                    {kpis.teamGoalType === "units" && " jednotek"}
                    {kpis.teamGoalType === "production" && " produkce"}
                    {kpis.teamGoalType === "meetings" && " schůzek"}
                  </p>
                  {kpis.teamGoalProgressPercent != null && (
                    <div className="mt-2 h-1.5 w-full rounded-full bg-[color:var(--wp-surface-muted)] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${Math.min(kpis.teamGoalProgressPercent, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </section>

        {/* Trend výkonu */}
        {performanceOverTime.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-bold text-[color:var(--wp-text)] mb-1">Trend výkonu (CRM)</h2>
            <p className="mb-3 text-xs text-[color:var(--wp-text-secondary)]">Jednotky po obdobích — orientační, vedle lidského přehledu výše.</p>
            <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm">
              <div className="flex gap-2 items-end justify-between h-32" aria-label="Graf jednotek po obdobích">
                {performanceOverTime.map((p, i) => {
                  const maxUnits = Math.max(...performanceOverTime.map((x) => x.units), 1);
                  const heightPct = maxUnits > 0 ? (p.units / maxUnits) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <div className="w-full flex flex-col justify-end h-20 rounded-t bg-[color:var(--wp-surface-muted)] overflow-hidden">
                        <div
                          className="w-full bg-indigo-500 rounded-t transition-all"
                          style={{ height: `${heightPct}%`, minHeight: p.units > 0 ? "4px" : 0 }}
                        />
                      </div>
                      <span className="text-[10px] font-medium text-[color:var(--wp-text-secondary)] truncate w-full text-center" title={p.label}>{p.label}</span>
                      <span className="text-xs font-semibold text-[color:var(--wp-text-secondary)]">{p.units}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* AI shrnutí — doplňkové */}
        <section className="mb-8">
          <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div>
                <h2 className="text-lg font-bold text-[color:var(--wp-text)] flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-violet-500" />
                  Shrnutí týmu (AI)
                </h2>
                <p className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">
                  Volitelný textový podklad z metrik — nenahrazuje vlastní úsudek ani komunikaci s týmem.
                </p>
                <p className="mt-1.5 text-[11px] leading-snug text-[color:var(--wp-text-tertiary)]">
                  Uložené shrnutí nemusí odpovídat aktuálnímu rozsahu a období — po přepnutí v hlavičce znovu vygenerujte.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={loadLatestTeamSummary}
                  disabled={aiLoading}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 py-2 text-sm font-medium text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] disabled:opacity-60"
                >
                  {aiLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                  Načíst uložené
                </button>
                <button
                  type="button"
                  onClick={generateTeamSummary}
                  disabled={aiLoading}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
                >
                  {aiLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                  {aiSummary ? "Regenerovat" : "Generovat shrnutí"}
                </button>
              </div>
            </div>
            <AdvisorAiOutputNotice variant="compact" className="mb-3" />
            {aiError && (
              <p className="mb-3 text-sm text-rose-600" role="alert">{aiError}</p>
            )}
            {aiSummary ? (
              <>
                <p className="text-[color:var(--wp-text-secondary)] whitespace-pre-wrap">{aiSummary}</p>
                {aiGenerationId && !aiFeedbackSubmitted && (
                  <TeamSummaryFeedback
                    onSubmit={submitTeamSummaryFeedback}
                    saving={aiFeedbackSaving}
                    disabled={aiFeedbackSaving}
                  />
                )}
                {aiFeedbackSubmitted && (
                  <p className="mt-3 text-sm text-emerald-600">Zpětná vazba byla odeslána.</p>
                )}
                {aiGenerationId && canCreateAiTeamFollowUp ? (
                  <TeamSummaryFollowUp
                    members={members}
                    onCreate={createTeamFollowUp}
                    saving={teamActionSaving}
                    error={teamActionError}
                  />
                ) : aiGenerationId && !canCreateAiTeamFollowUp ? (
                  <p className="mt-4 pt-4 border-t border-[color:var(--wp-surface-card-border)] text-xs text-[color:var(--wp-text-tertiary)]">
                    Vytváření follow-up úkolů a schůzek z AI zde není pro vaši roli k dispozici.
                  </p>
                ) : null}
              </>
            ) : !aiLoading ? (
              <p className="text-[color:var(--wp-text-secondary)] text-sm">Načtěte uložené shrnutí nebo klikněte na „Generovat shrnutí“ — vznikne informativní manažerský podklad z metrik a upozornění, nikoli rada vůči klientům.</p>
            ) : null}
          </div>
        </section>

        {/* Kompletní výpis signálů (stejné jako v kartách výše) */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-[color:var(--wp-text)] mb-1">Kompletní výpis signálů</h2>
          <p className="mb-3 text-xs text-[color:var(--wp-text-secondary)]">
            CRM i kariérní upozornění — totéž, co v přehledu nahoře; zde celý seznam pro kontrolu nebo tisk.
          </p>
          {alerts.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200/50 bg-emerald-50/30 px-5 py-6 text-center">
              <p className="font-medium text-emerald-900">Žádné další signály</p>
              <p className="mt-1 text-sm text-emerald-900/85">
                V tomto období a rozsahu je výpis prázdný — žádné sledované signály z CRM ani kariéry.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a, i) => (
                <li key={i}>
                  <Link
                    href={memberDetailHref(a.memberId)}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 shadow-sm hover:border-amber-200 hover:bg-amber-50/50 transition"
                  >
                    <span className={`rounded-full p-1 ${a.severity === "critical" ? "bg-rose-100 text-rose-600" : "bg-amber-100 text-amber-600"}`}>
                      <AlertTriangle className="w-4 h-4" />
                    </span>
                    <span className="font-medium text-[color:var(--wp-text)]">{a.title}</span>
                    <span className="text-[color:var(--wp-text-secondary)] text-sm">{a.description}</span>
                    <ChevronRight className="w-4 h-4 text-[color:var(--wp-text-tertiary)] ml-auto" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>
    </div>
  );
}
