"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, Home, TrendingUp } from "lucide-react";
import { NewRequestModal } from "../NewRequestModal";
import { CalculatorPdfExportButton } from "@/components/calculators/CalculatorPdfExportButton";
import {
  buildClientHypoPdfSections,
  buildClientInvestPdfSections,
} from "@/lib/calculators/pdf";

type CalculatorType = "hypo" | "invest" | null;

function formatMoney(value: number): string {
  return value.toLocaleString("cs-CZ");
}

export function ClientCalculators() {
  const [activeCalculator, setActiveCalculator] = useState<CalculatorType>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);

  const [hypoAmount, setHypoAmount] = useState(5_000_000);
  const [hypoYears, setHypoYears] = useState(30);
  const [hypoRate, setHypoRate] = useState(4.5);

  const [investmentDeposit, setInvestmentDeposit] = useState(100_000);
  const [investmentMonthly, setInvestmentMonthly] = useState(5_000);
  const [investmentYears, setInvestmentYears] = useState(20);

  const mortgageMonthlyPayment = useMemo(() => {
    const r = hypoRate / 100 / 12;
    const n = hypoYears * 12;
    if (hypoAmount <= 0 || n <= 0 || r <= 0) return 0;
    return Math.round((hypoAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
  }, [hypoAmount, hypoYears, hypoRate]);

  const investmentFutureValue = useMemo(() => {
    const r = 0.07 / 12;
    const n = investmentYears * 12;
    if (n <= 0) return 0;
    let future = investmentDeposit * Math.pow(1 + r, n);
    future += investmentMonthly * ((Math.pow(1 + r, n) - 1) / r);
    return Math.round(future);
  }, [investmentDeposit, investmentMonthly, investmentYears]);

  const getHypoPdfSections = useCallback(
    () =>
      buildClientHypoPdfSections({
        amount: hypoAmount,
        years: hypoYears,
        ratePercent: hypoRate,
        monthlyPayment: mortgageMonthlyPayment,
      }),
    [hypoAmount, hypoYears, hypoRate, mortgageMonthlyPayment]
  );

  const getInvestPdfSections = useCallback(
    () =>
      buildClientInvestPdfSections({
        deposit: investmentDeposit,
        monthly: investmentMonthly,
        years: investmentYears,
        futureValue: investmentFutureValue,
      }),
    [investmentDeposit, investmentMonthly, investmentYears, investmentFutureValue]
  );

  return (
    <div className="space-y-8 client-fade-in">
      <style>{`
        input[type=range].client-slider { -webkit-appearance: none; width: 100%; background: transparent; height: 6px; border-radius: 3px; cursor: pointer; outline: none; margin: 12px 0; }
        input[type=range].client-slider::-webkit-slider-runnable-track { width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; }
        input[type=range].client-slider::-webkit-slider-thumb { -webkit-appearance: none; height: 20px; width: 20px; border-radius: 50%; background: #10b981; margin-top: -7px; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
      `}</style>

      <div>
        <h2 className="text-3xl font-display font-black text-slate-900 tracking-tight">
          Finanční kalkulačky
        </h2>
        <p className="text-sm font-medium text-slate-500 mt-2">
          Orientační výpočty pro ilustraci — nejde o návrh konkrétního produktu ani radu. Individuální posouzení řeší
          výhradně váš poradce.
        </p>
      </div>

      {!activeCalculator ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button
            onClick={() => setActiveCalculator("hypo")}
            className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-lg hover:border-indigo-200 transition-all text-center flex flex-col items-center"
          >
            <span className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
              <Home size={32} />
            </span>
            <h3 className="text-xl font-black text-slate-900 mb-2">Hypotéka</h3>
            <p className="text-sm font-medium text-slate-500">
              Spočítejte si orientační měsíční splátku úvěru na bydlení.
            </p>
          </button>

          <button
            onClick={() => setActiveCalculator("invest")}
            className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-lg hover:border-emerald-200 transition-all text-center flex flex-col items-center"
          >
            <span className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6">
              <TrendingUp size={32} />
            </span>
            <h3 className="text-xl font-black text-slate-900 mb-2">Investice</h3>
            <p className="text-sm font-medium text-slate-500">
              Zjistěte, jak se mohou vaše peníze zhodnotit díky složenému úročení.
            </p>
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden client-scale-in">
          <div className="px-8 py-6 border-b border-slate-50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-slate-50/50">
            <div className="flex items-center gap-4 min-w-0">
              <button
                onClick={() => setActiveCalculator(null)}
                className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors min-h-[44px] shrink-0"
              >
                <ArrowLeft size={16} />
                Zpět na výběr
              </button>
              <h3 className="font-black text-lg text-slate-900 truncate">
                {activeCalculator === "hypo" ? "Hypoteční kalkulačka" : "Investiční kalkulačka"}
              </h3>
            </div>
            {activeCalculator === "hypo" ? (
              <CalculatorPdfExportButton
                documentTitle="Hypoteční kalkulačka – klientský přehled"
                filePrefix="klient-hypoteka"
                getSections={getHypoPdfSections}
              />
            ) : (
              <CalculatorPdfExportButton
                documentTitle="Investiční kalkulačka – klientský přehled"
                filePrefix="klient-investice"
                getSections={getInvestPdfSections}
              />
            )}
          </div>

          <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div className="space-y-6">
              {activeCalculator === "hypo" ? (
                <>
                  <div>
                    <div className="flex justify-between text-sm font-bold text-slate-700 mb-2">
                      <span>Výše úvěru</span>
                      <span className="text-blue-600">{formatMoney(hypoAmount)} Kč</span>
                    </div>
                    <input
                      type="range"
                      className="client-slider"
                      min={500_000}
                      max={15_000_000}
                      step={100_000}
                      value={hypoAmount}
                      onChange={(event) => setHypoAmount(Number(event.target.value))}
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-sm font-bold text-slate-700 mb-2">
                      <span>Splatnost</span>
                      <span className="text-blue-600">{hypoYears} let</span>
                    </div>
                    <input
                      type="range"
                      className="client-slider"
                      min={5}
                      max={30}
                      step={1}
                      value={hypoYears}
                      onChange={(event) => setHypoYears(Number(event.target.value))}
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-sm font-bold text-slate-700 mb-2">
                      <span>Odhad úroku</span>
                      <span className="text-blue-600">{hypoRate}% p.a.</span>
                    </div>
                    <input
                      type="range"
                      className="client-slider"
                      min={3}
                      max={8}
                      step={0.1}
                      value={hypoRate}
                      onChange={(event) => setHypoRate(Number(event.target.value))}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="flex justify-between text-sm font-bold text-slate-700 mb-2">
                      <span>Počáteční vklad</span>
                      <span className="text-emerald-600">{formatMoney(investmentDeposit)} Kč</span>
                    </div>
                    <input
                      type="range"
                      className="client-slider"
                      min={0}
                      max={2_000_000}
                      step={10_000}
                      value={investmentDeposit}
                      onChange={(event) => setInvestmentDeposit(Number(event.target.value))}
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-sm font-bold text-slate-700 mb-2">
                      <span>Měsíční úložka</span>
                      <span className="text-emerald-600">{formatMoney(investmentMonthly)} Kč</span>
                    </div>
                    <input
                      type="range"
                      className="client-slider"
                      min={500}
                      max={50_000}
                      step={500}
                      value={investmentMonthly}
                      onChange={(event) => setInvestmentMonthly(Number(event.target.value))}
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-sm font-bold text-slate-700 mb-2">
                      <span>Doba investování</span>
                      <span className="text-emerald-600">{investmentYears} let</span>
                    </div>
                    <input
                      type="range"
                      className="client-slider"
                      min={3}
                      max={40}
                      step={1}
                      value={investmentYears}
                      onChange={(event) => setInvestmentYears(Number(event.target.value))}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-col justify-center items-center text-center bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl">
              <div
                className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-[80px] pointer-events-none ${
                  activeCalculator === "hypo" ? "bg-blue-500/30" : "bg-emerald-500/30"
                }`}
              />
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 relative z-10">
                {activeCalculator === "hypo"
                  ? "Orientační měsíční splátka"
                  : "Odhad budoucí hodnoty (7% p.a.)"}
              </p>
              <div className="text-5xl font-black mb-8 relative z-10">
                {formatMoney(
                  activeCalculator === "hypo" ? mortgageMonthlyPayment : investmentFutureValue
                )}{" "}
                <span className="text-xl text-slate-500">Kč</span>
              </div>
              <button
                onClick={() => setRequestModalOpen(true)}
                className={`w-full py-4 rounded-xl text-sm font-black uppercase tracking-widest transition-all relative z-10 shadow-lg hover:scale-[1.02] min-h-[44px] ${
                  activeCalculator === "hypo"
                    ? "bg-blue-600 hover:bg-blue-500 shadow-blue-500/30"
                    : "bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/30"
                }`}
              >
                Mám zájem to řešit
              </button>
              {activeCalculator === "hypo" ? (
                <p className="text-xs text-slate-400 mt-4 leading-relaxed max-w-md relative z-10">
                  Sazby a splátky jsou orientační. Finální nabídka závisí na bonitě klienta,
                  účelu úvěru a podmínkách konkrétní banky.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <NewRequestModal
        open={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        defaultCaseType={activeCalculator === "hypo" ? "hypotéka" : "investice"}
      />

      <p className="text-center text-sm text-slate-500">
        Orientační výpočet. Nejedná se o finanční poradenství ani závaznou nabídku.
      </p>
    </div>
  );
}
