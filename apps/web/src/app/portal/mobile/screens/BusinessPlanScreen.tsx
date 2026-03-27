"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Target,
  TrendingUp,
  Users,
  Calendar,
  Sparkles,
  Plus,
  Trash2,
  ChevronRight,
} from "lucide-react";
import type { PeriodType } from "@/lib/business-plan/types";
import {
  createBusinessPlan,
  getActivePlan,
  getPlanProgress,
  getVisionGoals,
  setPlanTargets,
  upsertVisionGoals,
  type PlanProgressResult,
  type PlanWithTargetsRow,
} from "@/app/actions/business-plan";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import { getCurrentPeriodNumbers } from "@/lib/business-plan/types";
import {
  AIInsightCard,
  BottomSheet,
  EmptyState,
  ErrorState,
  FilterChips,
  MobileCard,
  MobileSection,
} from "@/app/shared/mobile-ui/primitives";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type VisionDraft = { id: string; title: string; progressPct: number; sortOrder: number };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function pickMetric(
  progressResult: PlanProgressResult | null,
  metricType: string
): { actual: number; target: number; unit: string; health: string } {
  const metric = progressResult?.progress.metrics.find((item) => item.metricType === metricType);
  return {
    actual: metric?.actual ?? 0,
    target: metric?.target ?? 0,
    unit: metric?.unit === "czk" ? "Kč" : "",
    health: metric?.health ?? "ok",
  };
}

