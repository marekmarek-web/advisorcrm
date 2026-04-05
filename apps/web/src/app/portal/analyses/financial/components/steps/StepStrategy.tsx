"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useFinancialAnalysisStore as useStore, type FinancialAnalysisStore } from "@/lib/analyses/financial/store";
import type { InvestmentEntry } from "@/lib/analyses/financial/types";
import { selectStrategyTotals } from "@/lib/analyses/financial/selectors";
import { getProductName, getStrategyProfileLabel, formatCzk, getProfileRate, pluralizeYears } from "@/lib/analyses/financial/formatters";
import { getFaFundLogoUrl, getFaFundPlanningRateDecimal } from "@/lib/analyses/financial/fund-library/fa-fund-bridge";
import { TrendingUp, PieChart } from "lucide-react";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { EmbeddedInvestmentProjection } from "@/app/portal/calculators/_components/investment/EmbeddedInvestmentProjection";

const RETIREMENT_AGE = 65;
/** Kanonický „World ETF“ v knihovně — musí odpovídat `legacy-fund-key-map` / Batch A. */
const MSCI_WORLD_KEY = "ishares_core_msci_world";

const EMPTY_INVESTMENTS: InvestmentEntry[] = [];

const MIN_RATE = 0.01;
const MAX_RATE = 0.25;

/** Zaokrouhlí částku na celé stovky (bez desetinných míst). */
function roundToHundreds(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / 100) * 100;
}

