"use client";

import { ArrowRight, ArrowLeft, Check } from "lucide-react";

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
      <button
        type="button"
        onClick={onPrimary}
        disabled={primaryDisabled || primaryLoading}
        className={`flex items-center gap-2 px-8 py-2.5 font-bold text-sm rounded-xl transition-all active:scale-95 disabled:opacity-70 min-h-[44px] ${
          isLastStep
            ? "bg-[#1a1c2e] text-white shadow-lg shadow-indigo-900/20 hover:bg-[#2a2d4a]"
            : "bg-indigo-600 text-white shadow-md shadow-indigo-200 hover:bg-indigo-700"
        }`}
      >
        {primaryLoading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Ukládám…
          </>
        ) : (
          <>
            {primaryLabel}
            {isLastStep ? <Check size={16} /> : <ArrowRight size={16} />}
          </>
        )}
      </button>
    </div>
  );
}
