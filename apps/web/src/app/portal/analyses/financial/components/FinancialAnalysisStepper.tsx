"use client";

import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import { STEP_TITLES } from "@/lib/analyses/financial/constants";
import { Check } from "lucide-react";
import clsx from "clsx";

export function FinancialAnalysisStepper() {
  const currentStep = useFinancialAnalysisStore((s) => s.currentStep);
  const totalSteps = useFinancialAnalysisStore((s) => s.totalSteps);
  const goToStep = useFinancialAnalysisStore((s) => s.goToStep);

  return (
    <div className="w-full max-w-4xl mb-8 relative z-10 overflow-x-auto">
      <div className="flex justify-between items-center relative min-w-0">
        {STEP_TITLES.map((title, i) => {
          const stepNum = i + 1;
          const isActive = currentStep === stepNum;
          const isCompleted = currentStep > stepNum;
          return (
            <button
              key={stepNum}
              type="button"
              onClick={() => goToStep(stepNum)}
              className={clsx(
                "stepper-item flex-1 flex flex-col items-center min-w-0 sm:min-w-[60px]",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 rounded-lg"
              )}
              aria-current={isActive ? "step" : undefined}
              aria-label={`Krok ${stepNum}: ${title}`}
            >
              <div
                className={clsx(
                  "w-10 h-10 sm:w-11 sm:h-11 min-w-[40px] sm:min-w-[44px] rounded-full flex items-center justify-center font-semibold text-base border-2 transition-all",
                  isActive && "border-amber-400 text-amber-600 bg-white shadow-[0_0_0_4px_rgba(251,191,36,0.15)]",
                  isCompleted && "bg-amber-400 border-amber-400 text-white",
                  !isActive && !isCompleted && "border-slate-300 text-slate-500 bg-white"
                )}
              >
                {isCompleted ? <Check className="w-5 h-5" /> : stepNum}
              </div>
              <span className={clsx("text-xs font-bold uppercase tracking-wider mt-2 hidden md:block", isActive ? "text-slate-800" : "text-slate-400")}>
                {title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
