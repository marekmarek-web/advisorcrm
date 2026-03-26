"use client";

import { ArrowRight, ArrowLeft, Check } from "lucide-react";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";

export function WizardFooter({
  onBack,
  onClose,
  onPrimary,
  primaryLabel,
  primaryDisabled,
  primaryLoading,
  isFirstStep,
  isLastStep,
}: {
  onBack: () => void;
  onClose: () => void;
  onPrimary: () => void;
  primaryLabel: string;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  isFirstStep: boolean;
  isLastStep: boolean;
}) {
  const handleBack = isFirstStep ? onClose : onBack;
  return (
    <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between relative z-10 shrink-0">
      <button
        type="button"
        onClick={handleBack}
        className={`px-5 py-2.5 font-bold text-sm rounded-xl transition-all flex items-center gap-2 min-h-[44px] ${
          isFirstStep
            ? "text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            : "text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 shadow-sm"
        }`}
      >
        {!isFirstStep && <ArrowLeft size={16} />}
        {isFirstStep ? "Zrušit" : "Zpět"}
      </button>
      {isLastStep ? (
        <CreateActionButton
          type="button"
          onClick={onPrimary}
          disabled={primaryDisabled}
          isLoading={primaryLoading}
          icon={Check}
          className="px-8 py-2.5"
        >
          {primaryLoading ? "Ukládám…" : primaryLabel}
        </CreateActionButton>
      ) : (
        <button
          type="button"
          onClick={onPrimary}
          disabled={primaryDisabled || primaryLoading}
          className="flex min-h-[44px] items-center gap-2 rounded-xl bg-indigo-600 px-8 py-2.5 text-sm font-bold text-white shadow-md shadow-indigo-200 transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-70"
        >
          {primaryLoading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Ukládám…
            </>
          ) : (
            <>
              {primaryLabel}
              <ArrowRight size={16} />
            </>
          )}
        </button>
      )}
    </div>
  );
}
