"use client";

import { LIMITS } from "@/lib/calculators/life/life.config";
import { formatCurrency } from "@/lib/calculators/life/formatters";
import type { LifeState } from "@/lib/calculators/life/life.types";
import { Info } from "lucide-react";
import { calculatorSliderGradient } from "@/lib/calculators/calculator-slider-gradient";

const INPUT_GROUPS: Array<{
  id: keyof Pick<LifeState, "age" | "netIncome" | "expenses" | "liabilities" | "reserves">;
  label: string;
  unit: string;
}> = [
  { id: "age", label: "Váš věk", unit: "let" },
  { id: "netIncome", label: "Čistý měsíční příjem", unit: "Kč" },
  { id: "expenses", label: "Nutné měsíční výdaje", unit: "Kč" },
  { id: "liabilities", label: "Hypotéka a závazky", unit: "Kč" },
  { id: "reserves", label: "Vlastní rezervy", unit: "Kč" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface LifeInputPanelProps {
  state: LifeState;
  onStateChange: (state: LifeState) => void;
}

export function LifeInputPanel({ state, onStateChange }: LifeInputPanelProps) {
  const update = (patch: Partial<LifeState>) => onStateChange({ ...state, ...patch });

  const handleRangeChange = (
    id: keyof Pick<LifeState, "age" | "netIncome" | "expenses" | "liabilities" | "reserves">,
    value: number,
  ) => {
    const lim = LIMITS[id];
    update({ [id]: clamp(value, lim.min, lim.max) });
  };

  const handleTextChange = (
    id: keyof Pick<LifeState, "age" | "netIncome" | "expenses" | "liabilities" | "reserves">,
    raw: string,
  ) => {
    const num = parseInt(raw.replace(/[^0-9]/g, ""), 10) || 0;
    const lim = LIMITS[id];
    update({ [id]: clamp(num, lim.min, lim.max) });
  };

  const expensesWarning = state.expenses > state.netIncome;

  const fmtMin = (id: string, lim: { min: number }, unit: string) =>
    id === "age" ? `${lim.min} ${unit}` : `${formatCurrency(lim.min)} ${unit}`;
  const fmtMax = (id: string, lim: { max: number }, unit: string) =>
    id === "age" ? `${lim.max} ${unit}` : `${formatCurrency(lim.max)} ${unit}`;

  return (
    <div className="rounded-[20px] border-[1.5px] border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-[0_1px_3px_rgba(13,31,78,0.06),0_1px_2px_rgba(13,31,78,0.04)] dark:shadow-[0_1px_3px_rgba(0,0,0,0.25)] sm:p-6 md:p-7">

      {INPUT_GROUPS.map(({ id, label, unit }, idx) => {
        const lim = LIMITS[id];
        const value = state[id];
        const isWarning = id === "expenses" && expensesWarning;
        const isFirst = idx === 0;
        return (
          <div key={id} className={`${!isFirst ? "mt-6 border-t border-[color:var(--wp-surface-card-border)] pt-6" : ""} ${isWarning ? "rounded-[10px] border-[1.5px] border-[rgba(234,88,12,0.2)] bg-[#fff7ed] p-3 dark:border-amber-500/35 dark:bg-amber-950/35" : ""}`}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--wp-text-tertiary)]">{label}</span>
              <div className="flex items-baseline gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  value={id === "age" ? String(value) : formatCurrency(value)}
                  onChange={(e) => handleTextChange(id, e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-[170px] rounded border-none bg-transparent p-0.5 text-right text-[1.3rem] font-bold text-[color:var(--wp-text)] outline-none transition-colors hover:bg-[color:var(--wp-surface-muted)] focus:bg-indigo-500/15 focus:text-indigo-600 dark:focus:text-indigo-400"
                />
                <span className="text-xs font-semibold text-[color:var(--wp-text-tertiary)]">{unit}</span>
              </div>
            </div>
            <div className="px-2.5 pb-1">
              <input
                type="range"
                min={lim.min}
                max={lim.max}
                step={lim.step}
                value={value}
                onChange={(e) => handleRangeChange(id, Number(e.target.value))}
                className="calc-range-slider w-full"
                style={{ background: calculatorSliderGradient(value, lim.min, lim.max) }}
              />
            </div>
            <div className="flex justify-between px-2.5 mt-0.5">
              <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">{fmtMin(id, lim, unit)}</span>
              <span className="text-[11px] text-[color:var(--wp-text-tertiary)]">{fmtMax(id, lim, unit)}</span>
            </div>
            {isWarning && (
              <div className="mt-2 flex items-center gap-2 text-xs font-bold text-[#ea580c] dark:text-amber-300">
                <Info className="h-4 w-4 shrink-0" />
                Pozor: Výdaje převyšují příjem.
              </div>
            )}
          </div>
        );
      })}

      {/* Rodina */}
      <div className="mt-6 border-t border-[color:var(--wp-surface-card-border)] pt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--wp-text-tertiary)]">Děti</span>
            <input
              type="number"
              min={LIMITS.children.min}
              max={LIMITS.children.max}
              value={state.children}
              onChange={(e) => update({ children: clamp(parseInt(e.target.value, 10) || 0, LIMITS.children.min, LIMITS.children.max) })}
              className="min-h-[44px] w-full rounded-[10px] border-[1.5px] border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-card)] px-4 py-2 font-bold text-[color:var(--wp-text)] outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[color:var(--wp-text-tertiary)]">Manžel/ka</span>
            <button
              type="button"
              onClick={() => update({ hasSpouse: !state.hasSpouse })}
              className={`min-h-[44px] w-full rounded-[10px] border-[1.5px] py-2 font-semibold transition-all ${
                state.hasSpouse
                  ? "bg-[#0d1f4e] border-[#0d1f4e] text-white"
                  : "border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:border-indigo-500 dark:hover:text-indigo-300"
              }`}
              aria-pressed={state.hasSpouse}
            >
              {state.hasSpouse ? "ANO" : "NE"}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
