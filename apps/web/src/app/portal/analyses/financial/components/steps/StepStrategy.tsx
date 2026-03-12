"use client";

import { useFinancialAnalysisStore as useStore } from "@/lib/analyses/financial/store";
import { selectStrategyTotals } from "@/lib/analyses/financial/selectors";
import { getProductName, getStrategyProfileLabel, formatCzk, formatPercent } from "@/lib/analyses/financial/formatters";
import { TrendingUp, PieChart } from "lucide-react";

const PROFILE_OPTIONS = [
  { value: "dynamic" as const, label: "Dynamický" },
  { value: "balanced" as const, label: "Vyvážený" },
  { value: "conservative" as const, label: "Konzervativní" },
];

function getTypeLabel(type: string): string {
  if (type === "lump") return "Jednorázově";
  if (type === "monthly") return "Měsíčně";
  return "Penze";
}

export function StepStrategy() {
  const data = useStore((s) => s.data);
  const setStrategyProfile = useStore((s) => s.setStrategyProfile);
  const setConservativeMode = useStore((s) => s.setConservativeMode);
  const setInsurance = useStore((s) => s.setInsurance);
  const updateInvestment = useStore((s) => s.updateInvestment);

  const profile = data.strategy?.profile ?? "balanced";
  const conservativeMode = data.strategy?.conservativeMode ?? false;
  const invalidity50Plus = data.insurance?.invalidity50Plus ?? false;
  const investments = data.investments ?? [];
  const totals = selectStrategyTotals(data);

  const applyYieldOffset = (inv: (typeof investments)[0], offset: -1 | 0 | 1) => {
    const base = inv.annualRate ?? 0.06;
    const newRate = Math.round((base + offset * 0.01) * 100) / 100;
    const clamped = Math.max(0.01, Math.min(0.25, newRate));
    updateInvestment(inv.productKey, inv.type, "annualRate", clamped);
  };

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Investiční strategie</h2>
        <p className="text-slate-500 mt-1">Profil rizika a alokace do produktů – projekce FV.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <h3 className="text-slate-800 font-bold mb-4">Profil rizika</h3>
            <div className="flex flex-wrap gap-3 mb-4">
              {PROFILE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStrategyProfile(o.value)}
                  className={`min-h-[44px] px-5 py-2 rounded-xl font-semibold transition-colors ${
                    profile === o.value
                      ? "bg-indigo-500 text-white shadow"
                      : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={conservativeMode}
                onChange={(e) => setConservativeMode(e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400"
              />
              <span className="text-sm font-semibold text-slate-700">Konzervativní režim (snížené výnosy v projekci)</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer mt-4 pt-4 border-t border-slate-200">
              <input
                type="checkbox"
                checked={invalidity50Plus}
                onChange={(e) => setInsurance({ invalidity50Plus: e.target.checked })}
                className="w-5 h-5 rounded border-slate-300 text-indigo-500 focus:ring-indigo-400"
              />
              <span className="text-sm font-semibold text-slate-700">Pro osoby 50+ použít 50 % částky na invaliditu (dobrovolná volba poradce)</span>
            </label>
          </div>

          <div>
            <h3 className="text-slate-800 font-bold mb-4 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-indigo-600" />
              Produkty a částky
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {investments.map((inv) => (
                <div key={inv.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="font-bold text-slate-800 text-sm mb-2">{getProductName(inv.productKey)}</div>
                  <div className="text-xs text-slate-500 mb-2">{getTypeLabel(inv.type)}</div>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-slate-600">Zhodnocení:</span>
                    {([-1, 0, 1] as const).map((off) => (
                      <button
                        key={off}
                        type="button"
                        onClick={() => applyYieldOffset(inv, off)}
                        className="min-h-[36px] px-3 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700"
                      >
                        {off === -1 ? "−1 %" : off === 0 ? "0" : "+1 %"}
                      </button>
                    ))}
                    <span className="text-xs text-slate-500 ml-1">→ {(inv.annualRate ?? 0) * 100} % p.a.</span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-0.5">
                        {inv.type === "lump" ? "Částka (Kč)" : inv.type === "monthly" ? "Měsíčně (Kč)" : "Měsíčně (Kč)"}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={inv.amount || ""}
                        onChange={(e) => updateInvestment(inv.productKey, inv.type, "amount", parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-0.5">Roky</label>
                      <input
                        type="number"
                        min={1}
                        max={40}
                        value={inv.years || ""}
                        onChange={(e) => updateInvestment(inv.productKey, inv.type, "years", parseInt(e.target.value, 10) || 1)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 text-sm font-bold text-indigo-700">
                    FV: {formatCzk(inv.computed?.fv ?? 0)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-4 bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-slate-800 font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              Shrnutí portfolia
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-600 text-sm">Celková FV (projekce)</span>
                <span className="font-bold text-lg text-slate-900">{formatCzk(totals.totalFV)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Jednorázově vloženo</span>
                <span className="font-semibold text-slate-700">{formatCzk(totals.totalLump)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Měsíční vklady (součet)</span>
                <span className="font-semibold text-slate-700">{formatCzk(totals.totalMonthly)}</span>
              </div>
              <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-200">
                <span className="text-slate-500">Celkem investováno</span>
                <span className="font-semibold text-slate-700">{formatCzk(totals.totalInvested)}</span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200">
              <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Profil</span>
              <div className="font-semibold text-slate-800 mt-1">{getStrategyProfileLabel(profile)}</div>
              {conservativeMode && (
                <div className="text-xs text-indigo-700 mt-1">+ konzervativní režim</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
