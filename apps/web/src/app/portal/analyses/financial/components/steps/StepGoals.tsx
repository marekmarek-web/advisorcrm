"use client";

import { useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useFinancialAnalysisStore as useStore } from "@/lib/analyses/financial/store";
import { selectTotalMonthlySavings, selectTotalTargetCapital } from "@/lib/analyses/financial/selectors";
import { getGoalChartData } from "@/lib/analyses/financial/charts";
import { formatCzk } from "@/lib/analyses/financial/formatters";
import { Target, Plus, Trash2, Pencil } from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [chartGoalId, setChartGoalId] = useState<number | null>(null);

  const goals = data.goals || [];
  const totalMonthly = selectTotalMonthlySavings(data);
  const totalTarget = selectTotalTargetCapital(data);
  const chartGoal = (chartGoalId != null ? goals.find((g) => g.id === chartGoalId) : null) ?? goals[0] ?? null;

  const handleAdd = () => {
    if (editingId != null) {
      updateGoal(editingId, { type, name, amount, horizon, strategy, initial, lumpsum });
      setEditingId(null);
    } else {
      addGoal({ type, name, amount, horizon, strategy, initial, lumpsum });
    }
    setName("");
    setAmount(0);
    setHorizon(10);
    setInitial(0);
    setLumpsum(0);
  };

  const handleEdit = (g: (typeof goals)[0]) => {
    setType(g.type ?? "renta");
    setName(g.name);
    setAmount(g.amount ?? 0);
    setHorizon(g.horizon ?? g.years ?? 10);
    setStrategy(g.annualRate ?? 0.07);
    setInitial(g.initialAmount ?? 0);
    setLumpsum(g.lumpSumNow ?? 0);
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
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Finanční cíle</h2>
          <p className="text-slate-500 mt-1">Cílový kapitál nebo důchod – FV a měsíční spoření.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block">Celkem cílový kapitál</span>
            <span className="text-lg font-bold text-slate-800">{formatCzk(totalTarget)}</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 shadow-sm">
            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block">Měsíčně spoření</span>
            <span className="text-lg font-bold text-indigo-700">{formatCzk(totalMonthly)}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <h3 className="text-slate-800 font-bold mb-6 flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-600" />
            {editingId != null ? "Upravit cíl" : "Přidat cíl"}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Typ cíle</label>
              <select value={type} onChange={(e) => setType(e.target.value as "renta" | "jina")} className="w-full px-4 py-2 border border-slate-200 rounded-xl">
                {GOAL_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Název cíle</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Důchod, bydlení, auto…" className="w-full px-4 py-2 border border-slate-200 rounded-xl" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {type === "renta" ? "Cílový měsíční příjem (Kč)" : "Cílový kapitál (Kč)"}
              </label>
              <input type="number" value={amount || ""} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} className="w-full px-4 py-2 border border-slate-200 rounded-xl" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Horizont (roky)</label>
              <input type="number" min={1} max={50} value={horizon} onChange={(e) => setHorizon(parseInt(e.target.value, 10) || 1)} className="w-full px-4 py-2 border border-slate-200 rounded-xl" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Strategie zhodnocení</label>
              <select value={strategy} onChange={(e) => setStrategy(parseFloat(e.target.value))} className="w-full px-4 py-2 border border-slate-200 rounded-xl">
                {STRATEGY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Počáteční vklad (Kč)</label>
                <input type="number" value={initial || ""} onChange={(e) => setInitial(parseFloat(e.target.value) || 0)} className="w-full px-4 py-2 border border-slate-200 rounded-xl" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Jednorázově nyní (Kč)</label>
                <input type="number" value={lumpsum || ""} onChange={(e) => setLumpsum(parseFloat(e.target.value) || 0)} className="w-full px-4 py-2 border border-slate-200 rounded-xl" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleAdd} className="min-h-[44px] flex-1 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500">
                <Plus className="w-5 h-5" /> {editingId != null ? "Uložit" : "Přidat cíl"}
              </button>
              {editingId != null && (
                <button type="button" onClick={() => { setEditingId(null); setName(""); setAmount(0); setHorizon(10); setInitial(0); setLumpsum(0); }} className="min-h-[44px] px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold">Zrušit</button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <h3 className="text-slate-800 font-bold mb-4">Seznam cílů</h3>
          {goals.length === 0 ? (
            <p className="text-slate-500 text-sm">Zatím žádné cíle. Přidejte je v levém formuláři.</p>
          ) : (
            <ul className="space-y-3 mb-6">
              {goals.map((g) => (
                <li key={g.id} className="bg-white rounded-xl p-4 border border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800">{g.name}</div>
                    <div className="text-sm text-slate-500">{g.type === "renta" ? "Renta" : "Kapitál"} · {formatCzk(g.computed?.fvTarget ?? 0)} · {g.horizon ?? g.years} let</div>
                    <div className="text-sm font-bold text-indigo-700 mt-1">Měsíčně {formatCzk(g.computed?.pmt ?? 0)}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button type="button" onClick={() => { handleEdit(g); setChartGoalId(g.id); }} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-lg" aria-label="Upravit"><Pencil className="w-4 h-4" /></button>
                    <button type="button" onClick={() => removeGoal(g.id)} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-red-600 hover:bg-red-50 rounded-lg" aria-label="Odebrat"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {goals.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-bold text-slate-700 mb-2">Vývoj hodnoty v čase</h4>
              <div className="flex flex-wrap gap-2 mb-3">
                {goals.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setChartGoalId(g.id)}
                    className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-semibold ${chartGoalId === g.id ? "bg-indigo-500 text-white" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
              {chartData && (
                <div className="h-64 w-full">
                  <Line
                    data={chartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        x: { title: { display: true, text: "Rok" } },
                        y: { title: { display: true, text: "Kč" }, ticks: { callback: (v) => (typeof v === "number" ? formatCzk(v) : v) } },
                      },
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
