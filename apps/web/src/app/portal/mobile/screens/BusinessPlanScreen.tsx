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
import type { PeriodType, PlanHealthStatus } from "@/lib/business-plan/types";
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
  MobileCard,
  MobileSection,
} from "@/app/shared/mobile-ui/primitives";
import {
  HeroCard,
  HeroAction,
  HeroMetaDot,
  InlineAlert,
  KpiCard,
  MetricGrid,
  SegmentPills,
  type KpiHealth,
} from "@/app/shared/portal-ui/primitives";
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
    unit: metric?.unit === "bj" ? "BJ" : metric?.unit === "czk" ? "Kč" : "",
    health: metric?.health ?? "ok",
  };
}

function mapHealth(health: string): KpiHealth {
  if (health === "critical") return "critical";
  if (health === "warning") return "warning";
  if (health === "ok") return "ok";
  return "neutral";
}

/** Zjednodušená 3-stavová paleta pro hero (PlanHealthStatus ≠ staré stringy critical/warning/ok). */
function overallHealthHeroTone(health: PlanHealthStatus): "critical" | "warning" | "ok" {
  if (health === "significant_slip") return "critical";
  if (health === "slight_slip" || health === "no_data") return "warning";
  return "ok";
}

function formatKpiValue(actual: number, unit: string): string {
  if (unit === "Kč") {
    if (actual >= 1_000_000) return `${(actual / 1_000_000).toFixed(1).replace(".", ",")} M`;
    if (actual >= 10_000) return `${Math.round(actual / 1_000)} tis.`;
  }
  return actual.toLocaleString("cs-CZ");
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
  const [targetProduction, setTargetProduction] = useState(100000);
  const [targetMeetings, setTargetMeetings] = useState(25);
  const [targetNewClients, setTargetNewClients] = useState(6);
  const [visionDraft, setVisionDraft] = useState<VisionDraft[]>([]);

  const isTablet = deviceClass === "tablet";

  const production = useMemo(() => pickMetric(progressResult, "production"), [progressResult]);
  const meetings = useMemo(() => pickMetric(progressResult, "meetings"), [progressResult]);
  const newClients = useMemo(() => pickMetric(progressResult, "new_clients"), [progressResult]);

  const overallHealth = progressResult?.progress.overallHealth ?? "no_data";
  const healthTone = overallHealthHeroTone(overallHealth);

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
    setTargetProduction(production.target || 100000);
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
          { metricType: "production", targetValue: Number(targetProduction), unit: "bj" },
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

  const productionPct =
    production.target > 0
      ? Math.max(0, Math.round((production.actual / production.target) * 100))
      : 0;

  return (
    <>
      <div
        className={cx(
          "space-y-3 px-4 pt-4 pb-6",
          pending && hasPlanData && "opacity-60 pointer-events-none transition-opacity duration-200"
        )}
      >
      {error ? (
        <InlineAlert
          tone="danger"
          title="Business plán se nepodařilo načíst"
          description={error}
          action={
            <button
              type="button"
              onClick={loadData}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 text-[11px] font-black uppercase tracking-wide text-rose-700 hover:bg-rose-50"
            >
              Zkusit znovu
            </button>
          }
        />
      ) : null}

      {/* Hero */}
      <HeroCard
        eyebrow="Business plán"
        title={plan?.periodLabel ?? "Aktuální období"}
        subtitle={
          plan
            ? production.target > 0
              ? `${productionPct} % produkce (${production.actual.toLocaleString("cs-CZ")} / ${production.target.toLocaleString("cs-CZ")} BJ)`
              : "Nastav cíle produkce, schůzek a nových klientů."
            : "Plán pro tohle období zatím neexistuje."
        }
        icon={<Target size={20} className="text-white" />}
        actions={
          <HeroAction onClick={openTargets}>
            <Target size={13} />
            {plan ? "Upravit" : "Nastavit"}
          </HeroAction>
        }
        meta={
          plan ? (
            <>
              <span
                className={cx(
                  "inline-flex items-center rounded-md border px-1.5 py-[2px] text-[10px] font-black uppercase tracking-wider",
                  healthTone === "critical"
                    ? "border-rose-300/30 bg-rose-500/20 text-rose-50"
                    : healthTone === "warning"
                      ? "border-amber-300/30 bg-amber-500/20 text-amber-50"
                      : "border-emerald-300/30 bg-emerald-500/20 text-emerald-50"
                )}
              >
                {healthTone === "critical" ? "Kritické" : healthTone === "warning" ? "Pozor" : "Na cestě"}
              </span>
              <HeroMetaDot />
              <span>
                {meetings.actual} / {meetings.target || 0} schůzek
              </span>
              <HeroMetaDot />
              <span>
                {newClients.actual} / {newClients.target || 0} klientů
              </span>
            </>
          ) : undefined
        }
      >
        {plan && production.target > 0 ? (
          <div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className={cx(
                  "h-full rounded-full transition-[width] duration-700",
                  healthTone === "critical"
                    ? "bg-rose-400"
                    : healthTone === "warning"
                      ? "bg-amber-400"
                      : "bg-emerald-400"
                )}
                style={{ width: `${Math.min(100, productionPct)}%` }}
              />
            </div>
          </div>
        ) : null}
      </HeroCard>

      {/* Period filter */}
      <SegmentPills
        label="Období"
        value={periodType}
        onChange={(id) => setPeriodType(id as PeriodType)}
        options={[
          { id: "month", label: "Měsíc" },
          { id: "quarter", label: "Kvartál" },
          { id: "year", label: "Rok" },
        ]}
      />

      {/* No plan CTA */}
      {!plan ? (
        <InlineAlert
          tone="info"
          title="Plán není nastavený"
          description="Nastavte cíle produkce, schůzek a nových klientů, abyste viděli progress v reálném čase."
          action={
            <button
              type="button"
              onClick={openTargets}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 text-[12px] font-black uppercase tracking-wide text-white shadow-[0_6px_18px_rgba(79,70,229,0.35)]"
            >
              <Target size={13} />
              Nastavit cíle
            </button>
          }
        />
      ) : null}

      {/* KPI metrics */}
      {plan ? (
        <MetricGrid cols={isTablet ? 3 : 2}>
          <KpiCard
            label="Produkce BJ"
            value={formatKpiValue(production.actual, "BJ")}
            unit="BJ"
            target={production.target || undefined}
            health={mapHealth(production.health)}
            icon={<TrendingUp size={14} />}
            variant="large"
          />
          <KpiCard
            label="Schůzky"
            value={meetings.actual}
            target={meetings.target || undefined}
            health={mapHealth(meetings.health)}
            icon={<Calendar size={14} />}
            variant="large"
          />
          <KpiCard
            label="Noví klienti"
            value={newClients.actual}
            target={newClients.target || undefined}
            health={mapHealth(newClients.health)}
            icon={<Users size={14} />}
            variant="large"
          />
        </MetricGrid>
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
              Produkce (BJ)
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
