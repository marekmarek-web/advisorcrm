"use client";

import Link from "next/link";
import { Zap, ArrowUpRight } from "lucide-react";

/**
 * Placeholder karta „AI Analýza“ dle specu klienti dash v2.
 * Placeholder; lze napojit na interní AI podklady pro poradce.
 */
export function ContactAiAnalysisCard() {
  return (
    <div className="relative overflow-hidden rounded-[var(--wp-radius-card)] bg-gradient-to-br from-indigo-900 to-[#0f172a] p-6 text-white shadow-xl shadow-indigo-900/10">
      <Zap className="absolute -top-4 -right-4 w-24 h-24 text-white/5" aria-hidden />
      <div className="flex items-center gap-2 mb-4 relative z-10">
        <div className="w-8 h-8 rounded-lg bg-[color:var(--wp-surface-card)]/10 flex items-center justify-center">
          <Zap size={16} className="text-amber-400" aria-hidden />
        </div>
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">
          Interní AI podklady
        </h3>
      </div>
      <p className="text-sm font-bold leading-relaxed mb-6 text-indigo-50 relative z-10">
        Informativní shrnutí a interní podněty z analytického modulu se zobrazí po napojení — nejde o radu určenou klientovi.
      </p>
      <Link
        href="#obchody"
        className="w-full py-3 bg-[color:var(--wp-surface-card)] text-indigo-950 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-50 transition-colors shadow-lg flex items-center justify-center gap-2 relative z-10 min-h-[44px]"
      >
        Založit příležitost <ArrowUpRight size={14} aria-hidden />
      </Link>
    </div>
  );
}
