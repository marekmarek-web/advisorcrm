"use client";

import { CheckCircle2 } from "lucide-react";

export function WizardSuccess({
  headline,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  headline: string;
  description: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center wizard-slide-enter">
      <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-sm">
        <CheckCircle2 size={40} strokeWidth={2.5} />
      </div>
      <h2 className="text-2xl font-black text-slate-900 mb-2">{headline}</h2>
      <p className="text-slate-500 font-medium mb-8 max-w-md">{description}</p>
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
        <button
          type="button"
          onClick={onSecondary}
          className="flex-1 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors shadow-sm min-h-[44px]"
        >
          {secondaryLabel}
        </button>
        <button
          type="button"
          onClick={onPrimary}
          className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-md min-h-[44px]"
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}
