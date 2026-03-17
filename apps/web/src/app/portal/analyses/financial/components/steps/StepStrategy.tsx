"use client";

import { useEffect } from "react";
import { useFinancialAnalysisStore as useStore } from "@/lib/analyses/financial/store";
import { selectStrategyTotals } from "@/lib/analyses/financial/selectors";
import { getProductName, getStrategyProfileLabel, formatCzk, getProfileRate } from "@/lib/analyses/financial/formatters";
import { FUND_DETAILS, FUND_LOGOS } from "@/lib/analyses/financial/constants";
import { TrendingUp, PieChart } from "lucide-react";
import { EmbeddedInvestmentProjection } from "@/app/portal/calculators/_components/investment/EmbeddedInvestmentProjection";

const RETIREMENT_AGE = 65;

const MIN_RATE = 0.01;
const MAX_RATE = 0.25;

/** Zaokrouhlí částku na celé stovky (bez desetinných míst). */
function roundToHundreds(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / 100) * 100;
}

/** Česká pluralizace roků: 1 rok, 2–4 roky, 5+ let. */
function pluralizeYears(n: number): string {
  if (n === 1) return "1 rok";
  if (n >= 2 && n <= 4) return `${n} roky`;
  return `${n} let`;
}

/** Vrátí možnosti zhodnocení: default−1 %, default, default+1 % (clamp 1–25 %), bez duplicit. */
function getYieldOptions(productKey: string): { value: number; label: string }[] {
  const detail = FUND_DETAILS[productKey];
  const defaultRate = detail?.defaultRate ?? 0.06;
  const seen = new Set<number>();
  return [-0.01, 0, 0.01]
    .map((off) => {
      const rate = Math.round((defaultRate + off) * 100) / 100;
      const clamped = Math.max(MIN_RATE, Math.min(MAX_RATE, rate));
      return { value: clamped, label: `${Math.round(clamped * 100)} %` };
    })
    .filter((o) => {
      if (seen.has(o.value)) return false;
      seen.add(o.value);
      return true;
    });
}

/** Pro select: pokud aktuální rate není v options, vrátí střední (default) hodnotu. */
function getSelectYield(productKey: string, currentRate: number | undefined): number {
  const opts = getYieldOptions(productKey);
  const rate = currentRate ?? FUND_DETAILS[productKey]?.defaultRate ?? 0.06;
  const exact = opts.find((o) => Math.abs(o.value - rate) < 0.001);
  if (exact) return exact.value;
  const mid = opts[Math.floor(opts.length / 2)];
  return mid?.value ?? 0.06;
}

