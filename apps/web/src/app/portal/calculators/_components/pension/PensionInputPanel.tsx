"use client";

import { LIMITS, SCENARIO_OPTIONS } from "@/lib/calculators/pension/pension.config";
import { formatCurrency, parseCurrency } from "@/lib/calculators/pension/formatters";
import type { PensionState } from "@/lib/calculators/pension/pension.types";
import { Info } from "lucide-react";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { PiggyBank } from "lucide-react";
import { calculatorSliderGradient } from "@/lib/calculators/calculator-slider-gradient";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface PensionInputPanelProps {
  state: PensionState;
  onStateChange: (state: PensionState) => void;
  estimatedPension: number;
}

export function PensionInputPanel({
  state,
  onStateChange,
  estimatedPension,
}: PensionInputPanelProps) {
  const update = (patch: Partial<PensionState>) => {
    let next = { ...state, ...patch };
    if (patch.age !== undefined && next.age >= next.retireAge) {
      next.retireAge = Math.min(LIMITS.retireAge.max, next.age + 1);
    }
    if (patch.retireAge !== undefined && next.age >= next.retireAge) {
      next.retireAge = Math.min(LIMITS.retireAge.max, next.age + 1);
    }
    onStateChange(next);
  };

  const handleRangeChange = (
    key: keyof Pick<PensionState, "age" | "retireAge" | "salary" | "rent">,
    value: number,
  ) => {
    const lim = LIMITS[key];
    update({ [key]: clamp(value, lim.min, lim.max) });
  };

  const handleTextChange = (
    key: keyof Pick<PensionState, "salary" | "rent">,
    raw: string,
  ) => {
    const num = parseCurrency(raw);
    const lim = LIMITS[key];
    update({ [key]: clamp(num, lim.min, lim.max) });
  };

  return (
    <div className="rounded-[20px] border-[1.5px] border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-[0_1px_3px_rgba(13,31,78,0.06),0_1px_2px_rgba(13,31,78,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.25)] sm:p-6 md:p-7">

      {/* Věk */}
      <div className="mb-0">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--wp-text-tertiary)]">Váš věk</span>
          <div className="flex items-baseline gap-1">
            <input
              type="number"
              inputMode="numeric"
              min={LIMITS.age.min}
              max={LIMITS.age.max}
              value={state.age}
              onChange={(e) => handleRangeChange("age", parseInt(e.target.value, 10) || LIMITS.age.min)}
              onFocus={(e) => e.target.select()}
              className="w-[80px] rounded border-none bg-transparent p-0.5 text-right text-[1.3rem] font-bold text-[color:var(--wp-text)] outline-none transition-colors hover:bg-[color:var(--wp-surface-muted)] focus:bg-indigo-500/15 focus:text-indigo-600 dark:focus:text-indigo-400"
            />
            <span className="text-xs font-semibold text-[color:var(--wp-text-tertiary)]">let</span>
          </div>
        </div>
        <div className="px-2.5 pb-1">
          <input
            type="range"
            min={LIMITS.age.min}
            max={LIMITS.age.max}
            step={LIMITS.age.step}
            value={state.age}
            onChange={(e) => handleRangeChange("age", Number(e.target.value))}
            className="calc-range-slider w-full"
            style={{ background: calculatorSliderGradient(state.age, LIMITS.age.min, LIMITS.age.max) }}
          />
        </div>
        <div className="flex justify-between px-2.5 mt-0.5">
          <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">{LIMITS.age.min} let</span>
          <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">{LIMITS.age.max} let</span>
        </div>
      </div>

      {/* Věk odchodu */}
      <div className="mt-6 pt-6 border-t border-[color:var(--wp-surface-card-border)]">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--wp-text-tertiary)]">Věk odchodu do důchodu</span>
          <div className="flex items-baseline gap-1">
            <input
              type="number"
              inputMode="numeric"
              min={LIMITS.retireAge.min}
              max={LIMITS.retireAge.max}
              value={state.retireAge}
              onChange={(e) => handleRangeChange("retireAge", parseInt(e.target.value, 10) || LIMITS.retireAge.min)}
              onFocus={(e) => e.target.select()}
              className="w-[80px] rounded border-none bg-transparent p-0.5 text-right text-[1.3rem] font-bold text-[color:var(--wp-text)] outline-none transition-colors hover:bg-[color:var(--wp-surface-muted)] focus:bg-indigo-500/15 focus:text-indigo-600 dark:focus:text-indigo-400"
            />
            <span className="text-xs font-semibold text-[color:var(--wp-text-tertiary)]">let</span>
          </div>
        </div>
        <div className="px-2.5 pb-1">
          <input
            type="range"
            min={LIMITS.retireAge.min}
            max={LIMITS.retireAge.max}
            step={LIMITS.retireAge.step}
            value={state.retireAge}
            onChange={(e) => handleRangeChange("retireAge", Number(e.target.value))}
            className="calc-range-slider w-full"
            style={{ background: calculatorSliderGradient(state.retireAge, LIMITS.retireAge.min, LIMITS.retireAge.max) }}
          />
        </div>
        <div className="flex justify-between px-2.5 mt-0.5">
          <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">{LIMITS.retireAge.min} let</span>
          <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">{LIMITS.retireAge.max} let</span>
        </div>
      </div>

      {/* Hrubá mzda */}
      <div className="mt-6 pt-6 border-t border-[color:var(--wp-surface-card-border)]">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--wp-text-tertiary)]">Hrubá mzda měsíčně</span>
          <div className="flex items-baseline gap-1">
            <input
              type="text"
              inputMode="numeric"
              value={formatCurrency(state.salary)}
              onChange={(e) => handleTextChange("salary", e.target.value)}
              onFocus={(e) => e.target.select()}
              className="w-[170px] rounded border-none bg-transparent p-0.5 text-right text-[1.3rem] font-bold text-[color:var(--wp-text)] outline-none transition-colors hover:bg-[color:var(--wp-surface-muted)] focus:bg-indigo-500/15 focus:text-indigo-600 dark:focus:text-indigo-400"
            />
            <span className="text-xs font-semibold text-[color:var(--wp-text-tertiary)]">Kč</span>
          </div>
        </div>
        <div className="px-2.5 pb-1">
          <input
            type="range"
            min={LIMITS.salary.min}
            max={LIMITS.salary.max}
            step={LIMITS.salary.step}
            value={state.salary}
            onChange={(e) => handleRangeChange("salary", Number(e.target.value))}
            className="calc-range-slider w-full"
            style={{ background: calculatorSliderGradient(state.salary, LIMITS.salary.min, LIMITS.salary.max) }}
          />
        </div>
        <div className="flex justify-between px-2.5 mt-0.5">
          <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">{formatCurrency(LIMITS.salary.min)} Kč</span>
          <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">{formatCurrency(LIMITS.salary.max)} Kč</span>
        </div>
      </div>

      {/* Cílová renta */}
      <div className="mt-6 pt-6 border-t border-[color:var(--wp-surface-card-border)]">
        <div className="rounded-[10px] border border-indigo-200/60 bg-indigo-500/10 p-3.5 dark:border-indigo-500/30 dark:bg-indigo-950/35">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-indigo-700 dark:text-indigo-300">Cílová renta v důchodu</span>
            <div className="flex items-baseline gap-1">
              <input
                type="text"
                inputMode="numeric"
                value={formatCurrency(state.rent)}
                onChange={(e) => handleTextChange("rent", e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-[170px] rounded border-none bg-transparent p-0.5 text-right text-[1.3rem] font-bold text-[color:var(--wp-text)] outline-none transition-colors hover:bg-[color:var(--wp-surface-muted)] focus:bg-[color:var(--wp-surface-muted)] focus:text-indigo-600 dark:focus:text-indigo-400"
              />
              <span className="text-xs font-semibold text-[color:var(--wp-text-tertiary)]">Kč</span>
            </div>
          </div>
          <div className="px-2.5 pb-1">
            <input
              type="range"
              min={LIMITS.rent.min}
              max={LIMITS.rent.max}
              step={LIMITS.rent.step}
              value={state.rent}
              onChange={(e) => handleRangeChange("rent", Number(e.target.value))}
              className="calc-range-slider w-full"
              style={{ background: calculatorSliderGradient(state.rent, LIMITS.rent.min, LIMITS.rent.max) }}
            />
          </div>
          <div className="flex justify-between px-2.5 mt-0.5">
            <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">{formatCurrency(LIMITS.rent.min)} Kč</span>
            <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">{formatCurrency(LIMITS.rent.max)} Kč</span>
          </div>
        </div>
      </div>

      {/* Scénář + odhad */}
      <div className="mt-6 pt-6 border-t border-[color:var(--wp-surface-card-border)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--wp-text-tertiary)] mb-2">Scénář důchodu</span>
            <CustomDropdown
              value={state.scenario}
              onChange={(id) => update({ scenario: id as PensionState["scenario"] })}
              options={SCENARIO_OPTIONS.map((opt) => ({ id: opt.value, label: opt.label }))}
              placeholder="Scénář"
              icon={PiggyBank}
            />
          </div>
          <div>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--wp-text-tertiary)] mb-2">Odhad státního důchodu</span>
            <input
              type="text"
              readOnly
              value={`${formatCurrency(estimatedPension)} Kč`}
              className="min-h-[44px] w-full cursor-not-allowed rounded-[10px] border-[1.5px] border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-muted)] px-4 py-2 font-bold text-[color:var(--wp-text)]"
            />
          </div>
        </div>
      </div>

      {/* Info box */}
      <div className="mt-6 pt-6 border-t border-[color:var(--wp-surface-card-border)]">
        <div className="flex items-start gap-3 rounded-[10px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] p-3.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
          <div>
            <div className="mb-0.5 text-sm font-bold text-[color:var(--wp-text)]">Proč mi vychází tak málo?</div>
            <p className="text-xs leading-relaxed text-[color:var(--wp-text-secondary)]">
              Demografická realita: méně pracujících na jednoho důchodce a vyšší
              průměrný věk znamenají tlak na výši státních důchodů.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
