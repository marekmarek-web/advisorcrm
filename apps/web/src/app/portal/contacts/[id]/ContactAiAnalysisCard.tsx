"use client";

import Link from "next/link";
import { Zap, ArrowUpRight } from "lucide-react";

/**
 * Placeholder karta „AI Analýza“ dle specu klienti dash v2.
 * Později lze napojit na reálná doporučení / AI.
 */
export function ContactAiAnalysisCard() {
  return (
    <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-[24px] p-6 text-white relative overflow-hidden shadow-xl shadow-indigo-900/10">
      <Zap className="absolute -top-4 -right-4 w-24 h-24 text-white/5" aria-hidden />
      <div className="flex items-center gap-2 mb-4 relative z-10">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
          <Zap size={16} className="text-amber-400" aria-hidden />
        </div>
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">
          AI Analýza
        </h3>
      </div>
      <p className="text-sm font-bold leading-relaxed mb-6 text-indigo-50 relative z-10">
        Doporučení a příležitosti pro klienta se zobrazí po napojení na analytický modul.
      </p>
      <Link
        href="#obchody"
        className="w-full py-3 bg-white text-indigo-950 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-50 transition-colors shadow-lg flex items-center justify-center gap-2 relative z-10 min-h-[44px]"
      >
        Založit příležitost <ArrowUpRight size={14} aria-hidden />
      </Link>
    </div>
  );
}
