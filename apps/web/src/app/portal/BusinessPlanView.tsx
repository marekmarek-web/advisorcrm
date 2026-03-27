"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Target,
  Plus,
  Sparkles,
  TrendingUp,
  Users,
  Calendar,
  ChevronRight,
  BarChart3,
  Trophy,
  Phone,
  Edit2,
  Compass,
  PieChart,
  Flag,
  FileSignature,
  ArrowRight,
  X,
  Save,
  Check,
  UsersRound,
} from "lucide-react";
import type { PeriodType } from "@/lib/business-plan/types";
import {
  getPlanPeriod,
  getCurrentPeriodNumbers,
  computeReverseMath,
  HEALTH_STATUS_LABELS,
} from "@/lib/business-plan/types";
import {
  getActivePlan,
  getPlanWithTargets,
  getPlanProgress,
  listBusinessPlans,
  createBusinessPlan,
  setPlanTargets,
  savePlanManualOverrides,
  getVisionGoals,
  upsertVisionGoals,
  getTeamBusinessPlanSummary,
  type PlanWithTargetsRow,
  type PlanProgressResult,
  type TeamBusinessPlanMemberSummary,
} from "@/app/actions/business-plan";
import clsx from "clsx";
import { SkeletonBlock } from "@/app/components/Skeleton";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";

const PERIOD_OPTIONS: { id: PeriodType; label: string }[] = [
  { id: "month", label: "Měsíc" },
  { id: "quarter", label: "Kvartál" },
  { id: "year", label: "Rok" },
];

const VISION_COLORS = [
  { colorClass: "bg-emerald-400", textClass: "text-emerald-400" },
  { colorClass: "bg-amber-400", textClass: "text-amber-400" },
  { colorClass: "bg-blue-400", textClass: "text-blue-400" },
] as const;
function visionRowToGoal(row: { id: string; title: string; progressPct: number }, index: number): VisionGoal {
  const c = VISION_COLORS[index % VISION_COLORS.length];
  return {
    id: row.id,
    title: row.title,
    progress: row.progressPct,
    colorClass: c.colorClass,
    textClass: c.textClass,
  };
}

const MIX_COLORS = [
  { label: "Investice", color: "#10b981" },
  { label: "Penze (DPS)", color: "#8b5cf6" },
  { label: "Životní poj.", color: "#f43f5e" },
  { label: "Hypotéky", color: "#3b82f6" },
];
const DEFAULT_MIX_PCT = [40, 15, 25, 20];

type VisionGoal = { id: string; title: string; progress: number; colorClass: string; textClass: string };

function getMetric(progress: PlanProgressResult["progress"], metricType: string): { actual: number; target: number; unit: string } {
  const m = progress.metrics.find((x) => x.metricType === metricType);
  return {
    actual: m?.actual ?? 0,
    target: m?.target ?? 0,
    unit: m?.unit === "czk" ? "Kč" : "",
  };
}

