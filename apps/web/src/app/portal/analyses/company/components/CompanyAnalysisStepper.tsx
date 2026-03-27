"use client";

import { useCompanyFaStore } from "@/lib/analyses/company-fa/store";
import { STEP_TITLES } from "@/lib/analyses/company-fa/constants";
import { Check } from "lucide-react";
import clsx from "clsx";

export function CompanyAnalysisStepper() {
  const currentStep = useCompanyFaStore((s) => s.currentStep);
  const goToStep = useCompanyFaStore((s) => s.goToStep);

  return (
    <nav
      className="relative z-10 mx-auto mb-6 w-full max-w-6xl px-1 sm:mb-8 sm:px-2"
      aria-label="Kroky firemní analýzy"
    >
      <ol className="m-0 flex list-none flex-wrap justify-center gap-x-1 gap-y-5 p-0 sm:gap-x-2 sm:gap-y-6 lg:flex-nowrap lg:justify-between lg:gap-x-1">
        {STEP_TITLES.map((title, i) => {
          const stepNum = i + 1;
          const isActive = currentStep === stepNum;
          const isCompleted = currentStep > stepNum;
          return (
            <li
              key={stepNum}
              className="flex min-w-[4.5rem] max-w-[7.5rem] flex-1 basis-[22%] justify-center sm:min-w-[4.75rem] sm:max-w-[6.5rem] sm:basis-0 md:max-w-[7rem] lg:min-w-0 lg:max-w-none lg:flex-1"
            >
              <button
                type="button"
                onClick={() => goToStep(stepNum)}
                className={clsx(
                  "flex w-full max-w-[6.5rem] flex-col items-center gap-2 sm:max-w-[7rem] lg:max-w-none",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--wp-main-scroll-bg)] rounded-xl",
                )}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Krok ${stepNum}: ${title}`}
              >
                <div
                  className={clsx(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-base font-semibold transition-all sm:h-12 sm:w-12 sm:text-lg",
                    isActive &&
                      "border-primary bg-[color:var(--wp-surface-card)] text-primary shadow-[0_0_0_4px_rgba(var(--primary),0.15)]",
                    isCompleted && "border-primary bg-primary text-primary-foreground",
                    !isActive &&
                      !isCompleted &&
                      "border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)]",
                  )}
                >
                  {isCompleted ? <Check className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} /> : stepNum}
                </div>
                <span
                  className={clsx(
                    "w-full px-0.5 text-center text-[10px] font-bold uppercase leading-snug tracking-wide sm:text-xs",
                    isActive ? "text-[color:var(--wp-text)]" : "text-[color:var(--wp-text-tertiary)]",
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