const PROFILE_OPTIONS = [
  { value: "conservative" as const, label: "Konzervativní (5 %)" },
  { value: "balanced" as const, label: "Vyvážený (7 %)" },
  { value: "dynamic" as const, label: "Dynamický (9 %)" },
  { value: "dynamic_plus" as const, label: "Dynamický+ (12 %)" },
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
  const updateInvestment = useStore((s) => s.updateInvestment);

  const profile = data.strategy?.profile ?? "balanced";
  const conservativeMode = data.strategy?.conservativeMode ?? false;
  const investments = data.investments ?? [];
  const totals = selectStrategyTotals(data);

  const birthYear = parseInt(data.client?.birthDate ?? "", 10);
  const clientAge = !isNaN(birthYear) ? new Date().getFullYear() - birthYear : null;
  const yearsToRetirement = clientAge != null ? Math.max(1, RETIREMENT_AGE - clientAge) : null;
  const profileRate = getProfileRate(profile);

  const setYield = (inv: (typeof investments)[0], rate: number) => {
    const clamped = Math.max(MIN_RATE, Math.min(MAX_RATE, rate));
    updateInvestment(inv.productKey, inv.type, "annualRate", clamped);
  };

  // Default pension years from years to retirement (when client age is set and product still has 30)
  useEffect(() => {
    if (yearsToRetirement == null || yearsToRetirement === 30) return;
    investments
      .filter((i) => i.type === "pension" && i.years === 30)
      .forEach((inv) => updateInvestment(inv.productKey, "pension", "years", yearsToRetirement));
  }, [yearsToRetirement, data.client?.birthDate, investments, updateInvestment]);

  // Sync first renta goal into iShares monthly when profile is Dynamický+ and amount not yet set
  useEffect(() => {
    if (profile !== "dynamic_plus") return;
    const goal = data.goals?.find((g) => g.type === "renta" && (g.computed?.pmt ?? 0) > 0);
    if (!goal?.computed?.pmt) return;
    const inv = investments.find((i) => i.productKey === "ishares" && i.type === "monthly");
    if (!inv || (inv.amount ?? 0) !== 0) return;
    const years = goal.horizon ?? goal.years ?? 20;
    updateInvestment("ishares", "monthly", "amount", roundToHundreds(goal.computed.pmt));
    updateInvestment("ishares", "monthly", "years", years);
  }, [profile, data.goals, investments, updateInvestment]);

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
            {(() => {
              const rentaGoal = data.goals?.find((g) => g.type === "renta" && (g.computed?.pmt ?? 0) > 0);
              if (!rentaGoal?.computed?.pmt) return null;
              return (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      const pmt = rentaGoal.computed!.pmt ?? 0;
                      const years = rentaGoal.horizon ?? rentaGoal.years ?? 20;
                      updateInvestment("ishares", "monthly", "amount", roundToHundreds(pmt));
                      updateInvestment("ishares", "monthly", "years", years);
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-xl font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                  >
                    Přenést z cíle (renta → ETF World měsíčně)
                  </button>
                </div>
              );
            })()}
          </div>

          <div>
            <h3 className="text-slate-800 font-bold mb-4 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-indigo-600" />
              Produkty a částky
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {investments.map((inv) => (
                <div key={inv.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`h-10 w-10 flex items-center justify-center rounded bg-slate-100 text-slate-600 font-bold text-sm shrink-0 ${FUND_LOGOS[inv.productKey] ? "hidden" : ""}`} data-fallback>
                      {getProductName(inv.productKey, inv.type).slice(0, 2).toUpperCase()}
                    </span>
                    {FUND_LOGOS[inv.productKey] ? (
                      <img
                        src={FUND_LOGOS[inv.productKey]}
                        alt=""
                        className="h-10 w-10 object-contain rounded shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                          (e.target as HTMLImageElement).previousElementSibling?.classList.remove("hidden");
                        }}
                      />
                    ) : null}
                    <div className="font-bold text-slate-800 text-sm flex-1 min-w-0">{getProductName(inv.productKey, inv.type)}</div>
                  </div>
                  <div className="text-xs text-slate-500 mb-2">{getTypeLabel(inv.type)}</div>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <label className="text-xs font-semibold text-slate-600">Zhodnocení:</label>
                    <select
                      value={getSelectYield(inv.productKey, inv.annualRate)}
                      onChange={(e) => setYield(inv, parseFloat(e.target.value))}
                      className="min-h-[44px] px-3 py-2 rounded-lg text-sm border border-slate-200 bg-white text-slate-700 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                    >
                      {getYieldOptions(inv.productKey).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        {inv.type === "lump" ? "Částka (Kč)" : "Měsíční vklad (Kč)"}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={inv.amount != null && Number.isFinite(inv.amount) ? Math.round(inv.amount) : ""}
                        onChange={(e) => updateInvestment(inv.productKey, inv.type, "amount", parseFloat(e.target.value) || 0)}
                        className="w-full min-h-[44px] px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Roky
                        {inv.type === "pension" && yearsToRetirement != null && (
                          <span className="text-indigo-500 ml-1 font-normal">(do důchodu: {pluralizeYears(yearsToRetirement)})</span>
                        )}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={inv.years || ""}
                        placeholder={inv.type === "pension" && yearsToRetirement != null ? String(yearsToRetirement) : ""}
                        onChange={(e) => updateInvestment(inv.productKey, inv.type, "years", parseInt(e.target.value, 10) || 1)}
                        className="w-full min-h-[44px] px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
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

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-slate-800 font-bold mb-2">Projekce vývoje</h3>
            <p className="text-slate-500 text-sm mb-4">
              Odhadovaný vývoj hodnoty portfolia v čase při zvoleném profilu (stejná logika jako investiční kalkulačka).
            </p>
            <div className="min-h-[300px] w-full">
              <EmbeddedInvestmentProjection
                faDataSlice={{
                  investments: data.investments ?? [],
                  strategy: data.strategy ?? { profile: "balanced", conservativeMode: false },
                  client: data.client ? { birthDate: data.client.birthDate } : undefined,
                }}
                emptyMessage="Vyplňte produkty a částky pro projekci."
              />
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
              <div className="text-xs text-slate-500 mt-1">Očekávaný výnos: {Math.round(profileRate * 100)} % p.a.</div>
              {conservativeMode && (
                <div className="text-xs text-indigo-700 mt-1">+ konzervativní režim (−2 %)</div>
              )}
              {yearsToRetirement != null && clientAge != null && (
                <div className="text-xs text-slate-500 mt-1">Do důchodu: {pluralizeYears(yearsToRetirement)} (věk {clientAge})</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