export function BusinessPlanView() {
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [plan, setPlan] = useState<PlanWithTargetsRow | null>(null);
  const [progressResult, setProgressResult] = useState<PlanProgressResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [visionGoals, setVisionGoals] = useState<VisionGoal[]>([]);
  const [isVisionModalOpen, setIsVisionModalOpen] = useState(false);
  const [isParamsModalOpen, setIsParamsModalOpen] = useState(false);
  const [tempVision, setTempVision] = useState<VisionGoal[]>([]);
  const [tempParams, setTempParams] = useState({ production: 0, meetings: 0, newClients: 0 });
  const [saving, setSaving] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiInsightLoading, setAiInsightLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"my" | "team">("my");
  const [teamSummary, setTeamSummary] = useState<TeamBusinessPlanMemberSummary[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualForm, setManualForm] = useState({
    meetingsDelta: "",
    newClientsDelta: "",
    productionDelta: "",
    mixInv: "40",
    mixPen: "15",
    mixLife: "25",
    mixHypo: "20",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let resolvedPlan = await getActivePlan(periodType);
      if (!resolvedPlan) {
        const list = await listBusinessPlans();
        const { year, month, quarter } = getCurrentPeriodNumbers();
        const periodNumber = periodType === "month" ? month : periodType === "quarter" ? quarter : 0;
        const fallback = list.find(
          (item) => item.periodType === periodType && item.year === year && item.periodNumber === periodNumber
        );
        if (fallback) {
          resolvedPlan = await getPlanWithTargets(fallback.id);
        }
      }
      setPlan(resolvedPlan);
      if (resolvedPlan?.planId) {
        const result = await getPlanProgress(resolvedPlan.planId);
        setProgressResult(result);
      } else {
        setProgressResult(null);
      }
    } catch {
      setPlan(null);
      setProgressResult(null);
    } finally {
      setLoading(false);
    }
  }, [periodType]);

  const loadVision = useCallback(async () => {
    try {
      const rows = await getVisionGoals();
      if (rows.length > 0) {
        setVisionGoals(rows.map((r, i) => visionRowToGoal(r, i)));
      } else {
        setVisionGoals([
          visionRowToGoal({ id: "1", title: "Vlastní kancelář (Kauce)", progressPct: 85 }, 0),
          visionRowToGoal({ id: "2", title: "Pasivní příjem 50k / měs", progressPct: 40 }, 1),
        ]);
      }
    } catch {
      setVisionGoals([
        visionRowToGoal({ id: "1", title: "Vlastní kancelář (Kauce)", progressPct: 85 }, 0),
        visionRowToGoal({ id: "2", title: "Pasivní příjem 50k / měs", progressPct: 40 }, 1),
      ]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadVision();
  }, [loadVision]);

  const loadTeamSummary = useCallback(async () => {
    setTeamLoading(true);
    try {
      const data = await getTeamBusinessPlanSummary(periodType);
      setTeamSummary(data);
    } catch {
      setTeamSummary([]);
    } finally {
      setTeamLoading(false);
    }
  }, [periodType]);

  useEffect(() => {
    if (viewMode === "team") loadTeamSummary();
  }, [viewMode, loadTeamSummary]);

  useEffect(() => {
    if (!isManualModalOpen || !plan) return;
    const m = plan.manualMetricAdjustments ?? {};
    const t = plan.targetMixPct;
    setManualForm({
      meetingsDelta: m.meetings != null ? String(m.meetings) : "",
      newClientsDelta: m.new_clients != null ? String(m.new_clients) : "",
      productionDelta: m.production != null ? String(m.production) : "",
      mixInv: t ? String(t.investments) : "40",
      mixPen: t ? String(t.pension) : "15",
      mixLife: t ? String(t.life) : "25",
      mixHypo: t ? String(t.hypo) : "20",
    });
  }, [isManualModalOpen, plan]);

  const hasTargets = plan && plan.targets.length > 0;
  const isConfigured = plan && hasTargets;
  const showEmptyState = !loading && !plan;
  const showNoTargetsState = !loading && plan && !hasTargets;

  const productionTarget = plan?.targets.find((t) => t.metricType === "production")?.targetValue ?? 0;
  const meetingsTarget = plan?.targets.find((t) => t.metricType === "meetings")?.targetValue ?? 0;
  const newClientsTarget = plan?.targets.find((t) => t.metricType === "new_clients")?.targetValue ?? 0;

  const periodLabel =
    plan?.periodLabel ??
    (periodType === "month"
      ? new Date().toLocaleString("cs-CZ", { month: "long", year: "numeric" })
      : periodType === "quarter"
        ? `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`
        : String(new Date().getFullYear()));

  const production = progressResult ? getMetric(progressResult.progress, "production") : { actual: 0, target: productionTarget, unit: "Kč" };
  const meetings = progressResult ? getMetric(progressResult.progress, "meetings") : { actual: 0, target: meetingsTarget, unit: "" };
  const newClients = progressResult ? getMetric(progressResult.progress, "new_clients") : { actual: 0, target: newClientsTarget, unit: "" };
  const dealsClosed = progressResult ? getMetric(progressResult.progress, "deals_closed") : { actual: 0, target: 0, unit: "" };

  const reverseMath = computeReverseMath(productionTarget, meetingsTarget);
  const contractsTarget = reverseMath.contracts;

  const calculateProgress = (current: number, target: number) =>
    target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0;

  const openVisionModal = () => {
    setTempVision(JSON.parse(JSON.stringify(visionGoals)));
    setIsVisionModalOpen(true);
  };

  const saveVision = async () => {
    try {
      const saved = await upsertVisionGoals(
        tempVision.map((g, i) => ({ title: g.title, progressPct: g.progress, sortOrder: i }))
      );
      setVisionGoals(saved.map((r, i) => visionRowToGoal(r, i)));
      setIsVisionModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const openParamsModal = () => {
    setTempParams({
      production: productionTarget || 300000,
      meetings: meetingsTarget || 25,
      newClients: newClientsTarget || 6,
    });
    setIsParamsModalOpen(true);
  };

  const saveParams = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { year, month, quarter } = getCurrentPeriodNumbers();
      const periodNumber = periodType === "month" ? month : periodType === "quarter" ? quarter : 0;
      const label = periodType === "month"
        ? new Date(year, month - 1, 1).toLocaleString("cs-CZ", { month: "long", year: "numeric" })
        : periodType === "quarter"
          ? `Q${periodNumber} ${year}`
          : String(year);

      if (!plan?.planId) {
        const planId = await createBusinessPlan({
          periodType,
          year,
          periodNumber,
          title: label,
        });
        await setPlanTargets(planId, [
          { metricType: "production", targetValue: Number(tempParams.production), unit: "czk" },
          { metricType: "meetings", targetValue: Number(tempParams.meetings), unit: "count" },
          { metricType: "new_clients", targetValue: Number(tempParams.newClients), unit: "count" },
        ]);
      } else {
        await setPlanTargets(plan.planId, [
          { metricType: "production", targetValue: Number(tempParams.production), unit: "czk" },
          { metricType: "meetings", targetValue: Number(tempParams.meetings), unit: "count" },
          { metricType: "new_clients", targetValue: Number(tempParams.newClients), unit: "count" },
        ]);
      }
      setIsParamsModalOpen(false);
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateAiStrategy = useCallback(async () => {
    if (!plan?.planId || !progressResult) return;
    setAiInsightLoading(true);
    try {
      const res = await fetch("/api/ai/business-plan-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodLabel,
          targets: { production: productionTarget, meetings: meetingsTarget, newClients: newClientsTarget },
          actuals: { production: production.actual, meetings: meetings.actual, newClients: newClients.actual },
          recommendations: progressResult.recommendations.slice(0, 3).map((r) => ({ title: r.title, description: r.description })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiInsight(data.insight ?? null);
      }
    } catch {
      setAiInsight(null);
    } finally {
      setAiInsightLoading(false);
    }
  }, [plan?.planId, progressResult, periodLabel, productionTarget, meetingsTarget, newClientsTarget, production.actual, meetings.actual, newClients.actual]);


  const callsActual = progressResult?.funnelActuals?.calls ?? 0;
  const activities = [
    { id: "calls", label: "Telefonáty (Dovolání)", current: callsActual, target: reverseMath.calls, color: "bg-blue-500" },
    { id: "first_meetings", label: "První schůzky", current: meetings.actual, target: reverseMath.meetings, color: "bg-indigo-500" },
    { id: "closing", label: "Uzavírací schůzky", current: dealsClosed.actual, target: contractsTarget, color: "bg-emerald-500" },
  ];

  const rawMix = progressResult?.productionMix;
  const targetMixFallback = progressResult?.planTargetMixPct;
  const totalMix = rawMix
    ? rawMix.investments + rawMix.pension + rawMix.life + rawMix.hypo
    : 0;
  const mix =
    totalMix > 0 && rawMix
      ? [
          { label: MIX_COLORS[0].label, pct: Math.round((rawMix.investments / totalMix) * 100), color: MIX_COLORS[0].color },
          { label: MIX_COLORS[1].label, pct: Math.round((rawMix.pension / totalMix) * 100), color: MIX_COLORS[1].color },
          { label: MIX_COLORS[2].label, pct: Math.round((rawMix.life / totalMix) * 100), color: MIX_COLORS[2].color },
          { label: MIX_COLORS[3].label, pct: Math.round((rawMix.hypo / totalMix) * 100), color: MIX_COLORS[3].color },
        ]
      : (() => {
          const t = targetMixFallback;
          if (t) {
            const sum = t.investments + t.pension + t.life + t.hypo;
            if (sum > 0) {
              return [
                { label: MIX_COLORS[0].label, pct: Math.round((t.investments / sum) * 100), color: MIX_COLORS[0].color },
                { label: MIX_COLORS[1].label, pct: Math.round((t.pension / sum) * 100), color: MIX_COLORS[1].color },
                { label: MIX_COLORS[2].label, pct: Math.round((t.life / sum) * 100), color: MIX_COLORS[2].color },
                { label: MIX_COLORS[3].label, pct: Math.round((t.hypo / sum) * 100), color: MIX_COLORS[3].color },
              ];
            }
          }
          return MIX_COLORS.map((m, i) => ({ ...m, pct: DEFAULT_MIX_PCT[i]! }));
        })();

  const renderSVGDonut = (mixData: { pct: number; color: string }[]) => {
    let currentOffset = 0;
    return (
      <svg viewBox="0 0 36 36" className="w-32 h-32 transform -rotate-90">
        <circle cx="18" cy="18" r="15.9155" fill="transparent" stroke="#f1f5f9" strokeWidth="4" />
        {mixData.map((item, i) => {
          const dashArray = `${item.pct} ${100 - item.pct}`;
          const offset = currentOffset;
          currentOffset += item.pct;
          return (
            <circle
              key={i}
              cx="18"
              cy="18"
              r="15.9155"
              fill="transparent"
              stroke={item.color}
              strokeWidth="4"
              strokeDasharray={dashArray}
              strokeDashoffset={100 - offset}
              className="transition-all duration-1000 ease-out"
            />
          );
        })}
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen bg-transparent flex flex-col p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <SkeletonBlock className="h-9 w-64 mb-2" />
            <SkeletonBlock className="h-4 w-48" />
          </div>
        </div>
        <div className="space-y-6">
          <SkeletonBlock className="h-48 rounded-[32px]" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <SkeletonBlock key={i} className="h-36 rounded-[24px]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-screen bg-transparent font-sans text-[color:var(--wp-text)] flex flex-col relative pb-24 md:pb-28">
      <style>{`
        .font-display { font-family: var(--font-primary, inherit), sans-serif; }
        @keyframes fillProgress { from { width: 0; } }
        .animate-progress { animation: fillProgress 1s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        input[type=range] { -webkit-appearance: none; width: 100%; background: transparent; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 20px; width: 20px; border-radius: 50%; background: #4f46e5; border: 3px solid #fff; cursor: pointer; margin-top: -8px; box-shadow: 0 2px 6px rgba(79, 70, 229, 0.3); }
        input[type=range]::-webkit-slider-runnable-track { width: 100%; height: 4px; cursor: pointer; background: #e2e8f0; border-radius: 2px; }
      `}</style>

      <main className="flex-1 w-full max-w-[1400px] mx-auto p-6 md:p-8 flex flex-col relative z-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-black text-[color:var(--wp-text)] tracking-tight flex items-center gap-3">
              Můj business plán
            </h1>
            <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] mt-1">
              Vaše osobní vize, cíle a přesná cesta k jejich dosažení.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
              <div className="bg-[color:var(--wp-surface-muted)]/80 p-1 rounded-xl flex items-center border border-[color:var(--wp-surface-card-border)]/60 shadow-inner w-fit">
                {[
                  { id: "my" as const, label: "Můj plán", Icon: Target },
                  { id: "team" as const, label: "Tým", Icon: UsersRound },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setViewMode(tab.id)}
                    className={`flex items-center gap-1.5 px-3 md:px-4 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all min-h-[44px] md:min-h-0 ${
                      viewMode === tab.id
                        ? "bg-[color:var(--wp-surface-card)] text-indigo-700 shadow-sm border border-[color:var(--wp-surface-card-border)]/50"
                        : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]/50"
                    }`}
                  >
                    <tab.Icon size={14} /> {tab.label}
                  </button>
                ))}
              </div>
              <div className="bg-[color:var(--wp-surface-muted)]/80 p-1 rounded-xl flex items-center border border-[color:var(--wp-surface-card-border)]/60 shadow-inner w-fit">
                {PERIOD_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setPeriodType(t.id)}
                    className={`px-4 md:px-5 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all min-h-[44px] md:min-h-0 ${
                      periodType === t.id
                        ? "bg-[color:var(--wp-surface-card)] text-indigo-700 shadow-sm border border-[color:var(--wp-surface-card-border)]/50 scale-105"
                        : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]/50"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
        </div>

        {showEmptyState && (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] bg-[color:var(--wp-surface-card)] rounded-[32px] border border-[color:var(--wp-surface-card-border)] shadow-sm">
            <div className="w-24 h-24 bg-[color:var(--wp-surface-muted)] border-2 border-[color:var(--wp-surface-card-border)] rounded-full flex items-center justify-center text-[color:var(--wp-text-tertiary)] mb-6 relative">
              <Target size={40} strokeWidth={1.5} className="text-[color:var(--wp-text-tertiary)]" />
            </div>
            <h2 className="text-xl md:text-2xl font-display font-bold text-[color:var(--wp-text)] mb-3 text-center tracking-tight">
              Zatím nemáš nastavený business plán
            </h2>
            <p className="text-[color:var(--wp-text-secondary)] font-medium text-center max-w-md leading-relaxed mb-8">
              Nastav svou osobní vizi a cíle produkce — plán zobrazí přehled aktivit a schůzek z dat CRM (interní plánování, ne rada klientovi).
            </p>
            <button
              type="button"
              onClick={openParamsModal}
              className={clsx(portalPrimaryButtonClassName, "min-h-[44px] gap-2 px-6 py-3.5 text-sm shadow-lg")}
            >
              <Plus size={18} strokeWidth={2.5} /> Nastavit můj business plán
            </button>
          </div>
        )}

        {showNoTargetsState && plan && (
          <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] bg-[color:var(--wp-surface-card)] rounded-[32px] border border-[color:var(--wp-surface-card-border)] shadow-sm">
            <h2 className="text-xl font-display font-bold text-[color:var(--wp-text)] mb-3 text-center">
              Plán pro {plan.periodLabel} existuje, ale nejsou vyplněné cíle
            </h2>
            <p className="text-[color:var(--wp-text-secondary)] font-medium text-center max-w-md mb-8">
              Doplněním cílů uvidíš plnění a interní návrhy aktivit v plánu.
            </p>
            <button
              type="button"
              onClick={openParamsModal}
              className={clsx(portalPrimaryButtonClassName, "min-h-[44px] gap-2 px-6 py-3.5 text-sm")}
            >
              <Plus size={18} /> Doplnit cíle
            </button>
          </div>
        )}

        {isConfigured && viewMode === "team" && (
          <div className="space-y-6">
            <h2 className="text-xl font-display font-bold text-[color:var(--wp-text)] flex items-center gap-2">
              <UsersRound size={24} className="text-indigo-500" /> Týmový business plán – {periodLabel || periodType}
            </h2>
            {teamLoading ? (
              <div className="grid grid-cols-1 gap-4">
                {[1, 2, 3].map((i) => (
                  <SkeletonBlock key={i} className="h-24 rounded-[24px]" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {teamSummary.map((m) => (
                  <div
                    key={m.userId}
                    className="bg-[color:var(--wp-surface-card)] rounded-[24px] p-6 border border-[color:var(--wp-surface-card-border)] shadow-sm flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap"
                  >
                    <div className="font-display font-bold text-[color:var(--wp-text)] min-w-[140px]">
                      {m.displayName || m.userId.slice(0, 8)}
                    </div>
                    {m.periodLabel ? (
                      <>
                        <div className="flex items-center gap-4 flex-wrap text-sm">
                          <span className="text-[color:var(--wp-text-secondary)]">
                            Produkce: <strong className="text-[color:var(--wp-text)]">{(m.productionActual / 1000).toFixed(0)}k</strong> / {(m.productionTarget / 1000).toFixed(0)}k Kč
                          </span>
                          <span className="text-[color:var(--wp-text-secondary)]">
                            Schůzky: <strong className="text-[color:var(--wp-text)]">{m.meetingsActual}</strong> / {m.meetingsTarget}
                          </span>
                          <span className="text-[color:var(--wp-text-secondary)]">
                            Klienti: <strong className="text-[color:var(--wp-text)]">{m.newClientsActual}</strong> / {m.newClientsTarget}
                          </span>
                        </div>
                        <span className={`text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-md border shrink-0 ${
                          m.overallHealth === "achieved" || m.overallHealth === "exceeded"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : m.overallHealth === "significant_slip"
                              ? "bg-red-50 text-red-700 border-red-100"
                              : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]"
                        }`}>
                          {m.overallHealth === "no_data" ? "Bez plánu" : (HEALTH_STATUS_LABELS as Record<string, string>)[m.overallHealth] ?? m.overallHealth}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm text-[color:var(--wp-text-secondary)]">Nemá nastaven plán pro toto období.</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isConfigured && viewMode === "my" && plan && progressResult && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500" key={periodType}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-gradient-to-br from-aidv-create to-indigo-950 rounded-[32px] p-6 md:p-8 text-white relative overflow-hidden shadow-xl shadow-indigo-900/10">
                <Compass className="absolute -top-6 -right-6 w-32 h-32 text-white/5 pointer-events-none" />
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300 mb-6 flex items-center gap-2 relative z-10">
                  <Flag size={14} /> Osobní vize a milníky
                </h3>
                <div className="space-y-6 relative z-10">
                  {visionGoals.map((goal) => (
                    <div key={goal.id}>
                      <div className="flex justify-between items-end mb-2">
                        <span className="font-bold text-sm truncate pr-2">{goal.title}</span>
                        <span className={`text-xs font-medium shrink-0 ${goal.textClass}`}>{goal.progress}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-[color:var(--wp-surface-card)]/10 rounded-full overflow-hidden">
                        <div className={`h-full ${goal.colorClass} rounded-full animate-progress`} style={{ width: `${goal.progress}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={openVisionModal}
                  className="mt-8 text-xs font-bold text-indigo-300 hover:text-white transition-colors flex items-center gap-1 relative z-10 p-1 -ml-1 rounded hover:bg-[color:var(--wp-surface-card)]/5 min-h-[44px]"
                >
                  <Edit2 size={12} /> Upravit vizi <ChevronRight size={14} />
                </button>
              </div>

              <div className="lg:col-span-2 bg-[color:var(--wp-surface-card)] rounded-[32px] p-6 md:p-8 border border-[color:var(--wp-surface-card-border)] shadow-sm relative overflow-hidden">
                <h2 className="text-xl font-display font-bold text-[color:var(--wp-text)] flex items-center gap-2">
                  <Target className="text-rose-500" size={24} /> Matematika úspěchu
                </h2>
                <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] mt-1">
                  Co přesně musím udělat pro dosažení cíle za období: <strong>{periodLabel}</strong>
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 flex-wrap">
                  <div className="flex flex-col items-center text-center group flex-1 min-w-[80px]">
                    <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-3 border border-blue-100 shadow-sm">
                      <Phone size={20} />
                    </div>
                    <span className="text-2xl font-display font-black text-[color:var(--wp-text)]">{reverseMath.calls}</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mt-1">Dovolání</span>
                  </div>
                  <ArrowRight className="text-[color:var(--wp-text-tertiary)] hidden sm:block shrink-0" size={24} />
                  <div className="flex flex-col items-center text-center group flex-1 min-w-[80px]">
                    <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-3 border border-indigo-100 shadow-sm">
                      <Calendar size={20} />
                    </div>
                    <span className="text-2xl font-display font-black text-[color:var(--wp-text)]">{reverseMath.meetings}</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mt-1">Schůzek</span>
                  </div>
                  <ArrowRight className="text-[color:var(--wp-text-tertiary)] hidden sm:block shrink-0" size={24} />
                  <div className="flex flex-col items-center text-center group flex-1 min-w-[80px]">
                    <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-3 border border-emerald-100 shadow-sm">
                      <FileSignature size={20} />
                    </div>
                    <span className="text-2xl font-display font-black text-[color:var(--wp-text)]">{reverseMath.contracts}</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mt-1">Smluv</span>
                  </div>
                  <ArrowRight className="text-[color:var(--wp-text-tertiary)] hidden sm:block shrink-0" size={24} />
                  <div className="flex flex-col items-center text-center group flex-1 min-w-[80px]">
                    <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-400 text-white rounded-2xl flex items-center justify-center mb-3 shadow-lg shadow-amber-500/30">
                      <Trophy size={24} />
                    </div>
                    <span className="text-2xl font-display font-black text-[color:var(--wp-text)]">{reverseMath.productionK}k</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mt-1">Produkce (Kč)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[color:var(--wp-surface-card)] rounded-[24px] p-6 border border-[color:var(--wp-surface-card-border)] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-50 rounded-full blur-2xl opacity-50 group-hover:opacity-100 transition-opacity" />
                <div className="flex justify-between items-start mb-6 relative z-10">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center border border-emerald-100">
                    <TrendingUp size={24} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100">
                    {calculateProgress(production.actual, production.target)}% Splněno
                  </span>
                </div>
                <div className="relative z-10">
                  <span className="block text-[11px] font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">Cílová produkce ({periodLabel})</span>
                  <div className="flex items-baseline gap-2 mb-4 flex-wrap">
                    <span className="text-3xl font-display font-black text-[color:var(--wp-text)] tracking-tight">
                      {(production.actual / 1000).toFixed(0)}k
                    </span>
                    <span className="text-sm font-semibold text-[color:var(--wp-text-tertiary)]">
                      / {(production.target / 1000).toFixed(0)}k Kč
                    </span>
                  </div>
                  <div className="h-2 w-full bg-[color:var(--wp-surface-muted)] rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full animate-progress" style={{ width: `${calculateProgress(production.actual, production.target)}%` }} />
                  </div>
                </div>
              </div>

              <div className="bg-[color:var(--wp-surface-card)] rounded-[24px] p-6 border border-[color:var(--wp-surface-card-border)] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="absolute -right-6 -top-6 w-24 h-24 bg-indigo-50 rounded-full blur-2xl opacity-50 group-hover:opacity-100 transition-opacity" />
                <div className="flex justify-between items-start mb-6 relative z-10">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center border border-indigo-100">
                    <Calendar size={24} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100">
                    {calculateProgress(meetings.actual, meetings.target)}% Splněno
                  </span>
                </div>
                <div className="relative z-10">
                  <span className="block text-[11px] font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">Počet schůzek ({periodLabel})</span>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-3xl font-display font-black text-[color:var(--wp-text)] tracking-tight">{meetings.actual}</span>
                    <span className="text-sm font-semibold text-[color:var(--wp-text-tertiary)]">/ {meetings.target} schůzek</span>
                  </div>
                  <div className="h-2 w-full bg-[color:var(--wp-surface-muted)] rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full animate-progress" style={{ width: `${calculateProgress(meetings.actual, meetings.target)}%` }} />
                  </div>
                </div>
              </div>

              <div className="bg-[color:var(--wp-surface-card)] rounded-[24px] p-6 border border-[color:var(--wp-surface-card-border)] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="absolute -right-6 -top-6 w-24 h-24 bg-amber-50 rounded-full blur-2xl opacity-50 group-hover:opacity-100 transition-opacity" />
                <div className="flex justify-between items-start mb-6 relative z-10">
                  <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center border border-amber-100">
                    <Users size={24} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-100">
                    {calculateProgress(newClients.actual, newClients.target)}% Splněno
                  </span>
                </div>
                <div className="relative z-10">
                  <span className="block text-[11px] font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">Noví klienti ({periodLabel})</span>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-3xl font-display font-black text-[color:var(--wp-text)] tracking-tight">{newClients.actual}</span>
                    <span className="text-sm font-semibold text-[color:var(--wp-text-tertiary)]">/ {newClients.target} klientů</span>
                  </div>
                  <div className="h-2 w-full bg-[color:var(--wp-surface-muted)] rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full animate-progress" style={{ width: `${calculateProgress(newClients.actual, newClients.target)}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2 bg-[color:var(--wp-surface-card)] rounded-[32px] p-6 md:p-8 border border-[color:var(--wp-surface-card-border)] shadow-sm">
                <h2 className="text-xl font-display font-bold text-[color:var(--wp-text)] flex items-center gap-2">
                  <BarChart3 className="text-indigo-500" size={24} /> Trychtýř aktivit
                </h2>
                <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] mt-1">Sledujte svou konverzi od prvního zavolání po uzavření obchodu.</p>
                <div className="space-y-6 mt-6">
                  {activities.map((act) => {
                    const pct = calculateProgress(act.current, act.target);
                    return (
                      <div key={act.id}>
                        <div className="flex justify-between items-end mb-2">
                          <span className="font-semibold text-[color:var(--wp-text-secondary)] text-sm">{act.label}</span>
                          <span className="text-sm font-black text-[color:var(--wp-text)]">{act.current} <span className="text-[color:var(--wp-text-tertiary)] font-medium">/ {act.target}</span></span>
                        </div>
                        <div className="h-3 w-full bg-[color:var(--wp-surface-muted)] rounded-full overflow-hidden">
                          <div className={`h-full ${act.color} rounded-full animate-progress relative`} style={{ width: `${pct}%` }}>
                            <div className="absolute top-0 left-0 w-full h-1/2 bg-[color:var(--wp-surface-card)]/20 rounded-full" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-10 p-5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 rounded-2xl flex items-start gap-4">
                  <div className="p-2 bg-[color:var(--wp-surface-card)] rounded-xl shadow-sm text-amber-500 shrink-0">
                    <Sparkles size={20} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-black uppercase tracking-widest text-amber-800 mb-1">Interní AI přehled</h4>
                    <p className="text-sm font-medium text-amber-900/80 leading-relaxed">
                      {aiInsightLoading ? "Generuji informativní podklad…" : aiInsight || progressResult.recommendations[0]?.description || "Nastav cíle a načti data z CRM — poté můžeš vygenerovat informativní interní přehled (ne rada klientovi)."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-1 bg-[color:var(--wp-surface-card)] rounded-[32px] p-6 md:p-8 border border-[color:var(--wp-surface-card-border)] shadow-sm flex flex-col hover:shadow-md transition-shadow">
                <h2 className="text-lg font-display font-bold text-[color:var(--wp-text)] flex items-center gap-2 mb-2">
                  <PieChart className="text-emerald-500" size={20} /> Produkční mix
                </h2>
                <p className="text-xs font-medium text-[color:var(--wp-text-secondary)] mb-8">
                  Podle smluv v období (Kč); pokud v období není produkce, zobrazí se uložený cílový mix nebo výchozí poměr.
                </p>
                <div className="flex justify-center mb-8 relative">
                  {renderSVGDonut(mix)}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-black text-[color:var(--wp-text)]">100%</span>
                  </div>
                </div>
                <div className="space-y-3 mt-auto">
                  {mix.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-[color:var(--wp-surface-muted)] transition-colors">
                      <div className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full shadow-sm shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-sm font-bold text-[color:var(--wp-text-secondary)]">{item.label}</span>
                      </div>
                      <span className="text-sm font-black text-[color:var(--wp-text)]">{item.pct} %</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mt-6 pb-8">
          {isConfigured && plan?.planId ? (
            <button
              type="button"
              onClick={() => setIsManualModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)] rounded-xl font-bold text-sm transition-colors min-h-[44px]"
            >
              <FileSignature size={16} /> Ruční doplnění
            </button>
          ) : null}
          <button
            type="button"
            onClick={openParamsModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-card-border)] rounded-xl font-bold text-sm transition-colors min-h-[44px]"
          >
            <Edit2 size={16} /> {isConfigured ? "Upravit parametry" : "Začít s plánováním"}
          </button>
          <button
            type="button"
            onClick={handleGenerateAiStrategy}
            disabled={!isConfigured || aiInsightLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-aidv-create to-indigo-900 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-900/20 hover:scale-105 transition-transform disabled:opacity-70 min-h-[44px]"
          >
            <Sparkles size={16} className="text-amber-400" /> Vygenerovat interní AI přehled
          </button>
        </div>
      </main>

      {isManualModalOpen && plan?.planId ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[color:var(--wp-overlay-scrim)] backdrop-blur-sm p-4">
          <div className="bg-[color:var(--wp-surface-card)] rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 border-b border-[color:var(--wp-surface-card-border)] flex items-center justify-between bg-[color:var(--wp-surface-muted)]/50 shrink-0">
              <h2 className="text-lg font-bold text-[color:var(--wp-text)]">Ruční doplnění</h2>
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text-secondary)] p-2 rounded-md hover:bg-[color:var(--wp-surface-card-border)] min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto custom-scroll text-sm">
              <p className="text-[color:var(--wp-text-secondary)]">
                <strong>Přičíst k automatickým číslům z CRM</strong> (schůzky, klienti, produkce v Kč). Záporná hodnota sníží výsledek.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-xs font-bold text-[color:var(--wp-text-secondary)]">Schůzky Δ</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={manualForm.meetingsDelta}
                    onChange={(e) => setManualForm((f) => ({ ...f, meetingsDelta: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 min-h-[44px] border border-[color:var(--wp-surface-card-border)] rounded-xl"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-[color:var(--wp-text-secondary)]">Noví klienti Δ</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={manualForm.newClientsDelta}
                    onChange={(e) => setManualForm((f) => ({ ...f, newClientsDelta: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 min-h-[44px] border border-[color:var(--wp-surface-card-border)] rounded-xl"
                  />
                </label>
                <label className="block sm:col-span-1">
                  <span className="text-xs font-bold text-[color:var(--wp-text-secondary)]">Produkce Δ (Kč)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={manualForm.productionDelta}
                    onChange={(e) => setManualForm((f) => ({ ...f, productionDelta: e.target.value }))}
                    className="mt-1 w-full px-3 py-2.5 min-h-[44px] border border-[color:var(--wp-surface-card-border)] rounded-xl"
                  />
                </label>
              </div>
              <p className="text-[color:var(--wp-text-secondary)] pt-2">
                <strong>Cílový mix</strong> (váhy) se použije v koláči, jen když v období není žádná produkce v CRM.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["mixInv", "Investice"] as const,
                    ["mixPen", "Penze"] as const,
                    ["mixLife", "ŽP"] as const,
                    ["mixHypo", "Hypo"] as const,
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="text-xs font-bold text-[color:var(--wp-text-secondary)]">{label}</span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={manualForm[key]}
                      onChange={(e) => setManualForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="mt-1 w-full px-3 py-2.5 min-h-[44px] border border-[color:var(--wp-surface-card-border)] rounded-xl"
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] flex flex-wrap items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  if (!plan?.planId) return;
                  setManualSaving(true);
                  try {
                    await savePlanManualOverrides(plan.planId, {
                      manualMetricAdjustments: null,
                      targetMixPct: null,
                    });
                    await load();
                    setIsManualModalOpen(false);
                  } finally {
                    setManualSaving(false);
                  }
                }}
                disabled={manualSaving}
                className="px-4 py-2.5 min-h-[44px] text-[color:var(--wp-text-secondary)] font-bold text-sm"
              >
                Vymazat
              </button>
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="px-4 py-2.5 min-h-[44px] bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-xl font-bold text-sm"
              >
                Zrušit
              </button>
              <button
                type="button"
                disabled={manualSaving}
                onClick={async () => {
                  if (!plan?.planId) return;
                  setManualSaving(true);
                  try {
                    const adjustments: Record<string, number> = {};
                    const md = (k: keyof typeof manualForm, dbKey: string) => {
                      const n = Number.parseFloat(String(manualForm[k]).replace(",", "."));
                      if (Number.isFinite(n) && n !== 0) adjustments[dbKey] = n;
                    };
                    md("meetingsDelta", "meetings");
                    md("newClientsDelta", "new_clients");
                    md("productionDelta", "production");
                    const inv = Math.max(0, Number.parseFloat(manualForm.mixInv) || 0);
                    const pen = Math.max(0, Number.parseFloat(manualForm.mixPen) || 0);
                    const life = Math.max(0, Number.parseFloat(manualForm.mixLife) || 0);
                    const hypo = Math.max(0, Number.parseFloat(manualForm.mixHypo) || 0);
                    const mixSum = inv + pen + life + hypo;
                    await savePlanManualOverrides(plan.planId, {
                      manualMetricAdjustments: Object.keys(adjustments).length > 0 ? adjustments : null,
                      targetMixPct:
                        mixSum > 0
                          ? { investments: inv, pension: pen, life: life, hypo: hypo }
                          : null,
                    });
                    await load();
                    setIsManualModalOpen(false);
                  } finally {
                    setManualSaving(false);
                  }
                }}
                className={clsx(portalPrimaryButtonClassName, "min-h-[44px] gap-2 px-6 py-2.5 text-sm")}
              >
                <Save size={16} /> Uložit
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isVisionModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[color:var(--wp-overlay-scrim)] backdrop-blur-sm p-4">
          <div className="bg-[color:var(--wp-surface-card)] rounded-2xl shadow-2xl w-full max-w-[500px] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[color:var(--wp-surface-card-border)] flex items-center justify-between bg-[color:var(--wp-surface-muted)]/50">
              <h2 className="text-lg font-bold text-[color:var(--wp-text)] flex items-center gap-2">
                <Flag size={18} className="text-indigo-500" /> Osobní vize
              </h2>
              <button type="button" onClick={() => setIsVisionModalOpen(false)} className="text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text-secondary)] p-1 rounded-md hover:bg-[color:var(--wp-surface-card-border)] min-h-[44px] min-w-[44px] flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {tempVision.map((goal, idx) => (
                <div key={goal.id} className="p-4 bg-[color:var(--wp-surface-muted)] rounded-xl border border-[color:var(--wp-surface-card-border)]">
                  <label className="block text-xs font-bold uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-2">Cíl {idx + 1}</label>
                  <input
                    type="text"
                    value={goal.title}
                    onChange={(e) => {
                      const newGoals = [...tempVision];
                      newGoals[idx] = { ...newGoals[idx], title: e.target.value };
                      setTempVision(newGoals);
                    }}
                    className="w-full px-4 py-2.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-lg text-sm font-bold outline-none focus:border-indigo-400 mb-4"
                  />
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-[color:var(--wp-text-secondary)]">Progres plnění</label>
                    <span className="text-sm font-black text-indigo-600">{goal.progress}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={goal.progress}
                    onChange={(e) => {
                      const newGoals = [...tempVision];
                      newGoals[idx] = { ...newGoals[idx], progress: Number(e.target.value) };
                      setTempVision(newGoals);
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] flex items-center justify-end gap-3">
              <button type="button" onClick={() => setIsVisionModalOpen(false)} className="px-4 py-2 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-xl font-bold text-sm hover:bg-[color:var(--wp-surface-muted)] min-h-[44px]">
                Zrušit
              </button>
              <button type="button" onClick={saveVision} className={clsx(portalPrimaryButtonClassName, "min-h-[44px] gap-2 px-6 py-2 text-sm shadow-md")}>
                <Save size={16} /> Uložit vizi
              </button>
            </div>
          </div>
        </div>
      )}

      {isParamsModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[color:var(--wp-overlay-scrim)] backdrop-blur-sm p-4">
          <div className="bg-[color:var(--wp-surface-card)] rounded-2xl shadow-2xl w-full max-w-[500px] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[color:var(--wp-surface-card-border)] flex items-center justify-between bg-[color:var(--wp-surface-muted)]/50">
              <h2 className="text-lg font-bold text-[color:var(--wp-text)] flex items-center gap-2">
                <Target size={18} className="text-rose-500" /> Cíle pro {periodLabel}
              </h2>
              <button type="button" onClick={() => setIsParamsModalOpen(false)} className="text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text-secondary)] p-1 rounded-md hover:bg-[color:var(--wp-surface-card-border)] min-h-[44px] min-w-[44px] flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveParams} className="flex flex-col">
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-2">Cílová produkce (Kč)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={10000}
                    value={tempParams.production}
                    onChange={(e) => setTempParams((p) => ({ ...p, production: Number(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-lg font-black outline-none focus:bg-[color:var(--wp-surface-card)] focus:border-indigo-400 min-h-[44px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-2">Počet schůzek</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={tempParams.meetings}
                      onChange={(e) => setTempParams((p) => ({ ...p, meetings: Number(e.target.value) || 0 }))}
                      className="w-full px-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-lg font-black outline-none focus:bg-[color:var(--wp-surface-card)] focus:border-indigo-400 min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-widest text-[color:var(--wp-text-secondary)] mb-2">Noví klienti</label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={tempParams.newClients}
                      onChange={(e) => setTempParams((p) => ({ ...p, newClients: Number(e.target.value) || 0 }))}
                      className="w-full px-4 py-3 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-lg font-black outline-none focus:bg-[color:var(--wp-surface-card)] focus:border-indigo-400 min-h-[44px]"
                    />
                  </div>
                </div>
                <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl text-sm font-medium text-indigo-900/80 leading-relaxed">
                  Změnou těchto hodnot dojde k automatickému přepočítání „Matematiky úspěchu“ a trychtýře aktivit.
                </div>
              </div>
              <div className="px-6 py-4 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] flex items-center justify-end gap-3">
                <button type="button" onClick={() => setIsParamsModalOpen(false)} className="px-4 py-2.5 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] rounded-xl font-bold text-sm hover:bg-[color:var(--wp-surface-muted)] shadow-sm min-h-[44px]">
                  Zrušit
                </button>
                <button type="submit" disabled={saving} className={clsx(portalPrimaryButtonClassName, "min-h-[44px] gap-2 px-6 py-2.5 text-sm shadow-md disabled:opacity-50")}>
                  <Check size={16} strokeWidth={3} /> {isConfigured ? "Uložit změny" : "Aktivovat plán"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
