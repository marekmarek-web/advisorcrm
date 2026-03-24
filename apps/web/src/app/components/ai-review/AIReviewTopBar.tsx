"use client";

import { ArrowLeft, BrainCircuit, Check, Loader2 } from "lucide-react";
import type { ExtractionDocument } from "@/lib/ai-review/types";

type Props = {
  doc: ExtractionDocument;
  onBack: () => void;
  onDiscard: () => void;
  onApprove: () => void;
  isApproving?: boolean;
};

export function AIReviewTopBar({
  doc,
  onBack,
  onDiscard,
  onApprove,
  isApproving,
}: Props) {
  return (
    <header className="bg-white px-4 md:px-6 py-3 md:py-4 border-b border-slate-200 flex items-center justify-between shadow-sm z-20 flex-shrink-0">
      <div className="flex items-center gap-3 md:gap-6 min-w-0">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 transition-colors shrink-0"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Zpět na seznam</span>
        </button>
        <div className="w-px h-5 bg-slate-200 hidden sm:block" />
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 min-w-0">
          <span className="hidden md:inline">AI Extrakce</span>
          <span className="opacity-30 hidden md:inline">/</span>
          <span className="text-indigo-600 flex items-center gap-1.5 truncate">
            <BrainCircuit size={14} className="shrink-0" />
            <span className="truncate">{doc.fileName}</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        <button
          onClick={onDiscard}
          className="flex items-center gap-2 px-3 md:px-5 py-2 md:py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all"
        >
          <span className="hidden sm:inline">Zahodit</span>
          <span className="sm:hidden">×</span>
        </button>
        <button
          onClick={onApprove}
          disabled={isApproving}
          className="flex items-center gap-2 px-4 md:px-6 py-2 md:py-2.5 bg-[#1a1c2e] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-900/20 hover:bg-[#2a2d4a] transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-60 disabled:pointer-events-none"
        >
          {isApproving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Check size={16} />
          )}
          <span className="hidden sm:inline">Schválit do CRM</span>
          <span className="sm:hidden">Schválit</span>
        </button>
      </div>
    </header>
  );
}
