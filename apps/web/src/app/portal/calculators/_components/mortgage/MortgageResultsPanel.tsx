"use client";

import { formatCurrency, formatRate } from "@/lib/calculators/mortgage/formatters";
import type { MortgageResult } from "@/lib/calculators/mortgage/mortgage.types";

export interface MortgageResultsPanelProps {
  result: MortgageResult;
}

const CIRC = 2 * Math.PI * 36; // ≈ 226.19

export function MortgageResultsPanel({ result }: MortgageResultsPanelProps) {
  const totalInterest = result.totalPaid - result.monthlyPayment * 0 > 0
    ? result.totalPaid - (result.monthlyPayment > 0 ? result.borrowingAmount : 0)
    : 0;
  const principal = result.borrowingAmount;
  const total = principal + totalInterest;
  const interestLen = total > 0 ? (totalInterest / total) * CIRC : 0;
  const principalLen = total > 0 ? (principal / total) * CIRC : 0;

  return (
    <div className="relative overflow-hidden rounded-[20px] bg-[#0d1f4e] p-6 text-white shadow-[0_16px_48px_rgba(13,31,78,0.14),0_4px_12px_rgba(13,31,78,0.06)]">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute w-[160px] h-[160px] rounded-full" style={{ top: "-40px", left: "-40px", background: "radial-gradient(circle, rgba(37,99,235,0.25) 0%, transparent 70%)" }} />
        <div className="absolute w-[120px] h-[120px] rounded-full" style={{ bottom: "-30px", right: "-30px", background: "radial-gradient(circle, rgba(5,150,105,0.18) 0%, transparent 70%)" }} />
      </div>

      <div className="relative z-10">
        {/* Eyebrow */}
        <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50 mb-1.5">
          Odhadovaná měsíční splátka
        </div>

        {/* Amount */}
        <div className="text-[2.5rem] font-extrabold text-white tracking-[-0.03em] leading-none mb-1.5">
          {formatCurrency(result.monthlyPayment)}
          <span className="text-base font-medium text-white/50 ml-1">Kč</span>
        </div>

        {/* Rate pill */}
        <div className="inline-flex items-center gap-1.5 bg-[rgba(5,150,105,0.2)] border border-[rgba(5,150,105,0.35)] rounded-full px-3 py-1 text-xs font-semibold text-[#34d399] mb-5">
          <span className="w-[5px] h-[5px] rounded-full bg-[#34d399] animate-pulse" />
          Úrok od {formatRate(result.finalRate)} p.a.
        </div>

        {/* Donut label */}
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/28 mb-3">
          Struktura celkových nákladů
        </div>

        {/* Donut + legend */}
        <div className="flex items-center gap-4 mb-5">
          {/* SVG Donut */}
          <div className="relative shrink-0 w-24 h-24">
            <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
              <circle cx="48" cy="48" r="36" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="11" />
              <circle cx="48" cy="48" r="36" fill="none" stroke="#34D399" strokeWidth="11"
                strokeDasharray={`${interestLen.toFixed(2)} ${CIRC.toFixed(2)}`}
                strokeDashoffset="0" strokeLinecap="butt" transform="rotate(-90 48 48)"
                style={{ transition: "stroke-dasharray 0.5s ease" }} />
              <circle cx="48" cy="48" r="36" fill="none" stroke="#60A5FA" strokeWidth="11"
                strokeDasharray={`${principalLen.toFixed(2)} ${CIRC.toFixed(2)}`}
                strokeDashoffset={`${(-interestLen).toFixed(2)}`} strokeLinecap="butt" transform="rotate(-90 48 48)"
                style={{ transition: "stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease" }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-white/28">LTV</span>
              <span className="text-sm font-bold text-white">{result.displayLtv} %</span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex-1 flex flex-col gap-3">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className="w-[7px] h-[7px] rounded-full bg-[#60A5FA] shrink-0" />
                <span className="text-[11px] text-white/50">Jistina</span>
              </div>
              <div className="text-[15px] font-bold text-white">{formatCurrency(principal)}</div>
              <div className="text-[10px] text-white/28">Kč</div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className="w-[7px] h-[7px] rounded-full bg-[#34D399] shrink-0" />
                <span className="text-[11px] text-white/50">Celkem úroky</span>
              </div>
              <div className="text-[15px] font-bold text-white">+ {formatCurrency(totalInterest)}</div>
              <div className="text-[10px] text-white/28">Kč</div>
            </div>
          </div>
        </div>

        {/* Total */}
        <div className="flex justify-between items-center border-t border-white/8 pt-4 mb-1">
          <span className="text-xs text-white/50">Celkem zaplatíte bance</span>
          <span className="text-base font-bold text-white">{formatCurrency(result.totalPaid)} Kč</span>
        </div>
      </div>
    </div>
  );
}
