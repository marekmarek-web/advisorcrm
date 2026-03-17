"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Target,
  Calendar,
  TrendingUp,
  AlertCircle,
  Plus,
  Pencil,
  ChevronRight,
} from "lucide-react";
import type { PeriodType } from "@/lib/business-plan/types";
import {
  METRIC_TYPE_LABELS,
  HEALTH_STATUS_LABELS,
  BUSINESS_PLAN_METRIC_TYPES,
  getPlanPeriod,
  getCurrentPeriodNumbers,
} from "@/lib/business-plan/types";
import type { PlanProgress, PlanHealthStatus, MetricProgress } from "@/lib/business-plan/types";
import type { SlippageRecommendation } from "@/lib/business-plan/types";
import {
  getActivePlan,
  getPlanProgress,
  createBusinessPlan,
  setPlanTargets,
  type PlanWithTargetsRow,
  type PlanProgressResult,
} from "@/app/actions/business-plan";
import { BaseModal } from "@/app/components/BaseModal";
import { SkeletonBlock } from "@/app/components/Skeleton";

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: "month", label: "Měsíc" },
  { value: "quarter", label: "Kvartál" },
  { value: "year", label: "Rok" },
];

function formatValue(value: number, unit: string): string {
  if (unit === "czk") return `${Math.round(value).toLocaleString("cs-CZ")} Kč`;
  return String(Math.round(value));
}

const HEALTH_BADGE_CLASS: Record<PlanHealthStatus, string> = {
  achieved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  exceeded: "bg-emerald-100 text-emerald-800 border-emerald-200",
  on_track: "bg-blue-100 text-blue-800 border-blue-200",
  slight_slip: "bg-amber-100 text-amber-800 border-amber-200",
  significant_slip: "bg-red-100 text-red-800 border-red-200",
  no_data: "bg-slate-100 text-slate-600 border-slate-200",
  not_applicable: "bg-slate-100 text-slate-500 border-slate-200",
};

export function BusinessPlanView() {
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [plan, setPlan] = useState<PlanWithTargetsRow | null>(null);
  const [progressResult, setProgressResult] = useState<PlanProgressResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const active = await getActivePlan(periodType);
      setPlan(active);
      if (active?.planId) {
        const result = await getPlanProgress(active.planId);
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

  useEffect(() => {
    load();
  }, [load]);

  const hasTargets = plan && plan.targets.length > 0;
  const showEmptyState = !loading && !plan;
  const showNoTargetsState = !loading && plan && !hasTargets;

  return (
    <div
      className="flex flex-col flex-1 min-h-0 w-full"
      style={{ animation: "wp-fade-in 0.3s ease" }}
    >
      <div className="wp-projects-section flex-1 min-w-0 pb-8">
        <div
          className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6"
          style={{ marginBottom: "var(--wp-space-6)" }}
        >
          <div>
            <h1
              className="text-xl md:text-3xl font-bold tracking-tight mb-1 md:mb-2"
              style={{ color: "var(--wp-text)" }}
            >
              Můj business plán
            </h1>
            <p
              className="text-sm font-medium flex items-center gap-2"
              style={{ color: "var(--wp-text-muted)" }}
            >
              <Target size={16} style={{ color: "var(--wp-accent, #4f46e5)" }} />
              <span style={{ color: "var(--wp-text)" }}>
                {plan ? plan.periodLabel : loading ? "Načítám…" : "—"}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:gap-4">
            <div
              className="flex items-center rounded-[var(--wp-radius-sm)] p-1 border"
              style={{
                background: "var(--wp-bg)",
                borderColor: "var(--wp-border)",
              }}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPeriodType(opt.value)}
                  className={`px-3 md:px-4 py-2 rounded-[var(--wp-radius-xs)] text-xs font-semibold uppercase tracking-wide transition-all min-h-[44px] md:min-h-0 ${
                    periodType === opt.value ? "shadow-sm border" : "opacity-80 hover:opacity-100"
                  }`}
                  style={
                    periodType === opt.value
                      ? {
                          background: "var(--wp-bg-card, #fff)",
                          borderColor: "var(--wp-border)",
                          color: "var(--wp-accent, #4f46e5)",
                        }
                      : { color: "var(--wp-text-muted)" }
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {plan && (
              <button
                type="button"
                onClick={() => {
                  setEditingPlanId(plan.planId);
                  setFormOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-[var(--wp-radius-sm)] text-xs font-semibold uppercase tracking-wide border transition-all min-h-[44px]"
                style={{
                  background: "var(--wp-bg-card, #fff)",
                  borderColor: "var(--wp-border)",
                  color: "var(--wp-text)",
                }}
              >
                <Pencil size={16} /> Upravit plán
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            <SkeletonBlock className="h-32 rounded-[var(--wp-radius-sm)]" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <SkeletonBlock key={i} className="h-28 rounded-[var(--wp-radius-sm)]" />
              ))}
            </div>
          </div>
        ) : showEmptyState ? (
          <EmptyState onSetup={() => setFormOpen(true)} />
        ) : showNoTargetsState ? (
          <NoTargetsState
            periodLabel={plan!.periodLabel}
            onAddTargets={() => {
              setEditingPlanId(plan!.planId);
              setFormOpen(true);
            }}
          />
        ) : plan && progressResult ? (
          <>
            <ProgressCards progress={progressResult.progress} />
            {progressResult.recommendations.length > 0 && (
              <RecommendationsSection recommendations={progressResult.recommendations} />
            )}
            <p className="mt-4 text-xs" style={{ color: "var(--wp-text-muted)" }}>
              Doplněním poradce u smluv se naplní osobní produkce a objemy.
            </p>
          </>
        ) : null}
      </div>

      {formOpen && (
        <PlanFormModal
          periodType={periodType}
          existingPlanId={editingPlanId}
          existingTargets={plan?.targets}
          onClose={() => {
            setFormOpen(false);
            setEditingPlanId(null);
          }}
          onSaved={() => {
            setFormOpen(false);
            setEditingPlanId(null);
            load();
          }}
          saving={saving}
          setSaving={setSaving}
        />
      )}

      {showEmptyState && !formOpen && (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="flex items-center gap-2 px-5 py-3 rounded-[var(--wp-radius-sm)] font-medium min-h-[44px] mt-4"
          style={{
            background: "var(--wp-accent, #4f46e5)",
            color: "#fff",
          }}
        >
          <Plus size={20} /> Nastavit business plán
        </button>
      )}
    </div>
  );
}

