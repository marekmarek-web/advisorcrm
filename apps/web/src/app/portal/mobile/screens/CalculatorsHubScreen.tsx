"use client";

import { useEffect, useMemo, useState } from "react";
import { getCalculators } from "@/lib/calculators/core/registry";
import { computeProjection } from "@/lib/calculators/investment/investment.engine";
import { INVESTMENT_PROFILES } from "@/lib/calculators/investment/investment.config";
import { calculateResult as calculateMortgageResult } from "@/lib/calculators/mortgage/mortgage.engine";
import { runCalculations as runPensionCalculations } from "@/lib/calculators/pension/pension.engine";
import { runCalculations as runLifeCalculations } from "@/lib/calculators/life/life.engine";
import {
  CalculatorCard,
  EmptyState,
  FullscreenSheet,
  MobileCard,
  MobileSection,
  ResultCtaCard,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";

type CalculatorSlug = "investment" | "mortgage" | "pension" | "life";

export function CalculatorsHubScreen({
  detailSlugFromPath,
  onCreateTaskFromResult,
  onCreateOpportunityFromResult,
  onOpenAnalyses,
}: {
  detailSlugFromPath: string | null;
  onCreateTaskFromResult: (title: string) => void;
  onCreateOpportunityFromResult: (title: string) => void;
  onOpenAnalyses: () => void;
}) {
  const calculators = getCalculators();
  const [selectedSlug, setSelectedSlug] = useState<CalculatorSlug | null>((detailSlugFromPath as CalculatorSlug | null) ?? null);
  const [open, setOpen] = useState(Boolean(detailSlugFromPath));

  useEffect(() => {
    setSelectedSlug((detailSlugFromPath as CalculatorSlug | null) ?? null);
    setOpen(Boolean(detailSlugFromPath));
  }, [detailSlugFromPath]);

  const [investmentInitial, setInvestmentInitial] = useState(500000);
  const [investmentMonthly, setInvestmentMonthly] = useState(3000);
  const [investmentYears, setInvestmentYears] = useState(20);
  const [investmentProfileId, setInvestmentProfileId] = useState(INVESTMENT_PROFILES[1]?.id ?? "vyvazeny");

  const [mortgageLoan, setMortgageLoan] = useState(4500000);
  const [mortgageOwn, setMortgageOwn] = useState(900000);
  const [mortgageTerm, setMortgageTerm] = useState(30);

  const [pensionAge, setPensionAge] = useState(35);
  const [pensionRetireAge, setPensionRetireAge] = useState(65);
  const [pensionSalary, setPensionSalary] = useState(42000);
  const [pensionNeed, setPensionNeed] = useState(35000);

  const [lifeIncome, setLifeIncome] = useState(50000);
  const [lifeExpenses, setLifeExpenses] = useState(35000);

  const investmentProfile = useMemo(
    () => INVESTMENT_PROFILES.find((profile) => profile.id === investmentProfileId) ?? INVESTMENT_PROFILES[0],
    [investmentProfileId]
  );
  const investmentResult = useMemo(
    () => computeProjection({ initial: investmentInitial, monthly: investmentMonthly, years: investmentYears, profile: investmentProfile }),
    [investmentInitial, investmentMonthly, investmentYears, investmentProfile]
  );

  const mortgageResult = useMemo(
    () =>
      calculateMortgageResult({
        product: "mortgage",
        mortgageType: "standard",
        loanType: "consumer",
        loan: mortgageLoan,
        own: mortgageOwn,
        extra: 0,
        term: mortgageTerm,
        fix: 5,
        type: "new",
        ltvLock: null,
      }),
    [mortgageLoan, mortgageOwn, mortgageTerm]
  );

  const pensionResult = useMemo(
    () => runPensionCalculations({ age: pensionAge, retireAge: pensionRetireAge, salary: pensionSalary, rent: pensionNeed, scenario: "realistic" }),
    [pensionAge, pensionRetireAge, pensionSalary, pensionNeed]
  );

  const lifeResult = useMemo(
    () =>
      runLifeCalculations({
        age: 35,
        netIncome: lifeIncome,
        expenses: lifeExpenses,
        liabilities: 2000000,
        reserves: 200000,
        children: 2,
        hasSpouse: true,
      }),
    [lifeIncome, lifeExpenses]
  );

  function openDetail(slug: CalculatorSlug) {
    setSelectedSlug(slug);
    setOpen(true);
  }

  return (
    <>
      <MobileSection title="Kalkulačky">
        {calculators.length === 0 ? (
          <EmptyState title="Žádné kalkulačky" />
        ) : (
          calculators.map((calculator) => (
            <CalculatorCard
              key={calculator.id}
              title={calculator.title}
              description={calculator.description}
              action={
                <button
                  type="button"
                  onClick={() => openDetail(calculator.slug as CalculatorSlug)}
                  className="min-h-[40px] rounded-lg border border-slate-200 px-3 text-xs font-bold"
                >
                  Otevřít
                </button>
              }
            />
          ))
        )}
      </MobileSection>

      <FullscreenSheet open={open} onClose={() => setOpen(false)} title="Kalkulačka">
        {!selectedSlug ? (
          <EmptyState title="Vyberte kalkulačku" />
        ) : (
          <div className="space-y-3">
            {selectedSlug === "investment" ? (
              <>
                <MobileCard>
                  <p className="text-sm font-black">Investiční kalkulačka</p>
                  <div className="mt-3 space-y-2">
                    <input type="number" value={investmentInitial} onChange={(e) => setInvestmentInitial(Number(e.target.value || 0))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Počáteční vklad" />
                    <input type="number" value={investmentMonthly} onChange={(e) => setInvestmentMonthly(Number(e.target.value || 0))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Měsíční vklad" />
                    <input type="number" value={investmentYears} onChange={(e) => setInvestmentYears(Number(e.target.value || 0))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Horizont (roky)" />
                    <select value={investmentProfileId} onChange={(e) => setInvestmentProfileId(e.target.value)} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm bg-white">
                      {INVESTMENT_PROFILES.map((profile) => (
                        <option key={profile.id} value={profile.id}>{profile.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <StatusBadge tone="success">Bilance: {Math.round(investmentResult.totalBalance).toLocaleString("cs-CZ")} Kč</StatusBadge>
                  </div>
                </MobileCard>
                <ResultCtaCard
                  title="Další business krok"
                  description="Uložte výsledek do workflow klienta."
                  actions={
                    <>
                      <button type="button" onClick={() => onCreateTaskFromResult("Navázat na investiční propočet")} className="min-h-[40px] rounded-lg bg-indigo-600 text-white text-xs font-bold">Úkol</button>
                      <button type="button" onClick={() => onCreateOpportunityFromResult("Investiční příležitost")} className="min-h-[40px] rounded-lg border border-indigo-200 bg-white text-indigo-700 text-xs font-bold">Opportunity</button>
                      <button type="button" onClick={onOpenAnalyses} className="min-h-[40px] rounded-lg border border-slate-200 text-slate-700 text-xs font-bold">Analýza</button>
                      <button type="button" onClick={() => setOpen(false)} className="min-h-[40px] rounded-lg border border-slate-200 text-slate-700 text-xs font-bold">Uložit kontext</button>
                    </>
                  }
                />
              </>
            ) : null}

            {selectedSlug === "mortgage" ? (
              <>
                <MobileCard>
                  <p className="text-sm font-black">Hypoteční kalkulačka</p>
                  <div className="mt-3 space-y-2">
                    <input type="number" value={mortgageLoan} onChange={(e) => setMortgageLoan(Number(e.target.value || 0))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Výše úvěru" />
                    <input type="number" value={mortgageOwn} onChange={(e) => setMortgageOwn(Number(e.target.value || 0))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Vlastní zdroje" />
                    <input type="number" value={mortgageTerm} onChange={(e) => setMortgageTerm(Number(e.target.value || 0))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Splatnost (roky)" />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <StatusBadge tone="info">Splátka: {mortgageResult.monthlyPayment.toLocaleString("cs-CZ")} Kč</StatusBadge>
                    <StatusBadge>{mortgageResult.finalRate.toFixed(2)} %</StatusBadge>
                  </div>
                </MobileCard>
                <ResultCtaCard
                  title="Další business krok"
                  actions={
                    <>
                      <button type="button" onClick={() => onCreateTaskFromResult("Navázat na hypoteční propočet")} className="min-h-[40px] rounded-lg bg-indigo-600 text-white text-xs font-bold">Úkol</button>
                      <button type="button" onClick={() => onCreateOpportunityFromResult("Hypoteční příležitost")} className="min-h-[40px] rounded-lg border border-indigo-200 bg-white text-indigo-700 text-xs font-bold">Opportunity</button>
                      <button type="button" onClick={onOpenAnalyses} className="min-h-[40px] rounded-lg border border-slate-200 text-slate-700 text-xs font-bold">Analýza</button>
                      <button type="button" onClick={() => setOpen(false)} className="min-h-[40px] rounded-lg border border-slate-200 text-slate-700 text-xs font-bold">Uložit kontext</button>
                    </>
                  }
                />
              </>
            ) : null}

            {selectedSlug === "pension" ? (
              <>
                <MobileCard>
                  <p className="text-sm font-black">Penzijní kalkulačka</p>
                  <div className="mt-3 space-y-2">
                    <input type="number" value={pensionAge} onChange={(e) => setPensionAge(Number(e.target.value || 0))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Věk" />
                    <input type="number" value={pensionRetireAge} onChange={(e) => setPensionRetireAge(Number(e.target.value || 0))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Důchodový věk" />
                    <input type="number" value={pensionSalary} onChange={(e) => setPensionSalary(Number(e.target.value || 0))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Čistý příjem" />
                    <input type="number" value={pensionNeed} onChange={(e) => setPensionNeed(Number(e.target.value || 0))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Cílová renta" />
                  </div>
                  <div className="mt-3">
                    <StatusBadge tone={pensionResult.monthlyGap > 0 ? "warning" : "success"}>
                      Gap: {Math.round(pensionResult.monthlyGap).toLocaleString("cs-CZ")} Kč
                    </StatusBadge>
                  </div>
                </MobileCard>
                <ResultCtaCard
                  title="Další business krok"
                  actions={
                    <>
                      <button type="button" onClick={() => onCreateTaskFromResult("Navázat na penzijní propočet")} className="min-h-[40px] rounded-lg bg-indigo-600 text-white text-xs font-bold">Úkol</button>
                      <button type="button" onClick={() => onCreateOpportunityFromResult("Penzijní příležitost")} className="min-h-[40px] rounded-lg border border-indigo-200 bg-white text-indigo-700 text-xs font-bold">Opportunity</button>
                      <button type="button" onClick={onOpenAnalyses} className="min-h-[40px] rounded-lg border border-slate-200 text-slate-700 text-xs font-bold">Analýza</button>
                      <button type="button" onClick={() => setOpen(false)} className="min-h-[40px] rounded-lg border border-slate-200 text-slate-700 text-xs font-bold">Uložit kontext</button>
                    </>
                  }
                />
              </>
            ) : null}

            {selectedSlug === "life" ? (
              <>
                <MobileCard>
                  <p className="text-sm font-black">Životní kalkulačka</p>
                  <div className="mt-3 space-y-2">
                    <input type="number" value={lifeIncome} onChange={(e) => setLifeIncome(Number(e.target.value || 0))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Čistý příjem" />
                    <input type="number" value={lifeExpenses} onChange={(e) => setLifeExpenses(Number(e.target.value || 0))} className="w-full min-h-[44px] rounded-xl border border-slate-200 px-3 text-sm" placeholder="Výdaje domácnosti" />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <StatusBadge tone="warning">Krytí smrti: {lifeResult.deathCoverage.toLocaleString("cs-CZ")} Kč</StatusBadge>
                    <StatusBadge tone="info">PN denně: {lifeResult.pnDailyNeed.toLocaleString("cs-CZ")} Kč</StatusBadge>
                  </div>
                </MobileCard>
                <ResultCtaCard
                  title="Další business krok"
                  actions={
                    <>
                      <button type="button" onClick={() => onCreateTaskFromResult("Navázat na životní propočet")} className="min-h-[40px] rounded-lg bg-indigo-600 text-white text-xs font-bold">Úkol</button>
                      <button type="button" onClick={() => onCreateOpportunityFromResult("Pojišťovací příležitost")} className="min-h-[40px] rounded-lg border border-indigo-200 bg-white text-indigo-700 text-xs font-bold">Opportunity</button>
                      <button type="button" onClick={onOpenAnalyses} className="min-h-[40px] rounded-lg border border-slate-200 text-slate-700 text-xs font-bold">Analýza</button>
                      <button type="button" onClick={() => setOpen(false)} className="min-h-[40px] rounded-lg border border-slate-200 text-slate-700 text-xs font-bold">Uložit kontext</button>
                    </>
                  }
                />
              </>
            ) : null}
          </div>
        )}
      </FullscreenSheet>
    </>
  );
}
