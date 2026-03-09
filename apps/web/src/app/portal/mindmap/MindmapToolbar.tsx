"use client";

import { Settings } from "lucide-react";

export function MindmapToolbar() {
  return (
    <div className="absolute left-6 top-6 flex flex-col gap-3 z-50">
      <div className="bg-white/90 backdrop-blur-xl p-2 rounded-2xl shadow-xl border border-slate-200 flex flex-col gap-1">
        <button
          type="button"
          className="p-3 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
          title="Nástroj pro výběr"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
            <path d="M13 13l6 6" />
          </svg>
        </button>
        <button
          type="button"
          className="p-3 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          title="Spojování uzlů (Link)"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </button>
        <div className="w-10 h-px bg-slate-200 mx-auto my-1" />
        <button
          type="button"
          className="p-3 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          title="Nastavení mapy"
        >
          <Settings size={20} />
        </button>
      </div>
    </div>
  );
}
