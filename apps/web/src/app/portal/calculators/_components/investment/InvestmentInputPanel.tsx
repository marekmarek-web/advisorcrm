"use client";

import { formatCurrency, parseCurrency } from "@/lib/calculators/investment/formatters";
import { INVESTMENT_DEFAULTS } from "@/lib/calculators/investment/investment.config";
import { calculatorSliderGradient } from "@/lib/calculators/calculator-slider-gradient";

export interface InvestmentInputPanelProps {
  initial: number;
  monthly: number;
  years: number;
  onInitialChange: (v: number) => void;
  onMonthlyChange: (v: number) => void;
  onYearsChange: (v: number) => void;
  profileTitle: string;
  profileDescription: string;
}

export function InvestmentInputPanel({
  initial,
  monthly,
  years,
  onInitialChange,
  onMonthlyChange,
  onYearsChange,
  profileTitle,
  profileDescription,
}: InvestmentInputPanelProps) {
  const clampInitial = (v: number) =>
    Math.min(INVESTMENT_DEFAULTS.initialMax, Math.max(INVESTMENT_DEFAULTS.initialMin, v));
  const clampMonthly = (v: number) =>
    Math.min(INVESTMENT_DEFAULTS.monthlyMax, Math.max(INVESTMENT_DEFAULTS.monthlyMin, v));
  const clampYears = (v: number) =>
    Math.min(INVESTMENT_DEFAULTS.yearsMax, Math.max(INVESTMENT_DEFAULTS.yearsMin, v));

  return (
    <div className="rounded-[20px] border-[1.5px] border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-[0_1px_3px_rgba(13,31,78,0.06),0_1px_2px_rgba(13,31,78,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.25)] sm:p-6 md:p-7">

      {/* Počáteční vklad */}
      <div className="mb-0">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--wp-text-tertiary)]">Počáteční vklad</span>
          <div className="flex items-baseline gap-1">
            <input
              type="text"
              inputMode="numeric"
              value={formatCurrency(initial)}
              onChange={(e) => onInitialChange(clampInitial(parseCurrency(e.target.value)))}
              onFocus={(e) => e.target.select()}
              className="text-right font-bold text-[1.3rem] text-[color:var(--wp-text)] bg-transparent border-none outline-none w-[170px] p-0.5 rounded hover:bg-[color:var(--wp-surface-muted)] focus:bg-indigo-500/15 focus:text-indigo-600 transition-colors dark:focus:text-indigo-400"
            />
            <span className="text-xs font-semibold text-[color:var(--wp-text-tertiary)]">Kč</span>
          </div>
        </div>
        <div className="px-2.5 pb-1">
          <input
            type="range"
            min={INVESTMENT_DEFAULTS.initialMin}
            max={INVESTMENT_DEFAULTS.initialMax}
            step={INVESTMENT_DEFAULTS.initialStep}
            value={initial}
            onChange={(e) => onInitialChange(clampInitial(parseInt(e.target.value, 10)))}
            className="calc-range-slider w-full"
            style={{ background: calculatorSliderGradient(initial, INVESTMENT_DEFAULTS.initialMin, INVESTMENT_DEFAULTS.initialMax) }}
          />
        </div>
        <div className="flex justify-between px-2.5 mt-0.5">
          <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">0 Kč</span>
          <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">2 mil. Kč</span>
        </div>
      </div>

      {/* Měsíční investice */}
      <div className="mt-6 pt-6 border-t border-[color:var(--wp-surface-card-border)]">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--wp-text-tertiary)]">Měsíční investice</span>
          <div className="flex items-baseline gap-1">
            <input
              type="text"
              inputMode="numeric"
              value={formatCurrency(monthly)}
              onChange={(e) => onMonthlyChange(clampMonthly(parseCurrency(e.target.value)))}
              onFocus={(e) => e.target.select()}
              className="text-right font-bold text-[1.3rem] text-[color:var(--wp-text)] bg-transparent border-none outline-none w-[170px] p-0.5 rounded hover:bg-[color:var(--wp-surface-muted)] focus:bg-indigo-500/15 focus:text-indigo-600 transition-colors dark:focus:text-indigo-400"
            />
            <span className="text-xs font-semibold text-[color:var(--wp-text-tertiary)]">Kč</span>
          </div>
        </div>
        <div className="px-2.5 pb-1">
          <input
            type="range"
            min={INVESTMENT_DEFAULTS.monthlyMin}
            max={INVESTMENT_DEFAULTS.monthlyMax}
            step={INVESTMENT_DEFAULTS.monthlyStep}
            value={monthly}
            onChange={(e) => onMonthlyChange(clampMonthly(parseInt(e.target.value, 10)))}
            className="calc-range-slider w-full"
            style={{ background: calculatorSliderGradient(monthly, INVESTMENT_DEFAULTS.monthlyMin, INVESTMENT_DEFAULTS.monthlyMax) }}
          />
        </div>
        <div className="flex justify-between px-2.5 mt-0.5">
          <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">500 Kč</span>
          <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">50 tis. Kč</span>
        </div>
      </div>

      {/* Doba investice */}
      <div className="mt-6 pt-6 border-t border-[color:var(--wp-surface-card-border)]">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--wp-text-tertiary)]">Doba investice</span>
          <div className="flex items-baseline gap-1">
            <span className="font-bold text-[1.2rem] text-[#0d1f4e]">{years}</span>
            <span className="text-xs font-semibold text-[color:var(--wp-text-tertiary)]">let</span>
          </div>
        </div>
        <div className="px-2.5 pb-1">
          <input
            type="range"
            min={INVESTMENT_DEFAULTS.yearsMin}
            max={INVESTMENT_DEFAULTS.yearsMax}
            step={1}
            value={years}
            onChange={(e) => onYearsChange(clampYears(parseInt(e.target.value, 10)))}
            className="calc-range-slider w-full"
            style={{ background: calculatorSliderGradient(years, INVESTMENT_DEFAULTS.yearsMin, INVESTMENT_DEFAULTS.yearsMax) }}
          />
        </div>
        <div className="flex justify-between px-2.5 mt-0.5">
          <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">3 roky</span>
          <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">30 let</span>
        </div>
      </div>

      {/* Info box */}
      <div className="mt-6 pt-6 border-t border-[color:var(--wp-surface-card-border)]">
        <div className="flex items-start gap-3 rounded-[10px] border border-indigo-200/60 bg-indigo-500/10 p-3.5 dark:border-indigo-500/30 dark:bg-indigo-950/35">
          <svg className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div className="text-sm text-[color:var(--wp-text-secondary)]">
            <strong className="mb-0.5 block text-[color:var(--wp-text)]">{profileTitle}</strong>
            <span>{profileDescription}</span>
          </div>
        </div>
      </div>

    </div>
  );
}
