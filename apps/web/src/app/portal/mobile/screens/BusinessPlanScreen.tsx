"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
import { getCurrentPeriodNumbers } from "@/lib/business-plan/types";
import {
  AIInsightCard,
  BottomSheet,
  EmptyState,
  ErrorState,
  KPIProgressCard,
  LoadingSkeleton,
  MobileCard,
  MobileSection,
} from "@/app/shared/mobile-ui/primitives";

type VisionDraft = { id: string; title: string; progressPct: number; sortOrder: number };

function pickMetric(progressResult: PlanProgressResult | null, metricType: string): { actual: number; target: number; unit: string } {
  const metric = progressResult?.progress.metrics.find((item) => item.metricType === metricType);
  return { actual: metric?.actual ?? 0, target: metric?.target ?? 0, unit: metric?.unit === "czk" ? "Kč" : "" };
}

export function BusinessPlanScreen() {
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

  const production = useMemo(() => pickMetric(progressResult, "production"), [progressResult]);
  const meetings = useMemo(() => pickMetric(progressResult, "meetings"), [progressResult]);
  const newClients = useMemo(() => pickMetric(progressResult, "new_clients"), [progressResult]);

  function loadData() {
    startTransition(async () => {
      setError(null);
      try {
        const [activePlan, rows] = await Promise.all([getActivePlan(periodType), getVisionGoals()]);
        setPlan(activePlan);
        const result = activePlan?.planId ? await getPlanProgress(activePlan.planId) : null;
        setProgressResult(result);
        setVision(rows.map((row) => ({ id: row.id, title: row.title, progressPct: row.progressPct, sortOrder: row.sortOrder })));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Business plan se nepodařilo načíst.");
      }
    });
  }

  useEffect(() => {
    loadData();
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
        const periodNumber = periodType === "month" ? month : periodType === "quarter" ? quarter : 0;
        const label = periodType === "month"
          ? new Date(year, month - 1, 1).toLocaleString("cs-CZ", { month: "long", year: "numeric" })
          : periodType === "quarter"
            ? `Q${periodNumber} ${year}`
            : String(year);

        const planId =
          plan?.planId ??
          (await createBusinessPlan({
            periodType,
            year,
            periodNumber,
            title: label,
          }));

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
      (vision.length > 0 ? vision : [{ id: "tmp-1", title: "Moje finanční vize", progressPct: 20, sortOrder: 0 }]).map((item, idx) => ({
        ...item,
        sortOrder: idx,
      }))
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

  return (
    <>
      {error ? <ErrorState title={error} onRetry={loadData} /> : null}
      {pending && !plan && !progressResult ? <LoadingSkeleton rows={3} /> : null}

      <MobileSection title="Business plán">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { id: "month", label: "Měsíc" },
            { id: "quarter", label: "Kvartál" },
            { id: "year", label: "Rok" },
          ].map((period) => (
            <button
              key={period.id}
              type="button"
              onClick={() => setPeriodType(period.id as PeriodType)}
              className={`min-h-[36px] rounded-lg border px-3 text-xs font-bold whitespace-nowrap ${
                periodType === period.id ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-slate-200 text-slate-600"
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </MobileSection>

      <MobileSection
        title={plan?.periodLabel || "Aktuální období"}
        action={
          <button type="button" onClick={openTargets} className="min-h-[32px] rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 px-2.5 text-xs font-bold">
            Upravit cíle
          </button>
        }
      >
        {!plan ? (
          <EmptyState title="Plán není nastavený" description="Nastavte cíle pro produkci, schůzky a nové klienty." />
        ) : (
          <>
            <KPIProgressCard label="Produkce" actual={production.actual} target={production.target} unit={production.unit || "Kč"} tone="info" />
            <KPIProgressCard label="Schůzky" actual={meetings.actual} target={meetings.target} tone="success" />
            <KPIProgressCard label="Noví klienti" actual={newClients.actual} target={newClients.target} tone="warning" />
          </>
        )}
      </MobileSection>

      <MobileSection
        title="Osobní vize"
        action={
          <button type="button" onClick={openVision} className="min-h-[32px] rounded-lg border border-slate-200 px-2.5 text-xs font-bold">
            Upravit
          </button>
        }
      >
        {vision.length === 0 ? (
          <EmptyState title="Žádná vize" description="Přidejte cíle, které chcete dlouhodobě splnit." />
        ) : (
          vision.slice(0, 3).map((item) => (
            <MobileCard key={item.id} className="p-3.5">
              <p className="text-sm font-bold text-slate-900">{item.title}</p>
              <p className="text-xs text-slate-500 mt-1">Progress: {item.progressPct}%</p>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, item.progressPct))}%` }} />
              </div>
            </MobileCard>
          ))
        )}
      </MobileSection>

      {progressResult?.recommendations?.[0]?.title ? (
        <AIInsightCard title="AI doporučení" insight={progressResult.recommendations[0].title} />
      ) : null}

      <BottomSheet open={targetsOpen} onClose={() => setTargetsOpen(false)} title="Upravit cíle">
        <div className="space-y-3">
          <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">Produkce (Kč)</label>
          <input type="number" value={targetProduction} onChange={(e) => setTargetProduction(Number(e.target.value || 0))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" />
          <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">Schůzky</label>
          <input type="number" value={targetMeetings} onChange={(e) => setTargetMeetings(Number(e.target.value || 0))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" />
          <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">Noví klienti</label>
          <input type="number" value={targetNewClients} onChange={(e) => setTargetNewClients(Number(e.target.value || 0))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" />
          <button type="button" onClick={saveTargets} className="w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold">
            Uložit cíle
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={visionOpen} onClose={() => setVisionOpen(false)} title="Osobní vize">
        <div className="space-y-3">
          {visionDraft.map((item, idx) => (
            <div key={`${item.id}-${idx}`} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <input
                type="text"
                value={item.title}
                onChange={(e) =>
                  setVisionDraft((prev) => prev.map((row, rowIdx) => (rowIdx === idx ? { ...row, title: e.target.value } : row)))
                }
                className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm"
                placeholder="Název cíle"
              />
              <input
                type="number"
                value={item.progressPct}
                onChange={(e) =>
                  setVisionDraft((prev) =>
                    prev.map((row, rowIdx) => (rowIdx === idx ? { ...row, progressPct: Number(e.target.value || 0) } : row))
                  )
                }
                className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm"
                placeholder="Progress %"
              />
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
            className="w-full min-h-[40px] rounded-lg border border-slate-200 text-sm font-bold"
          >
            Přidat cíl
          </button>
          <button type="button" onClick={saveVision} className="w-full min-h-[44px] rounded-xl bg-[#1a1c2e] text-white text-sm font-bold">
            Uložit vizi
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