function EmptyState({ onSetup }: { onSetup: () => void }) {
  return (
    <div
      className="p-6 md:p-10 rounded-[var(--wp-radius-sm)] border text-center"
      style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}
    >
      <Target className="mx-auto mb-4 opacity-60" size={48} style={{ color: "var(--wp-text-muted)" }} />
      <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--wp-text)" }}>
        Zatím nemáš nastavený business plán
      </h2>
      <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: "var(--wp-text-muted)" }}>
        Nastav cíle pro aktuální období a sleduj plnění podle schůzek, obchodů, produkce a dalších metrik z CRM.
      </p>
      <button
        type="button"
        onClick={onSetup}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-[var(--wp-radius-sm)] font-medium min-h-[44px]"
        style={{ background: "var(--wp-accent, #4f46e5)", color: "#fff" }}
      >
        <Plus size={20} /> Nastavit business plán
      </button>
    </div>
  );
}

function NoTargetsState({
  periodLabel,
  onAddTargets,
}: {
  periodLabel: string;
  onAddTargets: () => void;
}) {
  return (
    <div
      className="p-6 md:p-10 rounded-[var(--wp-radius-sm)] border text-center"
      style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}
    >
      <AlertCircle className="mx-auto mb-4 opacity-60" size={48} style={{ color: "var(--wp-text-muted)" }} />
      <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--wp-text)" }}>
        Plán pro {periodLabel} existuje, ale nejsou vyplněné cíle
      </h2>
      <p className="text-sm mb-6" style={{ color: "var(--wp-text-muted)" }}>
        Doplněním cílů uvidíš plnění a doporučené akce.
      </p>
      <button
        type="button"
        onClick={onAddTargets}
        className="inline-flex items-center gap-2 px-5 py-3 rounded-[var(--wp-radius-sm)] font-medium min-h-[44px]"
        style={{ background: "var(--wp-accent, #4f46e5)", color: "#fff" }}
      >
        Doplnit cíle
      </button>
    </div>
  );
}

