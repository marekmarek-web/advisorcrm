"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useFinancialAnalysisStore as useStore } from "@/lib/analyses/financial/store";
import { selectTotalMonthlySavings, selectTotalTargetCapital } from "@/lib/analyses/financial/selectors";
import { getGoalChartData } from "@/lib/analyses/financial/charts";
import { formatCzk } from "@/lib/analyses/financial/formatters";
import { Target, Plus, Trash2, Pencil } from "lucide-react";
import clsx from "clsx";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";

/**
 * Chart komponenta je těžká (`chart.js` + `react-chartjs-2` ≈ 200 kB).
 * Dynamický import s `ssr: false` sebere ji z hlavního bundlu wizardu a
 * stáhne teprve když uživatel dorazí ke kroku Cíle a má co vykreslit.
 */
const StepGoalsChart = dynamic(
  () => import("./StepGoalsChart").then((m) => m.StepGoalsChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full animate-pulse rounded-xl bg-[color:var(--wp-surface-muted)]" />
    ),
  },
);

const GOAL_TYPES = [
  { value: "renta", label: "Finanční nezávislost (Renta)" },
  { value: "deti", label: "Děti (Studium / Start)" },
  { value: "bydleni", label: "Bydlení (Koupě / Rekonstrukce)" },
  { value: "auto", label: "Krátkodobý cíl (Auto / Svatba)" },
  { value: "jine", label: "Jiný cíl" },
] as const;

const STRATEGY_OPTIONS = [
  { value: 0.05, label: "Konzervativní (5 % p.a.)" },
  { value: 0.07, label: "Vyvážená (7 % p.a.)" },
  { value: 0.09, label: "Dynamická (9 % p.a.)" },
  { value: 0.12, label: "Dynamická+ (12 % p.a.)" },
] as const;

