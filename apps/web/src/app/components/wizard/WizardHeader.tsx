"use client";

import { X } from "lucide-react";

export function WizardHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white relative z-10 shrink-0">
      <h2 id="wizard-title" className="text-xl font-black text-slate-900 tracking-tight">
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors min-w-[44px] min-h-[44px]"
        aria-label="Zavřít"
      >
        <X size={18} />
      </button>
    </div>
  );
}