function ProgressCards({ progress }: { progress: PlanProgress }) {
  return (
    <div className="space-y-6">
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[var(--wp-radius-xs)] text-sm font-medium border ${HEALTH_BADGE_CLASS[progress.overallHealth] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}
      >
        Celkový stav: {HEALTH_STATUS_LABELS[progress.overallHealth]}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {progress.metrics.map((m) => (
          <MetricCard key={m.metricType} metric={m} />
        ))}
      </div>
    </div>
  );
}

function MetricCard({ metric }: { metric: MetricProgress }) {
  const label = METRIC_TYPE_LABELS[metric.metricType];
  const actualStr = metric.health === "no_data" || metric.health === "not_applicable"
    ? "—"
    : formatValue(metric.actual, metric.unit);
  const targetStr = metric.target > 0 ? formatValue(metric.target, metric.unit) : "—";
  const pct = metric.target > 0 ? Math.min(100, Math.round((metric.actual / metric.target) * 100)) : 0;

  return (
    <div
      className="p-4 rounded-[var(--wp-radius-sm)] border flex flex-col gap-3"
      style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}
    >
      <div className="flex justify-between items-start gap-2">
        <span className="text-sm font-medium" style={{ color: "var(--wp-text)" }}>
          {label}
        </span>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded border shrink-0 ${HEALTH_BADGE_CLASS[metric.health]}`}
        >
          {HEALTH_STATUS_LABELS[metric.health]}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold" style={{ color: "var(--wp-text)" }}>
          {actualStr}
        </span>
        <span className="text-sm" style={{ color: "var(--wp-text-muted)" }}>
          / {targetStr}
        </span>
      </div>
      {metric.target > 0 && (
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--wp-bg)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background:
                metric.health === "achieved" || metric.health === "exceeded"
                  ? "var(--wp-success, #10b981)"
                  : metric.health === "significant_slip"
                    ? "var(--wp-danger, #ef4444)"
                    : "var(--wp-accent, #4f46e5)",
            }}
          />
        </div>
      )}
    </div>
  );
}

function RecommendationsSection({ recommendations }: { recommendations: SlippageRecommendation[] }) {
  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--wp-text)" }}>
        <AlertCircle size={20} style={{ color: "var(--wp-warning)" }} />
        Doporučené akce
      </h2>
      <ul className="space-y-3">
        {recommendations.map((rec) => (
          <li
            key={`${rec.metricType}-${rec.actionType}`}
            className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-[var(--wp-radius-sm)] border"
            style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm" style={{ color: "var(--wp-text)" }}>
                {rec.title}
              </p>
              <p className="text-sm mt-0.5" style={{ color: "var(--wp-text-muted)" }}>
                {rec.description}
              </p>
            </div>
            <Link
              href={rec.href}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[var(--wp-radius-sm)] text-sm font-medium min-h-[44px] shrink-0"
              style={{
                background: "var(--wp-accent, #4f46e5)",
                color: "#fff",
              }}
            >
              {rec.actionType === "schedule_meeting" && "Kalendář"}
              {rec.actionType === "open_pipeline" && "Obchody"}
              {rec.actionType === "open_tasks" && "Úkoly"}
              {rec.actionType === "open_service" && "Nástěnka"}
              {rec.actionType === "new_client" && "Nový klient"}
              {rec.actionType === "open_production" && "Produkce"}
              <ChevronRight size={16} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

type PlanFormModalProps = {
  periodType: PeriodType;
  existingPlanId: string | null;
  existingTargets?: { metricType: string; targetValue: number; unit: string }[];
  onClose: () => void;
  onSaved: () => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
};

function PlanFormModal({
  periodType,
  existingPlanId,
  existingTargets = [],
  onClose,
  onSaved,
  saving,
  setSaving,
}: PlanFormModalProps) {
  const { year, month, quarter } = getCurrentPeriodNumbers();
  const [yearVal, setYearVal] = useState(year);
  const [periodNum, setPeriodNum] = useState(
    periodType === "month" ? month : periodType === "quarter" ? quarter : 1
  );
  const [targetValues, setTargetValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const t of existingTargets) {
      init[t.metricType] = String(t.targetValue);
    }
    return init;
  });

  const isNew = !existingPlanId;
  const periodLabel = (() => {
    if (periodType === "month") {
      const d = new Date(yearVal, periodNum - 1, 1);
      return d.toLocaleString("cs-CZ", { month: "long", year: "numeric" });
    }
    if (periodType === "quarter") return `Q${periodNum} ${yearVal}`;
    return String(yearVal);
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isNew) {
        const planId = await createBusinessPlan({
          periodType,
          year: yearVal,
          periodNumber: periodType === "year" ? 0 : periodNum,
          title: periodLabel,
        });
        const targets = BUSINESS_PLAN_METRIC_TYPES.filter((k) => {
          const v = targetValues[k]?.trim();
          return v && !Number.isNaN(Number(v)) && Number(v) > 0;
        }).map((metricType) => ({
          metricType,
          targetValue: Number(targetValues[metricType]),
          unit: (metricType.includes("volume") || metricType === "production" ? "czk" : "count") as "count" | "czk" | "pct",
        }));
        await setPlanTargets(planId, targets);
      } else {
        const targets = BUSINESS_PLAN_METRIC_TYPES.filter((k) => {
          const v = targetValues[k]?.trim();
          return v && !Number.isNaN(Number(v)) && Number(v) > 0;
        }).map((metricType) => ({
          metricType,
          targetValue: Number(targetValues[metricType]),
          unit: (metricType.includes("volume") || metricType === "production" ? "czk" : "count") as "count" | "czk" | "pct",
        }));
        await setPlanTargets(existingPlanId!, targets);
      }
      onSaved();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const quarterOptions = [1, 2, 3, 4];

  return (
    <BaseModal
      open
      onClose={onClose}
      title={isNew ? "Nastavit business plán" : "Upravit cíle"}
      maxWidth="xl"
      mobileVariant="sheet"
    >
      <form onSubmit={handleSubmit} className="p-4 space-y-6">
        {isNew && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--wp-text)" }}>
                Rok
              </label>
              <input
                type="number"
                min={year - 1}
                max={year + 1}
                value={yearVal}
                onChange={(e) => setYearVal(Number(e.target.value))}
                className="w-full px-3 py-2 rounded border min-h-[44px]"
                style={{ borderColor: "var(--wp-border)" }}
              />
            </div>
            {periodType === "month" && (
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--wp-text)" }}>
                  Měsíc
                </label>
                <select
                  value={periodNum}
                  onChange={(e) => setPeriodNum(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded border min-h-[44px]"
                  style={{ borderColor: "var(--wp-border)" }}
                >
                  {monthOptions.map((n) => (
                    <option key={n} value={n}>
                      {new Date(yearVal, n - 1, 1).toLocaleString("cs-CZ", { month: "long" })}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {periodType === "quarter" && (
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--wp-text)" }}>
                  Kvartál
                </label>
                <select
                  value={periodNum}
                  onChange={(e) => setPeriodNum(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded border min-h-[44px]"
                  style={{ borderColor: "var(--wp-border)" }}
                >
                  {quarterOptions.map((n) => (
                    <option key={n} value={n}>
                      Q{n}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div>
          <p className="text-sm font-medium mb-3" style={{ color: "var(--wp-text)" }}>
            Cílové hodnoty (nepovinné – vyplň jen metriky, které chceš sledovat)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {BUSINESS_PLAN_METRIC_TYPES.map((metricType) => {
              const unit = metricType.includes("volume") || metricType === "production" ? "czk" : "count";
              const placeholder = unit === "czk" ? "např. 500000" : "např. 10";
              return (
                <div key={metricType}>
                  <label className="block text-sm font-medium mb-1" style={{ color: "var(--wp-text-muted)" }}>
                    {METRIC_TYPE_LABELS[metricType]}
                  </label>
                  <input
                    type={unit === "czk" ? "number" : "number"}
                    min={0}
                    step={unit === "czk" ? 1000 : 1}
                    placeholder={placeholder}
                    value={targetValues[metricType] ?? ""}
                    onChange={(e) =>
                      setTargetValues((prev) => ({ ...prev, [metricType]: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded border min-h-[44px]"
                    style={{ borderColor: "var(--wp-border)" }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-4 border-t" style={{ borderColor: "var(--wp-border)" }}>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--wp-radius-sm)] font-medium min-h-[44px] disabled:opacity-50"
            style={{ background: "var(--wp-accent, #4f46e5)", color: "#fff" }}
          >
            {saving ? "Ukládám…" : isNew ? "Vytvořit plán" : "Uložit cíle"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--wp-radius-sm)] font-medium min-h-[44px] border"
            style={{ borderColor: "var(--wp-border)", color: "var(--wp-text)" }}
          >
            Zrušit
          </button>
        </div>
      </form>
    </BaseModal>
  );
}
