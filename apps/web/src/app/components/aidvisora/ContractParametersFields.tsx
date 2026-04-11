"use client";

import type { ContractFormState } from "@/lib/contracts/contract-form-payload";
import {
  contractFormAnnualPillLabel,
} from "@/lib/contracts/contract-form-payload";
import {
  getAnniversaryFieldLabel,
  getMonthlyAmountFieldLabel,
  getMonthlyAmountHelperText,
  segmentShowsPremiumOrContributionFields,
  segmentUsesAnnualPremiumPrimaryInput,
} from "@/lib/contracts/contract-segment-wizard-config";
import {
  annualPremiumFromMonthlyInput,
  monthlyPremiumFromAnnualInput,
} from "@/lib/contracts/annual-premium-from-monthly";

type FieldClasses = { label: string; input: string };

type Props = {
  form: ContractFormState;
  setForm: React.Dispatch<React.SetStateAction<ContractFormState>>;
  classes: FieldClasses;
};

export function ContractParametersFields({ form, setForm, classes }: Props) {
  const showPremium = segmentShowsPremiumOrContributionFields(form.segment);
  const annualPrimary = segmentUsesAnnualPremiumPrimaryInput(form.segment);
  const annualPill = contractFormAnnualPillLabel(form);

  return (
    <div className="space-y-6">
      {showPremium ? (
        <div>
          <label className={classes.label}>{getMonthlyAmountFieldLabel(form.segment)}</label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <input
              type="number"
              step="0.01"
              min={0}
              inputMode="decimal"
              value={annualPrimary ? form.premiumAnnual : form.premiumAmount}
              onChange={(e) => {
                const v = e.target.value;
                if (annualPrimary) {
                  setForm((f) => ({
                    ...f,
                    premiumAnnual: v,
                    premiumAmount: monthlyPremiumFromAnnualInput(v),
                  }));
                } else {
                  setForm((f) => ({
                    ...f,
                    premiumAmount: v,
                    premiumAnnual: annualPremiumFromMonthlyInput(v),
                  }));
                }
              }}
              placeholder="Kč"
              className={`${classes.input} sm:max-w-[200px]`}
            />
            {annualPill ? (
              <span
                className="inline-flex min-h-[44px] items-center rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800"
                aria-live="polite"
              >
                {annualPill}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-400 mt-1">{getMonthlyAmountHelperText(form.segment)}</p>
        </div>
      ) : null}

      <div>
        <label className={classes.label}>Číslo smlouvy</label>
        <input
          value={form.contractNumber}
          onChange={(e) => setForm((f) => ({ ...f, contractNumber: e.target.value }))}
          placeholder="např. 12345678"
          className={classes.input}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className={classes.label}>Od</label>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            className={classes.input}
          />
        </div>
        <div>
          <label className={classes.label}>{getAnniversaryFieldLabel(form.segment)}</label>
          <input
            type="date"
            value={form.anniversaryDate}
            onChange={(e) => setForm((f) => ({ ...f, anniversaryDate: e.target.value }))}
            className={classes.input}
          />
        </div>
      </div>
      <div>
        <label className={classes.label}>Poznámka</label>
        <input
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          className={classes.input}
        />
      </div>
    </div>
  );
}
