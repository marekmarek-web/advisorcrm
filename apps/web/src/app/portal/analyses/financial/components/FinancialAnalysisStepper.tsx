"use client";

import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import { getStepTitles } from "@/lib/analyses/financial/constants";
import { Check } from "lucide-react";
import { useEffect, useRef } from "react";
import clsx from "clsx";

/**
 * Stepper finanční analýzy.
 *
 * Mobil (do lg): horizontální scroll s snap center + progress rail,
 *                kompaktní pill krok místo velkého kruhu.
 * Desktop (lg+): klasický rozprostřený ekvivalent s kruhy a popisky.
 *
 * Rail progress ukazuje, kde v analýze jsme, bez potřeby scrollovat
 * na konec, aby si poradce všiml kolika kroky ještě zbývá.
 */
export function FinancialAnalysisStepper() {
  const currentStep = useFinancialAnalysisStore((s) => s.currentStep);
  const includeCompany = useFinancialAnalysisStore((s) => s.data.includeCompany ?? false);
  const goToStep = useFinancialAnalysisStore((s) => s.goToStep);
  const stepTitles = getStepTitles(includeCompany);

  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const el = activeRef.current;
    if (!el || typeof el.scrollIntoView !== "function") return;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    } catch {
      el.scrollIntoView();
    }
  }, [currentStep]);

  const total = Math.max(1, stepTitles.length);
  const progressPct = Math.max(0, Math.min(100, Math.round(((currentStep - 0.5) / total) * 100)));

  return (
    <nav
      className="relative z-10 mx-auto mb-5 w-full max-w-6xl sm:mb-6 lg:mb-8"
      aria-label="Kroky finanční analýzy"
    >
      <div className="mx-3 mb-2 h-1 rounded-full bg-[color:var(--wp-surface-muted)] lg:hidden">
        <div
          className="h-full rounded-full bg-indigo-500 transition-[width] duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <ol
        className={clsx(
          "m-0 flex list-none gap-2 p-0",
          "overflow-x-auto px-2 pb-1 pt-1 snap-x snap-mandatory no-scrollbar",
          "lg:flex-nowrap lg:overflow-visible lg:justify-between lg:gap-x-1 lg:px-2",
        )}
      >
        {stepTitles.map((title, i) => {
          const stepNum = i + 1;
          const isActive = currentStep === stepNum;
          const isCompleted = currentStep > stepNum;
          return (
            <li key={stepNum} className="flex shrink-0 snap-center lg:flex-1 lg:justify-center">
              <button
                ref={isActive ? activeRef : null}
                type="button"
                onClick={() => goToStep(stepNum)}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Krok ${stepNum}: ${title}`}
                className={clsx(
                  "group flex items-center gap-2 rounded-2xl border px-3 py-2 text-left transition-colors",
                  "min-h-[48px] lg:min-h-0 lg:flex-col lg:gap-2 lg:border-transparent lg:bg-transparent lg:px-0 lg:py-0",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--wp-main-scroll-bg)]",
                  isActive &&
                    "border-indigo-500 bg-indigo-50 text-indigo-800 shadow-[0_6px_18px_rgba(79,70,229,0.18)] dark:bg-indigo-500/10 dark:text-indigo-200 lg:bg-transparent",
                  isCompleted &&
                    !isActive &&
                    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 lg:bg-transparent",
                  !isActive &&
                    !isCompleted &&
                    "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] lg:bg-transparent",
                )}
              >
                <span
                  className={clsx(
                    "grid shrink-0 place-items-center rounded-full font-bold transition-all",
                    "h-7 w-7 text-[11px] lg:h-12 lg:w-12 lg:text-lg lg:border-2",
                    isActive &&
                      "bg-indigo-500 text-white lg:border-indigo-500 lg:bg-[color:var(--wp-surface-card)] lg:text-indigo-600 lg:shadow-[0_0_0_4px_rgba(99,102,241,0.2)]",
                    isCompleted && !isActive && "bg-emerald-500 text-white lg:border-indigo-500 lg:bg-indigo-500",
                    !isActive &&
                      !isCompleted &&
                      "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-tertiary)] lg:border-[color:var(--wp-border-strong)] lg:bg-[color:var(--wp-surface-card)]",
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5 lg:h-5 lg:w-5" strokeWidth={2.5} />
                  ) : (
                    stepNum
                  )}
                </span>
                <span
                  className={clsx(
                    "text-[11px] font-black uppercase tracking-wide leading-snug",
                    "lg:px-0.5 lg:text-center lg:text-xs",
                    isActive
                      ? "text-[color:var(--wp-text)]"
                      : isCompleted
                        ? "text-emerald-700 dark:text-emerald-300 lg:text-[color:var(--wp-text)]"
                        : "text-[color:var(--wp-text-tertiary)]",
                  )}
                >
                  {title}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
