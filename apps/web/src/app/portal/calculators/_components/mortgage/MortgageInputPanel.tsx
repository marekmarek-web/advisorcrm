"use client";

import {
  LIMITS,
  TERM_LIMITS,
  OWN_LIMITS,
  EXTRA_LIMITS,
  PRODUCT_TYPES,
} from "@/lib/calculators/mortgage/mortgage.config";
import { FIX_OPTIONS } from "@/lib/calculators/mortgage/mortgage.constants";
import { formatCurrency, parseCurrency } from "@/lib/calculators/mortgage/formatters";
import {
  ownFromLtvMortgage,
  ownFromLtvAuto,
  calculateResult,
} from "@/lib/calculators/mortgage/mortgage.engine";
import type { MortgageState } from "@/lib/calculators/mortgage/mortgage.types";
import type { MortgageSubType, LoanSubType } from "@/lib/calculators/mortgage/mortgage.types";
import type { ProductType, TabType } from "@/lib/calculators/mortgage";

export interface MortgageInputPanelProps {
  state: MortgageState;
  onStateChange: (state: MortgageState) => void;
  onProductChange: (product: ProductType) => void;
  onTypeChange: (type: TabType) => void;
  onResultChange?: () => void;
}

const LTV_BUTTONS_MORTGAGE = [90, 80, 70] as const;
const LTV_BUTTONS_AUTO = [0, 10, 20, 30, 40, 50] as const;

function getTermLimits(state: MortgageState): { min: number; max: number } {
  if (state.product === "mortgage") return TERM_LIMITS.mortgage;
  if (state.loanType === "auto") return TERM_LIMITS.loanAuto;
  return TERM_LIMITS.loanConsumer;
}

function sliderGradient(value: number, min: number, max: number): string {
  const pct = ((value - min) / (max - min)) * 100;
  return `linear-gradient(90deg, #2563eb 0%, #38bdf8 ${pct}%, #cbd5e1 ${pct}%)`;
}