/** Vrátí možnosti zhodnocení: default−1 %, default, default+1 % (clamp 1–25 %), bez duplicit. */
function getYieldOptions(productKey: string): { value: number; label: string }[] {
  const defaultRate = getFaFundPlanningRateDecimal(productKey);
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
  const rate = currentRate ?? getFaFundPlanningRateDecimal(productKey);
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

function InvestmentCards({
  items,
  yearsToRetirement,
  setYield,
  updateInvestment,
}: {
  items: InvestmentEntry[];
  yearsToRetirement: number | null;
  setYield: (inv: InvestmentEntry, rate: number) => void;
  updateInvestment: FinancialAnalysisStore["updateInvestment"];
}) {
  return (
    <>
      {items.map((inv) => {
        const logoUrl = getFaFundLogoUrl(inv.productKey);
        return (
          <div
            key={`${inv.productKey}-${inv.type}-${inv.id}`}
            className="bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-xl p-4 shadow-sm"
          >
            <div className="flex items-center gap-3 mb-2">
              <span
                className={`h-10 w-10 flex items-center justify-center rounded bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] font-bold text-sm shrink-0 ${logoUrl ? "hidden" : ""}`}
                data-fallback
              >
                {getProductName(inv.productKey, inv.type).slice(0, 2).toUpperCase()}
              </span>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  className="h-10 w-10 object-contain rounded shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                    (e.target as HTMLImageElement).previousElementSibling?.classList.remove("hidden");
                  }}
                />
              ) : null}
              <div className="font-bold text-[color:var(--wp-text)] text-sm flex-1 min-w-0">
                {getProductName(inv.productKey, inv.type)}
              </div>
            </div>
            <div className="text-xs text-[color:var(--wp-text-secondary)] mb-2">{getTypeLabel(inv.type)}</div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <label className="text-xs font-semibold text-[color:var(--wp-text-secondary)]">Zhodnocení:</label>
              <div className="min-w-[140px] flex-1">
                <CustomDropdown
                  value={String(getSelectYield(inv.productKey, inv.annualRate))}
                  onChange={(id) => setYield(inv, parseFloat(id))}
                  options={getYieldOptions(inv.productKey).map((opt) => ({
                    id: String(opt.value),
                    label: opt.label,
                  }))}
                />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">
                  {inv.type === "lump" ? "Částka (Kč)" : "Měsíční vklad (Kč)"}
                </label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={inv.amount != null && Number.isFinite(inv.amount) ? Math.round(inv.amount) : ""}
                  onChange={(e) => updateInvestment(inv.productKey, inv.type, "amount", parseFloat(e.target.value) || 0)}
                  className="w-full min-h-[44px] px-3 py-2 border border-[color:var(--wp-surface-card-border)] rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[color:var(--wp-text-secondary)] mb-1">
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
                  className="w-full min-h-[44px] px-3 py-2 border border-[color:var(--wp-surface-card-border)] rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-[color:var(--wp-surface-card-border)] text-sm font-bold text-indigo-700">
              FV: {formatCzk(inv.computed?.fv ?? 0)}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function StepStrategy() {
  const data = useStore((s) => s.data);
  const setStrategyProfile = useStore((s) => s.setStrategyProfile);
  const setConservativeMode = useStore((s) => s.setConservativeMode);
  const updateInvestment = useStore((s) => s.updateInvestment);

  const profile = data.strategy?.profile ?? "balanced";
  const conservativeMode = data.strategy?.conservativeMode ?? false;
  const investments = data.investments ?? EMPTY_INVESTMENTS;
  const totals = selectStrategyTotals(data);

  const birthYear = parseInt(data.client?.birthDate ?? "", 10);
  const clientAge = !isNaN(birthYear) ? new Date().getFullYear() - birthYear : null;
  const yearsToRetirement = clientAge != null ? Math.max(1, RETIREMENT_AGE - clientAge) : null;
  const profileRate = getProfileRate(profile);

  const setYield = (inv: InvestmentEntry, rate: number) => {
    const clamped = Math.max(MIN_RATE, Math.min(MAX_RATE, rate));
    updateInvestment(inv.productKey, inv.type, "annualRate", clamped);
  };

  const lumpInv = investments.filter((i) => i.type === "lump");
  const monthlyInv = investments.filter((i) => i.type === "monthly");
  const pensionInv = investments.filter((i) => i.type === "pension");

  // Default pension years from years to retirement (when client age is set and product still has 30)
  useEffect(() => {
    if (yearsToRetirement == null || yearsToRetirement === 30) return;
    investments
      .filter((i) => i.type === "pension" && i.years === 30)
      .forEach((inv) => updateInvestment(inv.productKey, "pension", "years", yearsToRetirement));
  }, [yearsToRetirement, data.client?.birthDate, investments, updateInvestment]);

  // Sync first renta goal into iShares Core MSCI World monthly when profile is Dynamický+ and amount not yet set
  useEffect(() => {
    if (profile !== "dynamic_plus") return;
    const goal = data.goals?.find((g) => g.type === "renta" && (g.computed?.pmt ?? 0) > 0);
    if (!goal?.computed?.pmt) return;
    const inv = investments.find((i) => i.productKey === MSCI_WORLD_KEY && i.type === "monthly");
    if (!inv || (inv.amount ?? 0) !== 0) return;
    const years = goal.horizon ?? goal.years ?? 20;
    updateInvestment(MSCI_WORLD_KEY, "monthly", "amount", roundToHundreds(goal.computed.pmt));
    updateInvestment(MSCI_WORLD_KEY, "monthly", "years", years);
  }, [profile, data.goals, investments, updateInvestment]);

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-[color:var(--wp-text)]">Investiční strategie</h2>
        <p className="text-[color:var(--wp-text-secondary)] mt-1">Profil rizika a alokace do produktů – projekce FV.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[color:var(--wp-surface-muted)] p-6 rounded-2xl border border-[color:var(--wp-surface-card-border)]">
            <h3 className="text-[color:var(--wp-text)] font-bold mb-4">Profil rizika</h3>
            <div className="flex flex-wrap gap-3 mb-4">
              {PROFILE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setStrategyProfile(o.value)}
                  className={`min-h-[44px] px-5 py-2 rounded-xl font-semibold transition-colors ${
                    profile === o.value
                      ? "bg-indigo-500 text-white shadow"
                      : "bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
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
                className="w-5 h-5 rounded border-[color:var(--wp-border-strong)] text-indigo-500 focus:ring-indigo-400"
              />
              <span className="text-sm font-semibold text-[color:var(--wp-text-secondary)]">Konzervativní režim (snížené výnosy v projekci)</span>
            </label>
            {(() => {
              const rentaGoal = data.goals?.find((g) => g.type === "renta" && (g.computed?.pmt ?? 0) > 0);
              if (!rentaGoal?.computed?.pmt) return null;
              const msciMonthly = investments.find((i) => i.productKey === MSCI_WORLD_KEY && i.type === "monthly");
              if (!msciMonthly) return null;
              return (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      const pmt = rentaGoal.computed!.pmt ?? 0;
                      const years = rentaGoal.horizon ?? rentaGoal.years ?? 20;
                      updateInvestment(MSCI_WORLD_KEY, "monthly", "amount", roundToHundreds(pmt));
                      updateInvestment(MSCI_WORLD_KEY, "monthly", "years", years);
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-xl font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                  >
                    Přenést z cíle (renta → iShares Core MSCI World měsíčně)
                  </button>
                </div>
              );
            })()}
          </div>

          <div>
            <h3 className="text-[color:var(--wp-text)] font-bold mb-4 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-indigo-600" />
              Produkty a částky
            </h3>
            {investments.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 dark:bg-amber-950/20 p-6 text-sm text-[color:var(--wp-text-secondary)]">
                <p className="font-semibold text-[color:var(--wp-text)] mb-2">Žádné fondy k zobrazení</p>
                <p className="mb-4">
                  V{" "}
                  <Link href="/portal/setup?tab=fondy" className="text-indigo-600 font-semibold underline-offset-2 hover:underline">
                    Nastavení → Knihovna fondů
                  </Link>{" "}
                  zkontrolujte, které fondy firma povoluje a které máte zapnuté. Bez alespoň jednoho povoleného fondu zde nelze plánovat investice.
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {lumpInv.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wide text-[color:var(--wp-text-secondary)] mb-3">Jednorázově</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      <InvestmentCards items={lumpInv} yearsToRetirement={yearsToRetirement} setYield={setYield} updateInvestment={updateInvestment} />
                    </div>
                  </div>
                )}
                {monthlyInv.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wide text-[color:var(--wp-text-secondary)] mb-3">Pravidelně (měsíčně)</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      <InvestmentCards items={monthlyInv} yearsToRetirement={yearsToRetirement} setYield={setYield} updateInvestment={updateInvestment} />
                    </div>
                  </div>
                )}
                {pensionInv.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wide text-[color:var(--wp-text-secondary)] mb-3">Penzijní</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      <InvestmentCards items={pensionInv} yearsToRetirement={yearsToRetirement} setYield={setYield} updateInvestment={updateInvestment} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-2xl p-6 shadow-sm">
            <h3 className="text-[color:var(--wp-text)] font-bold mb-2">Projekce vývoje</h3>
            <p className="text-[color:var(--wp-text-secondary)] text-sm mb-4">
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
          <div className="sticky top-4 bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-2xl p-6 shadow-sm">
            <h3 className="text-[color:var(--wp-text)] font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              Shrnutí portfolia
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[color:var(--wp-text-secondary)] text-sm">Celková FV (projekce)</span>
                <span className="font-bold text-lg text-[color:var(--wp-text)]">{formatCzk(totals.totalFV)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-[color:var(--wp-text-secondary)]">Jednorázově vloženo</span>
                <span className="font-semibold text-[color:var(--wp-text-secondary)]">{formatCzk(totals.totalLump)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-[color:var(--wp-text-secondary)]">Měsíční vklady (součet)</span>
                <span className="font-semibold text-[color:var(--wp-text-secondary)]">{formatCzk(totals.totalMonthly)}</span>
              </div>
              <div className="flex justify-between items-center text-sm pt-2 border-t border-[color:var(--wp-surface-card-border)]">
                <span className="text-[color:var(--wp-text-secondary)]">Celkem investováno</span>
                <span className="font-semibold text-[color:var(--wp-text-secondary)]">{formatCzk(totals.totalInvested)}</span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-[color:var(--wp-surface-card-border)]">
              <span className="text-xs text-[color:var(--wp-text-secondary)] uppercase font-bold tracking-wider">Profil</span>
              <div className="font-semibold text-[color:var(--wp-text)] mt-1">{getStrategyProfileLabel(profile)}</div>
              <div className="text-xs text-[color:var(--wp-text-secondary)] mt-1">Očekávaný výnos: {Math.round(profileRate * 100)} % p.a.</div>
              {conservativeMode && (
                <div className="text-xs text-indigo-700 mt-1">+ konzervativní režim (−2 %)</div>
              )}
              {yearsToRetirement != null && clientAge != null && (
                <div className="text-xs text-[color:var(--wp-text-secondary)] mt-1">Do důchodu: {pluralizeYears(yearsToRetirement)} (věk {clientAge})</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
