"use client";

import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import { FinancialAnalysisStepper } from "./FinancialAnalysisStepper";
import { FinancialAnalysisToolbar } from "./FinancialAnalysisToolbar";
import { StepClientInfo } from "./steps/StepClientInfo";
import { StepCashflow } from "./steps/StepCashflow";
import { StepAssetsLiabilities } from "./steps/StepAssetsLiabilities";
import { StepCredits } from "./steps/StepCredits";
import { StepGoals } from "./steps/StepGoals";
import { StepStrategy } from "./steps/StepStrategy";
import { StepSummary } from "./steps/StepSummary";

const STEP_COMPONENTS = [
  StepClientInfo,
  StepCashflow,
  StepAssetsLiabilities,
  StepCredits,
  StepGoals,
  StepStrategy,
  StepSummary,
];

export function FinancialAnalysisLayout() {
  const currentStep = useFinancialAnalysisStore((s) => s.currentStep);
  const totalSteps = useFinancialAnalysisStore((s) => s.totalSteps);
  const prevStep = useFinancialAnalysisStore((s) => s.prevStep);
  const nextStep = useFinancialAnalysisStore((s) => s.nextStep);

  const StepComponent = STEP_COMPONENTS[currentStep - 1];

  return (
    <div className="flex-grow flex flex-col items-center pt-6 pb-20 px-3 sm:px-4">
      <section className="w-full max-w-4xl mb-6 text-center">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
          Finanční analýza
        </h1>
      </section>

      <FinancialAnalysisStepper />

      <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 md:p-10 mb-20 shadow-lg">
        <FinancialAnalysisToolbar />

        <div className="min-h-[320px]">
          {StepComponent && <StepComponent />}
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 pt-8 border-t border-slate-200 mt-8">
          <button
            type="button"
            onClick={() => prevStep()}
            className={currentStep === 1 ? "hidden" : "min-h-[44px] px-6 py-3 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50"}
          >
            Zpět
          </button>
          <div className="flex-1 sm:text-right">
            {currentStep === totalSteps ? (
              <span className="text-slate-500 text-sm">Použijte tlačítko v kroku Shrnutí pro export reportu.</span>
            ) : (
              <button
                type="button"
                onClick={() => nextStep()}
                className="min-h-[44px] px-6 py-3 bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold rounded-xl shadow-md"
              >
                Další
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