export function StepGoals() {
  const data = useStore((s) => s.data);
  const addGoal = useStore((s) => s.addGoal);
  const updateGoal = useStore((s) => s.updateGoal);
  const removeGoal = useStore((s) => s.removeGoal);

  const [type, setType] = useState<string>("renta");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState(0);
  const [horizon, setHorizon] = useState(10);
  const [strategy, setStrategy] = useState(0.07);
  const [initial, setInitial] = useState(0);
  const [lumpsum, setLumpsum] = useState(0);
  const [useInflationFV, setUseInflationFV] = useState(true);
  const [pensionDeduction, setPensionDeduction] = useState(false);
  const [pensionAmount, setPensionAmount] = useState(0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [chartGoalId, setChartGoalId] = useState<number | null>(null);

  const goals = data.goals || [];
  const totalMonthly = selectTotalMonthlySavings(data);
  const totalTarget = selectTotalTargetCapital(data);
  const chartGoal = (chartGoalId != null ? goals.find((g) => g.id === chartGoalId) : null) ?? goals[0] ?? null;

  const handleAdd = () => {
    const goalData = {
      type, name, amount, horizon, strategy, initial, lumpsum,
      useInflationFV: type === "renta" ? useInflationFV : undefined,
      pensionDeduction: type === "renta" ? pensionDeduction : undefined,
      pensionAmount: type === "renta" && pensionDeduction ? pensionAmount : undefined,
    };
    if (editingId != null) {
      updateGoal(editingId, goalData);
      setEditingId(null);
    } else {
      addGoal(goalData);
    }
    setName("");
    setAmount(0);
    setHorizon(10);
    setInitial(0);
    setLumpsum(0);
    setUseInflationFV(true);
    setPensionDeduction(false);
    setPensionAmount(0);
  };

  const handleEdit = (g: (typeof goals)[0]) => {
    setType(g.type ?? "renta");
    setName(g.name);
    setAmount(g.amount ?? 0);
    setHorizon(g.horizon ?? g.years ?? 10);
    setStrategy(g.annualRate ?? 0.07);
    setInitial(g.initialAmount ?? 0);
    setLumpsum(g.lumpSumNow ?? 0);
    setUseInflationFV(g.useInflationFV ?? true);
    setPensionDeduction(g.pensionDeduction ?? false);
    setPensionAmount(g.pensionAmount ?? 0);
    setEditingId(g.id);
  };

  const chartData = chartGoal
    ? (() => {
        const { labels, targetData, projectionData } = getGoalChartData(chartGoal);
        return {
          labels: labels.map(String),
          datasets: [
            {
              label: "Cíl (FV)",
              data: targetData,
              borderColor: "rgb(148, 163, 184)",
              backgroundColor: "rgba(148, 163, 184, 0.1)",
              borderDash: [5, 5],
              fill: false,
            },
            {
              label: "Projekce (spoření)",
              data: projectionData,
              borderColor: "rgb(99, 102, 241)",
              backgroundColor: "rgba(99, 102, 241, 0.2)",
              fill: true,
            },
          ],
        };
      })()
    : null;

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-[color:var(--wp-text)]">Finanční cíle</h2>
          <p className="text-[color:var(--wp-text-secondary)] mt-1">Cílový kapitál nebo důchod – FV a měsíční spoření.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-lg px-4 py-2 shadow-sm">
            <span className="text-xs text-[color:var(--wp-text-secondary)] uppercase font-bold tracking-wider block">Celkem cílový kapitál</span>
            <span className="text-lg font-bold text-[color:var(--wp-text)]">{formatCzk(totalTarget)}</span>
          </div>
          <div className="bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-lg px-4 py-2 shadow-sm">
            <span className="text-xs text-[color:var(--wp-text-secondary)] uppercase font-bold tracking-wider block">Měsíčně spoření</span>
            <span className="text-lg font-bold text-indigo-700">{formatCzk(totalMonthly)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-[color:var(--wp-surface-muted)] p-6 rounded-2xl border border-[color:var(--wp-surface-card-border)]">
          <h3 className="text-[color:var(--wp-text)] font-bold mb-6 flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-600" />
            {editingId != null ? "Upravit cíl" : "Přidat cíl"}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Typ cíle</label>
              <CustomDropdown
                value={type}
                onChange={(id) => setType(id)}
                options={GOAL_TYPES.map((o) => ({ id: o.value, label: o.label }))}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Název cíle</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Důchod, bydlení, auto…" className="w-full px-4 py-2 border border-[color:var(--wp-surface-card-border)] rounded-xl" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">
                {type === "renta" ? "Cílový měsíční příjem (Kč)" : "Cílový kapitál (Kč)"}
              </label>
              <input type="number" value={amount || ""} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} className="w-full px-4 py-2 border border-[color:var(--wp-surface-card-border)] rounded-xl" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Horizont (roky)</label>
              <input type="number" min={1} max={50} value={horizon} onChange={(e) => setHorizon(parseInt(e.target.value, 10) || 1)} className="w-full px-4 py-2 border border-[color:var(--wp-surface-card-border)] rounded-xl" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Strategie zhodnocení</label>
              <CustomDropdown
                value={String(strategy)}
                onChange={(id) => setStrategy(parseFloat(id))}
                options={STRATEGY_OPTIONS.map((o) => ({ id: String(o.value), label: o.label }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Počáteční vklad (Kč)</label>
                <input type="number" value={initial || ""} onChange={(e) => setInitial(parseFloat(e.target.value) || 0)} className="w-full px-4 py-2 border border-[color:var(--wp-surface-card-border)] rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Jednorázově nyní (Kč)</label>
                <input type="number" value={lumpsum || ""} onChange={(e) => setLumpsum(parseFloat(e.target.value) || 0)} className="w-full px-4 py-2 border border-[color:var(--wp-surface-card-border)] rounded-xl" />
              </div>
            </div>
            {type === "renta" && (
              <div className="space-y-3 bg-[color:var(--wp-surface-card)] p-4 rounded-xl border border-[color:var(--wp-surface-card-border)]">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useInflationFV}
                    onChange={(e) => setUseInflationFV(e.target.checked)}
                    className="w-5 h-5 rounded border-[color:var(--wp-border-strong)] text-indigo-500"
                  />
                  <span className="text-sm font-semibold text-[color:var(--wp-text-secondary)]">Započítat inflaci do FV (3 % p.a.)</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pensionDeduction}
                    onChange={(e) => setPensionDeduction(e.target.checked)}
                    className="w-5 h-5 rounded border-[color:var(--wp-border-strong)] text-indigo-500"
                  />
                  <span className="text-sm font-semibold text-[color:var(--wp-text-secondary)]">Započítat důchod (snižuje potřebný kapitál)</span>
                </label>
                {pensionDeduction && (
                  <div>
                    <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">Očekávaný měsíční důchod (Kč)</label>
                    <input
                      type="number"
                      value={pensionAmount || ""}
                      onChange={(e) => setPensionAmount(parseFloat(e.target.value) || 0)}
                      className="w-full px-4 py-2 border border-[color:var(--wp-surface-card-border)] rounded-xl"
                    />
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={handleAdd} className={clsx(portalPrimaryButtonClassName, "min-h-[44px] flex-1")}>
                <Plus className="w-5 h-5" /> {editingId != null ? "Uložit" : "Přidat cíl"}
              </button>
              {editingId != null && (
                <button type="button" onClick={() => { setEditingId(null); setName(""); setAmount(0); setHorizon(10); setInitial(0); setLumpsum(0); setUseInflationFV(true); setPensionDeduction(false); setPensionAmount(0); }} className="min-h-[44px] px-4 rounded-xl border border-[color:var(--wp-border-strong)] text-[color:var(--wp-text-secondary)] font-semibold">Zrušit</button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-[color:var(--wp-surface-muted)] p-6 rounded-2xl border border-[color:var(--wp-surface-card-border)]">
          <h3 className="text-[color:var(--wp-text)] font-bold mb-4">Seznam cílů</h3>
          {goals.length === 0 ? (
            <p className="text-[color:var(--wp-text-secondary)] text-sm">Zatím žádné cíle. Přidejte je v levém formuláři.</p>
          ) : (
            <ul className="space-y-3 mb-6">
              {goals.map((g) => (
                <li key={g.id} className="bg-[color:var(--wp-surface-card)] rounded-xl p-4 border border-[color:var(--wp-surface-card-border)] flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[color:var(--wp-text)]">{g.name}</div>
                    <div className="text-sm text-[color:var(--wp-text-secondary)]">{g.type === "renta" ? "Renta" : "Kapitál"} · {formatCzk(g.computed?.fvTarget ?? 0)} · {g.horizon ?? g.years} let</div>
                    <div className="text-sm font-bold text-indigo-700 mt-1">Měsíčně {formatCzk(g.computed?.pmt ?? 0)}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button type="button" onClick={() => { handleEdit(g); setChartGoalId(g.id); }} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] rounded-lg" aria-label="Upravit"><Pencil className="w-4 h-4" /></button>
                    <button type="button" onClick={() => removeGoal(g.id)} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 dark:hover:text-red-400" aria-label="Odebrat"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {goals.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-bold text-[color:var(--wp-text-secondary)] mb-2">Vývoj hodnoty v čase</h4>
              <div className="flex flex-wrap gap-2 mb-3">
                {goals.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setChartGoalId(g.id)}
                    className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-semibold ${chartGoalId === g.id ? "bg-indigo-500 text-white" : "bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"}`}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
              {chartData && (
                <div className="h-64 w-full">
                  <StepGoalsChart data={chartData} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