export function MortgageInputPanel({
  state,
  onStateChange,
  onProductChange,
  onTypeChange,
  onResultChange,
}: MortgageInputPanelProps) {
  const lim = LIMITS[state.product];
  const termLimits = getTermLimits(state);
  const isMortgage = state.product === "mortgage";
  const isConsolidation = state.loanType === "consolidation";
  const isAuto = state.loanType === "auto";
  const maxLtv = isMortgage && (state.mortgageType === "investment" || state.mortgageType === "american") ? 70 : 90;

  const update = (patch: Partial<MortgageState>) => {
    const next = { ...state, ...patch };
    onStateChange(next);
    onResultChange?.();
  };

  const clampLoan = (v: number) => Math.min(lim.max, Math.max(lim.min, v));
  const clampOwn = (v: number) => Math.min(OWN_LIMITS.max, Math.max(OWN_LIMITS.min, v));
  const clampExtra = (v: number) => Math.min(EXTRA_LIMITS.max, Math.max(EXTRA_LIMITS.min, v));
  const clampTerm = (v: number) => Math.min(termLimits.max, Math.max(termLimits.min, v));

  const handleLoanChange = (val: number) => {
    val = clampLoan(val);
    let own = state.own;
    if (state.ltvLock !== null) {
      if (isMortgage) own = ownFromLtvMortgage(val, state.ltvLock);
      else if (isAuto) own = ownFromLtvAuto(val, state.ltvLock);
      own = clampOwn(own);
    }
    update({ loan: val, own });
  };

  const handleOwnChange = (val: number) => {
    update({ own: clampOwn(val), ltvLock: null });
  };

  const handleExtraChange = (val: number) => {
    update({ extra: clampExtra(val) });
  };

  const handleTermChange = (val: number) => {
    update({ term: clampTerm(val) });
  };

  const handleFixChange = (fix: number) => {
    update({ fix });
  };

  const setLtv = (targetVal: number) => {
    if (isMortgage && (state.mortgageType === "investment" || state.mortgageType === "american") && targetVal > 70)
      return;
    let own = state.own;
    if (isMortgage) own = ownFromLtvMortgage(state.loan, targetVal);
    else if (isAuto) own = ownFromLtvAuto(state.loan, targetVal);
    own = clampOwn(own);
    update({ ltvLock: targetVal, own });
  };

  const selectSubType = (id: MortgageSubType | LoanSubType) => {
    if (state.product === "mortgage") {
      const limit70 = id === "investment" || id === "american";
      const nextLtv =
        limit70 && (state.ltvLock === null || state.ltvLock > 70) ? 70 : state.ltvLock;
      const own = nextLtv !== null && limit70 ? ownFromLtvMortgage(state.loan, nextLtv) : state.own;
      update({
        mortgageType: id as MortgageSubType,
        ltvLock: nextLtv,
        own: nextLtv !== null ? clampOwn(own) : state.own,
      });
    } else {
      update({ loanType: id as LoanSubType });
    }
  };

  const subTypes = PRODUCT_TYPES[state.product];
  const result = calculateResult(state);
  const loanLabel = isMortgage ? "Výše hypotéky" : isConsolidation ? "Stávající závazky" : isAuto ? "Cena vozu" : "Výše úvěru";
  const loanMinLabel = isMortgage ? "500 tis. Kč" : "20 tis. Kč";
  const loanMaxLabel = isMortgage ? "30 mil. Kč" : "2,5 mil. Kč";
  const ownResources = Math.max(0, result.propertyValue - state.loan);

  return (
    <div className="bg-white rounded-[20px] border-[1.5px] border-[#e2e8f0] shadow-[0_1px_3px_rgba(13,31,78,0.06),0_1px_2px_rgba(13,31,78,0.04)] p-5 sm:p-6 md:p-7">

      {/* ── Product selector ── */}
      <div className="mb-6 pb-5 border-b border-[#e2e8f0]">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            type="button"
            onClick={() => onProductChange("mortgage")}
            className={`py-3 px-4 rounded-[10px] border-[1.5px] text-sm font-semibold text-center transition-all min-h-[44px] touch-manipulation ${
              state.product === "mortgage"
                ? "bg-[#0d1f4e] border-[#0d1f4e] text-white shadow-[0_2px_10px_rgba(13,31,78,0.18)]"
                : "bg-[#f4f6fb] border-[#cbd5e1] text-[#475569] hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#eff4ff]"
            }`}
          >
            Hypotéka
          </button>
          <button
            type="button"
            onClick={() => onProductChange("loan")}
            className={`py-3 px-4 rounded-[10px] border-[1.5px] text-sm font-semibold text-center transition-all min-h-[44px] touch-manipulation ${
              state.product === "loan"
                ? "bg-[#0d1f4e] border-[#0d1f4e] text-white shadow-[0_2px_10px_rgba(13,31,78,0.18)]"
                : "bg-[#f4f6fb] border-[#cbd5e1] text-[#475569] hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#eff4ff]"
            }`}
          >
            Úvěry
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onTypeChange("new")}
            className={`py-1.5 px-3.5 rounded-full border-[1.5px] text-xs font-medium transition-all min-h-[36px] touch-manipulation whitespace-nowrap ${
              state.type === "new"
                ? "bg-[#0d1f4e] border-[#0d1f4e] text-white font-semibold"
                : "bg-white border-[#cbd5e1] text-[#475569] hover:border-[#2563eb] hover:text-[#2563eb]"
            }`}
          >
            {isMortgage ? "Nová hypotéka" : "Nový úvěr"}
          </button>
          {subTypes.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => selectSubType(sub.id)}
              className={`py-1.5 px-3.5 rounded-full border-[1.5px] text-xs font-medium transition-all min-h-[36px] touch-manipulation whitespace-nowrap ${
                (isMortgage ? state.mortgageType : state.loanType) === sub.id
                  ? "bg-[#0d1f4e] border-[#0d1f4e] text-white font-semibold"
                  : "bg-white border-[#cbd5e1] text-[#475569] hover:border-[#2563eb] hover:text-[#2563eb]"
              }`}
            >
              {sub.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onTypeChange("refi")}
            className={`py-1.5 px-3.5 rounded-full border-[1.5px] text-xs font-medium transition-all min-h-[36px] touch-manipulation whitespace-nowrap ${
              state.type === "refi"
                ? "bg-[#0d1f4e] border-[#0d1f4e] text-white font-semibold"
                : "bg-white border-[#cbd5e1] text-[#475569] hover:border-[#2563eb] hover:text-[#2563eb]"
            }`}
          >
            Refinancování
          </button>
        </div>
      </div>

      {/* ── Loan amount ── */}
      <div className="mb-0">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94a3b8]">{loanLabel}</span>
          <div className="flex items-baseline gap-1">
            <input
              type="text"
              inputMode="numeric"
              value={formatCurrency(state.loan)}
              onChange={(e) => handleLoanChange(parseCurrency(e.target.value))}
              onFocus={(e) => e.target.select()}
              className="text-right font-bold text-[1.3rem] text-[#0d1f4e] bg-transparent border-none outline-none w-[170px] p-0.5 rounded hover:bg-[#f4f6fb] focus:bg-[#eff4ff] focus:text-[#2563eb] transition-colors"
            />
            <span className="text-xs font-semibold text-[#94a3b8]">Kč</span>
          </div>
        </div>
        <div className="px-2.5 pb-1">
          <input
            type="range"
            min={lim.min}
            max={lim.max}
            step={lim.step}
            value={state.loan}
            onChange={(e) => handleLoanChange(parseInt(e.target.value, 10))}
            className="mod-slider w-full"
            style={{ background: sliderGradient(state.loan, lim.min, lim.max) }}
          />
        </div>
        <div className="flex justify-between px-2.5 mt-0.5">
          <span className="text-[11px] text-[#94a3b8]">{loanMinLabel}</span>
          <span className="text-[11px] text-[#94a3b8]">{loanMaxLabel}</span>
        </div>
      </div>

      {/* ── Extra money (consolidation) ── */}
      {isConsolidation && (
        <div className="mt-6 pt-6 border-t border-[#e2e8f0]">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94a3b8]">Peníze navíc</span>
            <div className="flex items-baseline gap-1">
              <input
                type="text"
                inputMode="numeric"
                value={formatCurrency(state.extra)}
                onChange={(e) => handleExtraChange(parseCurrency(e.target.value))}
                onFocus={(e) => e.target.select()}
                className="text-right font-bold text-[1.3rem] text-[#0d1f4e] bg-transparent border-none outline-none w-[170px] p-0.5 rounded hover:bg-[#f4f6fb] focus:bg-[#eff4ff] focus:text-[#2563eb] transition-colors"
              />
              <span className="text-xs font-semibold text-[#94a3b8]">Kč</span>
            </div>
          </div>
          <div className="px-2.5 pb-1">
            <input
              type="range"
              min={EXTRA_LIMITS.min}
              max={EXTRA_LIMITS.max}
              step={EXTRA_LIMITS.step}
              value={state.extra}
              onChange={(e) => handleExtraChange(parseInt(e.target.value, 10))}
              className="mod-slider w-full"
              style={{ background: sliderGradient(state.extra, EXTRA_LIMITS.min, EXTRA_LIMITS.max) }}
            />
          </div>
        </div>
      )}

      {/* ── Own resources / LTV ── */}
      {(isMortgage || isAuto) && (
        <div className="mt-6 pt-6 border-t border-[#e2e8f0]">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94a3b8]">
              {isMortgage ? "Vlastní zdroje" : "Akontace"}
            </span>
            <div className="flex items-baseline gap-1">
              <input
                type="text"
                inputMode="numeric"
                value={formatCurrency(state.own)}
                onChange={(e) => handleOwnChange(parseCurrency(e.target.value))}
                onFocus={(e) => e.target.select()}
                className="text-right font-bold text-[1.3rem] text-[#0d1f4e] bg-transparent border-none outline-none w-[170px] p-0.5 rounded hover:bg-[#f4f6fb] focus:bg-[#eff4ff] focus:text-[#2563eb] transition-colors"
              />
              <span className="text-xs font-semibold text-[#94a3b8]">Kč</span>
            </div>
          </div>
          <div className="px-2.5 pb-1">
            <input
              type="range"
              min={OWN_LIMITS.min}
              max={OWN_LIMITS.max}
              step={OWN_LIMITS.step}
              value={state.own}
              onChange={(e) => handleOwnChange(parseInt(e.target.value, 10))}
              className="mod-slider w-full"
              style={{ background: sliderGradient(state.own, OWN_LIMITS.min, OWN_LIMITS.max) }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94a3b8]">LTV:</span>
            <div className="flex gap-1">
              {(isMortgage ? LTV_BUTTONS_MORTGAGE : LTV_BUTTONS_AUTO)
                .filter((p) => p <= maxLtv)
                .map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setLtv(pct)}
                    className={`py-1 px-2.5 rounded-[7px] border-[1.5px] text-xs font-semibold transition-all min-h-[32px] touch-manipulation ${
                      state.ltvLock === pct
                        ? "bg-[#2563eb] border-[#2563eb] text-white"
                        : "border-[#cbd5e1] text-[#475569] hover:border-[#2563eb] hover:text-[#2563eb]"
                    }`}
                  >
                    {pct} %
                  </button>
                ))}
            </div>
            {isMortgage && (
              <div className="ml-auto bg-[#eff4ff] rounded-[7px] py-1 px-2.5 text-xs font-medium text-[#2563eb]">
                Vlastní zdroje: <strong>{formatCurrency(ownResources)}</strong> Kč
              </div>
            )}
          </div>

          {result.showLtvWarning && (
            <div className="mt-3 flex items-start gap-2 bg-[#fff7ed] border-[1.5px] border-[rgba(234,88,12,0.2)] rounded-[10px] p-2.5 text-xs font-medium text-[#ea580c]">
              <span>⚠️</span>
              <span>LTV nad <strong>{result.ltvWarningValue}</strong> % — většina bank požaduje pojištění nebo účtuje vyšší sazbu.</span>
            </div>
          )}
        </div>
      )}

      {/* ── Term + Fixation side-by-side ── */}
      <div className="mt-6 pt-6 border-t border-[#e2e8f0]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Splatnost */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94a3b8]">Splatnost</span>
              <div className="flex items-baseline gap-1">
                <span className="font-bold text-[1.2rem] text-[#0d1f4e]">{state.term}</span>
                <span className="text-xs font-semibold text-[#94a3b8]">let</span>
              </div>
            </div>
            <div className="px-2.5 pb-1">
              <input
                type="range"
                min={termLimits.min}
                max={termLimits.max}
                step={1}
                value={state.term}
                onChange={(e) => handleTermChange(parseInt(e.target.value, 10))}
                className="mod-slider w-full"
                style={{ background: sliderGradient(state.term, termLimits.min, termLimits.max) }}
              />
            </div>
            <div className="flex justify-between px-2.5 mt-0.5">
              <span className="text-[11px] text-[#94a3b8]">{termLimits.min} let</span>
              <span className="text-[11px] text-[#94a3b8]">{termLimits.max} let</span>
            </div>
          </div>

          {/* Fixace */}
          {isMortgage && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#94a3b8] mb-2">Délka fixace</div>
              <div className="flex gap-1">
                {FIX_OPTIONS.map((years) => (
                  <button
                    key={years}
                    type="button"
                    onClick={() => handleFixChange(years)}
                    className={`flex-1 min-w-[34px] py-2 px-1 text-center rounded-[10px] border-[1.5px] text-xs font-semibold transition-all min-h-[40px] touch-manipulation ${
                      state.fix === years
                        ? "bg-[#0d1f4e] border-[#0d1f4e] text-white"
                        : "border-[#cbd5e1] text-[#475569] hover:border-[#0d1f4e] hover:text-[#0d1f4e]"
                    }`}
                  >
                    {years}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 text-[11px] text-[#94a3b8]">Roků fixní sazby</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Slider styles ── */}
      <style jsx>{`
        .mod-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 5px;
          border-radius: 3px;
          outline: none;
          cursor: pointer;
        }
        .mod-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #fff;
          border: 2.5px solid #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.13), 0 2px 7px rgba(37, 99, 235, 0.28);
          cursor: grab;
          margin-top: -7px;
          transition: transform 0.14s ease, box-shadow 0.14s ease;
        }
        .mod-slider::-webkit-slider-thumb:hover {
          transform: scale(1.22);
          box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.15), 0 4px 12px rgba(37, 99, 235, 0.38);
        }
        .mod-slider::-webkit-slider-thumb:active { cursor: grabbing; transform: scale(1.08); }
        .mod-slider::-webkit-slider-runnable-track { height: 5px; border-radius: 3px; background: transparent; }
        .mod-slider::-moz-range-thumb {
          width: 20px; height: 20px; border-radius: 50%; background: #fff;
          border: 2.5px solid #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.13);
          cursor: grab;
        }
        .mod-slider::-moz-range-track { height: 5px; border-radius: 3px; background: transparent; }
        .mod-slider::-moz-range-progress { background: linear-gradient(90deg, #2563eb, #38bdf8); border-radius: 3px; }
        .mod-slider:focus { outline: none; }
      `}</style>
    </div>
  );
}