function HealthBadge({ health }: { health: string }) {
  const config =
    health === "critical"
      ? { cls: "bg-rose-50 text-rose-600 border-rose-200", label: "Kritické" }
      : health === "warning"
        ? { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Pozor" }
        : { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "OK" };
  return (
    <span className={cx("text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-lg border", config.cls)}>
      {config.label}
    </span>
  );
}

function MetricCard({
  label,
  actual,
  target,
  unit,
  health,
  icon: Icon,
}: {
  label: string;
  actual: number;
  target: number;
  unit: string;
  health: string;
  icon: React.ElementType;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  const barColor =
    health === "critical"
      ? "bg-rose-500"
      : health === "warning"
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <MobileCard className="p-3.5">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[color:var(--wp-surface-muted)] flex items-center justify-center flex-shrink-0">
            <Icon size={15} className="text-[color:var(--wp-text-secondary)]" />
          </div>
          <p className="text-xs font-black uppercase tracking-wider text-[color:var(--wp-text-secondary)]">{label}</p>
        </div>
        <HealthBadge health={health} />
      </div>
      <p className="text-xl font-black text-[color:var(--wp-text)] tabular-nums">
        {actual.toLocaleString("cs-CZ")}
        {unit ? <span className="text-sm font-bold text-[color:var(--wp-text-secondary)] ml-1">{unit}</span> : null}
      </p>
      <div className="flex items-center justify-between mt-1">
        <p className="text-[11px] text-[color:var(--wp-text-tertiary)]">
          Cíl: {target.toLocaleString("cs-CZ")}
          {unit ? ` ${unit}` : ""}
        </p>
        <p className="text-[11px] font-black text-[color:var(--wp-text-secondary)]">{pct}%</p>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-[color:var(--wp-surface-muted)] overflow-hidden">
        <div className={cx("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
      </div>
    </MobileCard>
  );
}

function VisionCard({ item }: { item: VisionDraft }) {
  const pct = Math.max(0, Math.min(100, item.progressPct));
  const isDone = pct >= 100;
  return (
    <MobileCard className="p-3.5">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-bold text-[color:var(--wp-text)]">{item.title}</p>
        <span
          className={cx(
            "text-[10px] font-black px-1.5 py-0.5 rounded-lg flex-shrink-0",
            isDone ? "bg-emerald-50 text-emerald-700" : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]"
          )}
        >
          {pct}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-[color:var(--wp-surface-muted)] overflow-hidden">
        <div
          className={cx("h-full rounded-full transition-all", isDone ? "bg-emerald-500" : "bg-indigo-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </MobileCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Screen                                                        */
/* ------------------------------------------------------------------ */

export function BusinessPlanScreen({ deviceClass = "phone" }: { deviceClass?: DeviceClass }) {
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [plan, setPlan] = useState<PlanWithTargetsRow | null>(null);
  const [progressResult, setProgressResult] = useState<PlanProgressResult | null>(null);
  const [vision, setVision] = useState<VisionDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [targetsOpen, setTargetsOpen] = useState(false);
  const [visionOpen, setVisionOpen] = useState(false);
  const [targetProduction, setTargetProduction] = useState(300000);
  const [targetMeetings, setTargetMeetings] = useState(25);
  const [targetNewClients, setTargetNewClients] = useState(6);
  const [visionDraft, setVisionDraft] = useState<VisionDraft[]>([]);

  const isTablet = deviceClass === "tablet";

  const production = useMemo(() => pickMetric(progressResult, "production"), [progressResult]);
  const meetings = useMemo(() => pickMetric(progressResult, "meetings"), [progressResult]);
  const newClients = useMemo(() => pickMetric(progressResult, "new_clients"), [progressResult]);

  const overallHealth = progressResult?.progress.overallHealth ?? "ok";

  function loadData() {
    startTransition(async () => {
      setError(null);
      try {
        const [activePlan, visionRows] = await Promise.all([
          getActivePlan(periodType),
          getVisionGoals(),
        ]);
        setPlan(activePlan);
        const result = activePlan?.planId ? await getPlanProgress(activePlan.planId) : null;
        setProgressResult(result);
        setVision(
          visionRows.map((row) => ({
            id: row.id,
            title: row.title,
            progressPct: row.progressPct,
            sortOrder: row.sortOrder,
          }))
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Business plan se nepodařilo načíst.");
      }
    });
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodType]);

  function openTargets() {
    setTargetProduction(production.target || 300000);
    setTargetMeetings(meetings.target || 25);
    setTargetNewClients(newClients.target || 6);
    setTargetsOpen(true);
  }

  async function saveTargets() {
    startTransition(async () => {
      setError(null);
      try {
        const { year, month, quarter } = getCurrentPeriodNumbers();
        const periodNumber =
          periodType === "month" ? month : periodType === "quarter" ? quarter : 0;
        const label =
          periodType === "month"
            ? new Date(year, month - 1, 1).toLocaleString("cs-CZ", {
                month: "long",
                year: "numeric",
              })
            : periodType === "quarter"
              ? `Q${periodNumber} ${year}`
              : String(year);

        const planId =
          plan?.planId ??
          (await createBusinessPlan({ periodType, year, periodNumber, title: label }));

        await setPlanTargets(planId, [
          { metricType: "production", targetValue: Number(targetProduction), unit: "czk" },
          { metricType: "meetings", targetValue: Number(targetMeetings), unit: "count" },
          { metricType: "new_clients", targetValue: Number(targetNewClients), unit: "count" },
        ]);
        setTargetsOpen(false);
        loadData();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Cíle se nepodařilo uložit.");
      }
    });
  }

  function openVision() {
    setVisionDraft(
      (vision.length > 0
        ? vision
        : [{ id: "tmp-1", title: "Moje finanční vize", progressPct: 20, sortOrder: 0 }]
      ).map((item, idx) => ({ ...item, sortOrder: idx }))
    );
    setVisionOpen(true);
  }

  async function saveVision() {
    startTransition(async () => {
      setError(null);
      try {
        await upsertVisionGoals(
          visionDraft.map((item, idx) => ({
            title: item.title.trim(),
            progressPct: Math.max(0, Math.min(100, Number(item.progressPct) || 0)),
            sortOrder: idx,
          }))
        );
        setVisionOpen(false);
        loadData();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Vize se nepodařila uložit.");
      }
    });
  }

  if (pending && !plan && !progressResult) {
    return (
      <div className="min-h-[50vh] space-y-0 pb-6">
        <div className="h-28 bg-gradient-to-br from-[#0a0f29] to-indigo-950 animate-pulse rounded-b-2xl" />
        <div className="px-4 py-3 flex gap-2 bg-[color:var(--wp-surface-card)] border-b border-[color:var(--wp-surface-card-border)]">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 w-20 rounded-xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse" />
          ))}
        </div>
        <div className="px-4 pt-3 grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse" />
          ))}
        </div>
        <div className="px-4 mt-3 space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-[color:var(--wp-surface-card-border)]/70 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const hasPlanData = plan !== null || progressResult !== null;

  return (
    <>
      {error ? <ErrorState title={error} onRetry={loadData} /> : null}
      <div
        className={cx(
          "pb-6",
          pending && hasPlanData && "opacity-60 pointer-events-none transition-opacity duration-200"
        )}
      >
      {/* Hero */}
      <div className="bg-gradient-to-br from-[#0a0f29] to-indigo-950 px-4 pt-4 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
              Business plán
            </p>
            <h2 className="text-lg font-black text-white mt-1">
              {plan?.periodLabel ?? "Aktuální období"}
            </h2>
            {plan ? (
              <div className="mt-2 flex items-center gap-2">
                <HealthBadge health={overallHealth} />
                <span className="text-xs text-indigo-200">
                  {production.actual > 0
                    ? `${Math.round((production.actual / (production.target || 1)) * 100)}% produkce`
                    : "Žádná data"}
                </span>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={openTargets}
            className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl bg-[color:var(--wp-surface-card)]/10 border border-white/20 text-white text-xs font-bold"
          >
            <Target size={13} /> Cíle
          </button>
        </div>
      </div>

      {/* Period filter */}
      <div className="px-4 py-3 bg-[color:var(--wp-surface-card)] border-b border-[color:var(--wp-surface-card-border)]">
        <FilterChips
          value={periodType}
          onChange={(id) => setPeriodType(id as PeriodType)}
          options={[
            { id: "month", label: "Měsíc" },
            { id: "quarter", label: "Kvartál" },
            { id: "year", label: "Rok" },
          ]}
        />
      </div>

      {/* No plan CTA */}
      {!plan ? (
        <MobileSection>
          <MobileCard className="border-dashed border-indigo-200 bg-indigo-50/40 p-4 text-center">
            <Target size={24} className="text-indigo-400 mx-auto mb-2" />
            <p className="text-sm font-bold text-indigo-900">Plán není nastavený</p>
            <p className="text-xs text-indigo-600/80 mt-1 mb-3">
              Nastavte cíle produkce, schůzek a nových klientů.
            </p>
            <button
              type="button"
              onClick={openTargets}
              className="min-h-[44px] w-full rounded-xl bg-indigo-600 text-white text-sm font-bold"
            >
              Nastavit cíle
            </button>
          </MobileCard>
        </MobileSection>
      ) : null}

      {/* KPI metrics */}
      {plan ? (
        <MobileSection
          title="Klíčové metriky"
          action={
            <button
              type="button"
              onClick={openTargets}
              className="flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg min-h-[32px]"
            >
              Upravit <ChevronRight size={10} />
            </button>
          }
        >
          <div className={cx("grid gap-2", isTablet ? "grid-cols-3" : "grid-cols-1")}>
            <MetricCard
              label="Produkce"
              actual={production.actual}
              target={production.target}
              unit="Kč"
              health={production.health}
              icon={TrendingUp}
            />
            <MetricCard
              label="Schůzky"
              actual={meetings.actual}
              target={meetings.target}
              unit=""
              health={meetings.health}
              icon={Calendar}
            />
            <MetricCard
              label="Noví klienti"
              actual={newClients.actual}
              target={newClients.target}
              unit=""
              health={newClients.health}
              icon={Users}
            />
          </div>
        </MobileSection>
      ) : null}

      {/* Interní AI přehled */}
      {(progressResult?.recommendations ?? []).length > 0 ? (
        <MobileSection title="Interní AI přehled">
          {progressResult!.recommendations.slice(0, 2).map((rec, i) => (
            <AIInsightCard
              key={i}
              title={rec.title}
              insight={rec.description ?? rec.title}
              action={
                rec.href ? (
                  <a
                    href={rec.href}
                    className="text-xs font-bold text-violet-700 flex items-center gap-1"
                  >
                    Otevřít <ChevronRight size={11} />
                  </a>
                ) : undefined
              }
            />
          ))}
        </MobileSection>
      ) : null}

      {/* Vision */}
      <MobileSection
        title="Osobní vize"
        action={
          <button
            type="button"
            onClick={openVision}
            className="flex items-center gap-1 text-[11px] font-bold text-[color:var(--wp-text-secondary)] border border-[color:var(--wp-surface-card-border)] px-2.5 py-1 rounded-lg min-h-[32px]"
          >
            Upravit
          </button>
        }
      >
        {vision.length === 0 ? (
          <MobileCard className="border-dashed p-4 text-center">
            <Sparkles size={20} className="text-[color:var(--wp-text-tertiary)] mx-auto mb-2" />
            <p className="text-sm font-bold text-[color:var(--wp-text-secondary)]">Žádná vize</p>
            <p className="text-xs text-[color:var(--wp-text-tertiary)] mt-1 mb-2">Přidejte dlouhodobé cíle.</p>
            <button
              type="button"
              onClick={openVision}
              className="text-xs font-bold text-indigo-600"
            >
              Přidat vizi
            </button>
          </MobileCard>
        ) : (
          <div className={cx("grid gap-2", isTablet ? "grid-cols-2" : "grid-cols-1")}>
            {vision.map((item) => (
              <VisionCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </MobileSection>
      </div>

      {/* ====== BOTTOM SHEETS ====== */}

      <BottomSheet open={targetsOpen} onClose={() => setTargetsOpen(false)} title="Upravit cíle">
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1 block">
              Produkce (Kč)
            </label>
            <input
              type="number"
              value={targetProduction}
              onChange={(e) => setTargetProduction(Number(e.target.value || 0))}
              className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1 block">
              Schůzky (počet)
            </label>
            <input
              type="number"
              value={targetMeetings}
              onChange={(e) => setTargetMeetings(Number(e.target.value || 0))}
              className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1 block">
              Noví klienti (počet)
            </label>
            <input
              type="number"
              value={targetNewClients}
              onChange={(e) => setTargetNewClients(Number(e.target.value || 0))}
              className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={saveTargets}
            className="w-full min-h-[48px] rounded-xl bg-indigo-600 text-white text-sm font-bold"
          >
            Uložit cíle
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={visionOpen} onClose={() => setVisionOpen(false)} title="Osobní vize">
        <div className="space-y-3">
          {visionDraft.map((item, idx) => (
            <div key={`${item.id}-${idx}`} className="space-y-2 rounded-xl border border-[color:var(--wp-surface-card-border)] p-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) =>
                    setVisionDraft((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, title: e.target.value } : row))
                    )
                  }
                  className="flex-1 min-h-[40px] rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 text-sm"
                  placeholder="Název cíle"
                />
                <button
                  type="button"
                  onClick={() => setVisionDraft((prev) => prev.filter((_, i) => i !== idx))}
                  className="w-9 h-9 rounded-lg border border-rose-200 bg-rose-50 flex items-center justify-center flex-shrink-0"
                >
                  <Trash2 size={14} className="text-rose-500" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={item.progressPct}
                  onChange={(e) =>
                    setVisionDraft((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, progressPct: Number(e.target.value) } : row
                      )
                    )
                  }
                  className="flex-1"
                />
                <span className="text-xs font-black text-[color:var(--wp-text-secondary)] w-10 text-right">
                  {item.progressPct}%
                </span>
              </div>
              <div className="h-1.5 bg-[color:var(--wp-surface-muted)] rounded-full overflow-hidden">
                <div
                  className={cx(
                    "h-full rounded-full",
                    item.progressPct >= 100 ? "bg-emerald-500" : "bg-indigo-500"
                  )}
                  style={{ width: `${item.progressPct}%` }}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setVisionDraft((prev) => [
                ...prev,
                { id: `tmp-${Date.now()}`, title: "", progressPct: 0, sortOrder: prev.length },
              ])
            }
            className="w-full min-h-[44px] rounded-xl border border-dashed border-indigo-300 text-indigo-600 text-sm font-bold flex items-center justify-center gap-2"
          >
            <Plus size={14} /> Přidat cíl
          </button>
          <CreateActionButton type="button" onClick={saveVision} className="min-h-[48px] w-full" icon={null}>
            Uložit vizi
          </CreateActionButton>
        </div>
      </BottomSheet>
    </>
  );
}
