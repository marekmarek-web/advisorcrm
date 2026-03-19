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
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { Calendar } from "lucide-react";

export interface MortgageInputPanelProps {
  state: MortgageState;
  onStateChange: (state: MortgageState) => void;
  /** Not used for rendering; parent uses for result/offers. */
  onResultChange?: () => void;
}

const LTV_BUTTONS_MORTGAGE = [90, 80, 70, 60, 50] as const;
const LTV_BUTTONS_AUTO = [0, 10, 20, 30, 40, 50] as const;

function getTermLimits(state: MortgageState): { min: number; max: number } {
  if (state.product === "mortgage") return TERM_LIMITS.mortgage;
  if (state.loanType === "auto") return TERM_LIMITS.loanAuto;
  return TERM_LIMITS.loanConsumer;
}

export function MortgageInputPanel({
  state,
  onStateChange,
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
  const clampOwn = (v: number) =>
    Math.min(OWN_LIMITS.max, Math.max(OWN_LIMITS.min, v));
  const clampExtra = (v: number) =>
    Math.min(EXTRA_LIMITS.max, Math.max(EXTRA_LIMITS.min, v));
  const clampTerm = (v: number) =>
    Math.min(termLimits.max, Math.max(termLimits.min, v));

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
  const loanLabel =
    state.product === "mortgage"
      ? "Kolik si chcete půjčit"
      : isConsolidation
        ? "Kolik máte stávající závazky"
        : isAuto
          ? "Cena vozu"
          : "Kolik si chcete půjčit";
  const loanMinLabel = state.product === "mortgage" ? "500 tis." : "20 tis.";
  const loanMaxLabel = state.product === "mortgage" ? "30 mil." : "2,5 mil.";

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 md:p-8 shadow-sm border border-slate-200 space-y-5 sm:space-y-6">
      <div>
        <label className="block text-sm font-bold text-slate-600 tracking-wide mb-2">
          <span className="uppercase">{loanLabel}</span>{" "}
          <span className="text-slate-400 font-normal normal-case">(v Kč)</span>
        </label>
        <div className="flex justify-between items-end gap-2 mb-2">
          <input
            type="text"
            inputMode="numeric"
            value={formatCurrency(state.loan)}
            onChange={(e) => handleLoanChange(parseCurrency(e.target.value))}
            className="flex-1 text-right font-extrabold text-2xl md:text-3xl text-slate-900 border-b-2 border-slate-200 focus:border-indigo-500 focus:ring-0 outline-none bg-transparent transition-colors p-1 min-w-0"
          />
        </div>
        <input
          type="range"
          min={lim.min}
          max={lim.max}
          step={lim.step}
          value={state.loan}
          onChange={(e) => handleLoanChange(parseInt(e.target.value, 10))}
          className="w-full min-h-[36px] sm:min-h-[28px] touch-manipulation py-1"
        />
        <div className="flex justify-between text-xs font-medium text-slate-400 mt-1">
          <span>{loanMinLabel}</span>
          <span>{loanMaxLabel}</span>
        </div>
      </div>

      {isConsolidation && (
        <div>
          <label className="block text-sm font-bold text-slate-600 tracking-wide mb-2">
            <span className="uppercase">Peníze navíc</span>{" "}
            <span className="text-slate-400 font-normal normal-case">(v Kč)</span>
          </label>
          <div className="flex justify-between items-end gap-2 mb-2">
            <input
              type="text"
              inputMode="numeric"
              value={formatCurrency(state.extra)}
              onChange={(e) => handleExtraChange(parseCurrency(e.target.value))}
              className="flex-1 text-right font-extrabold text-2xl text-slate-900 border-b-2 border-slate-200 focus:border-indigo-500 focus:ring-0 outline-none bg-transparent transition-colors p-1 min-w-0"
            />
          </div>
          <input
            type="range"
            min={EXTRA_LIMITS.min}
            max={EXTRA_LIMITS.max}
            step={EXTRA_LIMITS.step}
            value={state.extra}
            onChange={(e) => handleExtraChange(parseInt(e.target.value, 10))}
            className="w-full min-h-[36px] sm:min-h-[28px] touch-manipulation py-1"
          />
        </div>
      )}

      {(isMortgage || isAuto) && (
        <div id="ownResourcesBlock">
          <label className="block text-sm font-bold text-slate-600 tracking-wide mb-2">
            <span className="uppercase">
              {isMortgage ? "Vlastní zdroje" : "Akontace"}
            </span>{" "}
            <span className="text-slate-400 font-normal normal-case">(v Kč)</span>
          </label>
          <div className="flex justify-between items-end gap-2 mb-2">
            <input
              type="text"
              inputMode="numeric"
              value={formatCurrency(state.own)}
              onChange={(e) => handleOwnChange(parseCurrency(e.target.value))}
              className="flex-1 text-right font-extrabold text-2xl text-slate-900 border-b-2 border-slate-200 focus:border-indigo-500 focus:ring-0 outline-none bg-transparent transition-colors p-1 min-w-0"
            />
          </div>
          <input
            type="range"
            min={OWN_LIMITS.min}
            max={OWN_LIMITS.max}
            step={OWN_LIMITS.step}
            value={state.own}
            onChange={(e) => handleOwnChange(parseInt(e.target.value, 10))}
            className="w-full min-h-[36px] sm:min-h-[28px] touch-manipulation py-1"
          />
          <div className="flex flex-wrap gap-2 mt-3" role="group" aria-label={isMortgage ? "LTV" : "Akontace"}>
            {(isMortgage ? LTV_BUTTONS_MORTGAGE : LTV_BUTTONS_AUTO)
              .filter((p) => p <= maxLtv)
              .map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setLtv(pct)}
                  className={`min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl font-bold text-sm transition-all touch-manipulation ${
                    state.ltvLock === pct
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {pct} %
                </button>
              ))}
          </div>
        </div>
      )}

      {isMortgage && (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
          <div className="text-xs font-semibold text-slate-500 uppercase mb-1">
            Odhadovaná hodnota nemovitosti
          </div>
          <div className="font-bold text-lg text-slate-900">
            {formatCurrency(result.propertyValue)} Kč
          </div>
        </div>
      )}

      {isAuto && (
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
          <div className="text-xs font-semibold text-slate-500 uppercase mb-1">
            Výše úvěru
          </div>
          <div className="font-bold text-lg text-slate-900">
            {formatCurrency(result.borrowingAmount)} Kč
          </div>
        </div>
      )}

      {result.showLtvWarning && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-rose-600 font-bold">!</span>
          <p className="text-sm text-rose-800">
            LTV přes 91 % ({result.ltvWarningValue} %) znamená vyšší úrok.
          </p>
        </div>
      )}

      {isMortgage && (state.mortgageType === "investment" || state.mortgageType === "american") && (
        <div className="bg-blue-50/50 border border-blue-100/50 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-4 h-4 text-[#0B3A7A] mt-1 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <p className="text-sm text-slate-600">
            U investiční a americké hypotéky je LTV omezeno na max. 70 %.
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-bold text-slate-600 mb-2 uppercase tracking-wide">
          Doba splácení
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={termLimits.min}
            max={termLimits.max}
            step={1}
            value={state.term}
            onChange={(e) => handleTermChange(parseInt(e.target.value, 10))}
            className="flex-1 min-h-[28px] touch-manipulation"
          />
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 font-bold text-slate-900 min-w-[80px] text-center">
            {state.term} {state.term === 1 ? "rok" : "let"}
          </div>
        </div>
        <div className="flex justify-between text-xs font-medium text-slate-400 mt-1">
          <span>{termLimits.min} {termLimits.min === 1 ? "rok" : "let"}</span>
          <span>{termLimits.max} let</span>
        </div>
      </div>

      {isMortgage && (
        <div id="fixationBlock">
          <label className="block text-sm font-bold text-slate-600 mb-2 uppercase tracking-wide">
            Fixace úrokové sazby
          </label>
          <CustomDropdown
            value={String(state.fix)}
            onChange={(id) => handleFixChange(parseInt(id, 10))}
            options={FIX_OPTIONS.map((years) => ({ id: String(years), label: `${years} let` }))}
            placeholder="Fixace"
            icon={Calendar}
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-bold text-slate-600 mb-2 uppercase tracking-wide">
          Typ
        </label>
        <div className="flex flex-wrap gap-2">
          {subTypes.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => selectSubType(sub.id)}
              className={`min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl font-bold text-sm transition-all touch-manipulation ${
                (state.product === "mortgage" ? state.mortgageType : state.loanType) === sub.id
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {sub.label}
            </button>
          ))}
        </div>
        <div className="mt-3 bg-blue-50/50 border border-blue-100/50 rounded-xl p-4">
          <p className="text-sm text-slate-600">
            {subTypes.find((s) => (state.product === "mortgage" ? state.mortgageType : state.loanType) === s.id)?.info}
          </p>
        </div>
      </div>
    </div>
  );
}
