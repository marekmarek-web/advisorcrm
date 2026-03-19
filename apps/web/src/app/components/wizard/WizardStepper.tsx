"use client";

import { Check } from "lucide-react";

export type WizardStep = { label: string };

export function WizardStepper({
  steps,
  currentStep,
}: {
  steps: WizardStep[];
  currentStep: number;
}) {
  return (
    <div className="px-6 sm:px-10 py-6 sm:py-8 bg-slate-50/50 border-b border-slate-50 flex items-center justify-center relative z-10 shrink-0">
      <div className="flex items-center w-full max-w-[560px]">
        {steps.map((step, i) => {
          const index = i + 1;
          const isActive = currentStep >= index;
          const isCompleted = currentStep > index;
          return (
            <div key={i} className="flex items-center flex-1 min-w-0">
              <div className="flex items-center gap-3 shrink-0">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black transition-colors duration-300 shrink-0 ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                      : "bg-slate-100 text-slate-400 border border-slate-200"
                  }`}
                >
                  {isCompleted ? (
                    <Check size={14} strokeWidth={3} />
                  ) : (
                    index
                  )}
                </div>
                <span
                  className={`text-sm transition-colors duration-300 hidden sm:block ${
                    isActive ? "font-bold text-slate-900" : "font-medium text-slate-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-4 sm:mx-8 rounded-full transition-colors duration-300 min-w-[16px] ${
                    currentStep > index ? "bg-indigo-600" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
