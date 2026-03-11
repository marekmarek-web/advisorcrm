"use client";

import { ZoomIn, ZoomOut, Maximize } from "lucide-react";
import type { ViewportState } from "./types";

type MindmapControlsProps = {
  viewport: ViewportState;
  onZoom: (delta: number) => void;
  onCenter: () => void;
  mobile?: boolean;
};

export function MindmapControls({ viewport, onZoom, onCenter, mobile }: MindmapControlsProps) {
  return (
    <div
      className={`absolute flex items-center gap-2 bg-white/90 backdrop-blur-xl p-2 rounded-2xl shadow-xl border border-slate-200 z-50 ${
        mobile
          ? "bottom-[max(1rem,env(safe-area-inset-bottom))] left-4"
          : "bottom-8 left-1/2 -translate-x-1/2"
      }`}
    >
      <button
        type="button"
        onClick={() => onZoom(-0.1)}
        className="p-3 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
        aria-label="Oddálit"
      >
        <ZoomOut size={20} />
      </button>
      <div className="w-14 md:w-16 text-center font-bold text-sm text-slate-700">
        {Math.round(viewport.zoom * 100)}%
      </div>
      <button
        type="button"
        onClick={() => onZoom(0.1)}
        className="p-3 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
        aria-label="Přiblížit"
      >
        <ZoomIn size={20} />
      </button>
      <div className="w-px h-6 bg-slate-200 mx-1" />
      <button
        type="button"
        onClick={onCenter}
        className="p-3 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
        title="Vycentrovat"
      >
        <Maximize size={20} />
      </button>
    </div>
  );
}
