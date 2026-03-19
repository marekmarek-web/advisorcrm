"use client";

import { LIMITS, DEFAULT_STATE, SCENARIO_OPTIONS } from "@/lib/calculators/pension/pension.config";
import { formatCurrency, parseCurrency } from "@/lib/calculators/pension/formatters";
import type { PensionState } from "@/lib/calculators/pension/pension.types";
import { PiggyBank, Info } from "lucide-react";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";

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
    value: number
  ) => {
    const lim = LIMITS[key];
    value = clamp(value, lim.min, lim.max);
    update({ [key]: value });
  };

  const handleTextChange = (
    key: keyof Pick<PensionState, "salary" | "rent">,
    raw: string
  ) => {
    const num = parseCurrency(raw);
    const lim = LIMITS[key];
    const value = clamp(num, lim.min, lim.max);
    update({ [key]: value });
  };

  return (
    <div className="bg-white rounded-2xl p-5 md:p-10 shadow-sm border border-[#D6E6FF]/60">
      <h3 className="text-slate-500 font-bold uppercase tracking-wider text-sm mb-8 flex items-center gap-2">
        <PiggyBank className="w-4 h-4 text-indigo-500" />
        Vaše údaje
      </h3>

      <div className="space-y-10">
        <div>
          <div className="flex justify-between items-end mb-4">
            <label htmlFor="age-range" className="text-sm font-bold text-slate-600 tracking-wide">
              <span className="uppercase">Váš věk</span>{" "}
              <span className="text-slate-400 font-normal normal-case">(let)</span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={LIMITS.age.min}
              max={LIMITS.age.max}
              value={state.age}
              onChange={(e) =>
                handleRangeChange("age", parseInt(e.target.value, 10) || LIMITS.age.min)
              }
              className="text-right font-extrabold text-2xl md:text-3xl text-slate-900 border-b-2 border-slate-200 focus:border-indigo-500 outline-none w-24 bg-transparent transition-colors p-1 min-w-0"
            />
          </div>
          <input
            type="range"
            id="age-range"
            min={LIMITS.age.min}
            max={LIMITS.age.max}
            step={LIMITS.age.step}
            value={state.age}
            onChange={(e) => handleRangeChange("age", Number(e.target.value))}
            className="w-full min-h-[28px] touch-manipulation"
          />
          <div className="flex justify-between text-xs font-medium text-slate-400 mt-3">
            <span>{LIMITS.age.min} let</span>
            <span>{LIMITS.age.max} let</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-end mb-4">
            <label htmlFor="retireAge-range" className="text-sm font-bold text-slate-600 tracking-wide">
              <span className="uppercase">Věk odchodu do důchodu</span>{" "}
              <span className="text-slate-400 font-normal normal-case">(let)</span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={LIMITS.retireAge.min}
              max={LIMITS.retireAge.max}
              value={state.retireAge}
              onChange={(e) =>
                handleRangeChange(
                  "retireAge",
                  parseInt(e.target.value, 10) || LIMITS.retireAge.min
                )
              }
              className="text-right font-extrabold text-2xl md:text-3xl text-slate-900 border-b-2 border-slate-200 focus:border-indigo-500 outline-none w-24 bg-transparent transition-colors p-1 min-w-0"
            />
          </div>
          <input
            type="range"
            id="retireAge-range"
            min={LIMITS.retireAge.min}
            max={LIMITS.retireAge.max}
            step={LIMITS.retireAge.step}
            value={state.retireAge}
            onChange={(e) => handleRangeChange("retireAge", Number(e.target.value))}
            className="w-full min-h-[28px] touch-manipulation"
          />
          <div className="flex justify-between text-xs font-medium text-slate-400 mt-3">
            <span>{LIMITS.retireAge.min} let</span>
            <span>{LIMITS.retireAge.max} let</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-end mb-4">
            <label htmlFor="salary-range" className="text-sm font-bold text-slate-600 tracking-wide">
              <span className="uppercase">Hrubá mzda měsíčně</span>{" "}
              <span className="text-slate-400 font-normal normal-case">(Kč)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={formatCurrency(state.salary)}
              onChange={(e) => handleTextChange("salary", e.target.value)}
              className="text-right font-extrabold text-2xl md:text-3xl text-slate-900 border-b-2 border-slate-200 focus:border-indigo-500 outline-none w-48 md:w-56 bg-transparent transition-colors p-1 min-w-0"
            />
          </div>
          <input
            type="range"
            id="salary-range"
            min={LIMITS.salary.min}
            max={LIMITS.salary.max}
            step={LIMITS.salary.step}
            value={state.salary}
            onChange={(e) => handleRangeChange("salary", Number(e.target.value))}
            className="w-full min-h-[28px] touch-manipulation"
          />
          <div className="flex justify-between text-xs font-medium text-slate-400 mt-3">
            <span>{formatCurrency(LIMITS.salary.min)} Kč</span>
            <span>{formatCurrency(LIMITS.salary.max)} Kč</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-end mb-4">
            <label htmlFor="rent-range" className="text-sm font-bold text-slate-600 tracking-wide">
              <span className="uppercase">Cílová renta v důchodu (dnes)</span>{" "}
              <span className="text-slate-400 font-normal normal-case">(Kč)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={formatCurrency(state.rent)}
              onChange={(e) => handleTextChange("rent", e.target.value)}
              className="text-right font-extrabold text-2xl md:text-3xl text-slate-900 border-b-2 border-slate-200 focus:border-indigo-500 outline-none w-48 md:w-56 bg-transparent transition-colors p-1 min-w-0"
            />
          </div>
          <input
            type="range"
            id="rent-range"
            min={LIMITS.rent.min}
            max={LIMITS.rent.max}
            step={LIMITS.rent.step}
            value={state.rent}
            onChange={(e) => handleRangeChange("rent", Number(e.target.value))}
            className="w-full min-h-[28px] touch-manipulation"
          />
          <div className="flex justify-between text-xs font-medium text-slate-400 mt-3">
            <span>{formatCurrency(LIMITS.rent.min)} Kč</span>
            <span>{formatCurrency(LIMITS.rent.max)} Kč</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-600 mb-2 uppercase tracking-wide">
            Scénář odhadu státního důchodu
          </label>
          <CustomDropdown
            value={state.scenario}
            onChange={(id) =>
              update({ scenario: id as PensionState["scenario"] })
            }
            options={SCENARIO_OPTIONS.map((opt) => ({ id: opt.value, label: opt.label }))}
            placeholder="Scénář"
            icon={PiggyBank}
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-600 mb-2 uppercase tracking-wide">
            Odhad státního důchodu
          </label>
          <input
            type="text"
            readOnly
            value={`${formatCurrency(estimatedPension)} Kč`}
            className="w-full bg-slate-100 border border-slate-200 text-slate-900 font-bold py-3.5 px-4 rounded-xl cursor-not-allowed min-h-[48px]"
          />
        </div>
      </div>

      <div className="mt-8 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div className="flex items-start gap-2">
          <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold text-slate-900 mb-1">
              Proč mi vychází tak málo?
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              Demografická realita: méně pracujících na jednoho důchodce a vyšší
              průměrný věk znamenají tlak na výši státních důchodů. Odhad vychází
              z náhradových poměrů a scénáře vývoje; reálná výše může být nižší.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
