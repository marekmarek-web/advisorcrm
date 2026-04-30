"use client";

import type { ContractFormState, ContractPaymentFrequency } from "@/lib/contracts/contract-form-payload";
import {
  contractFormAnnualPillLabel,
  paymentTypeFromFrequency,
} from "@/lib/contracts/contract-form-payload";
import {
  getAnniversaryFieldLabel,
  getMonthlyAmountFieldLabel,
  getMonthlyAmountHelperText,
  getSegmentUiGroup,
  segmentShowsPremiumOrContributionFields,
  segmentUsesAnnualPremiumPrimaryInput,
} from "@/lib/contracts/contract-segment-wizard-config";
import {
  annualPremiumFromMonthlyInput,
} from "@/lib/contracts/annual-premium-from-monthly";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  classifyProduct,
  type ProductCategory,
} from "@/lib/ai/product-categories";

type FieldClasses = { label: string; input: string };

type Props = {
  form: ContractFormState;
  setForm: React.Dispatch<React.SetStateAction<ContractFormState>>;
  classes: FieldClasses;
};

/**
 * Které frekvence nabízet pro daný segment.
 * - Investice (INV/DIP/DPS): měsíčně | ročně | jednorázově (bez čtvrtletí/pololetí — v praxi se
 *   nevyužívá a zbytečně by zahltilo UI).
 * - Pojistné segmenty (ZP, MAJ, ODP…): měsíčně | čtvrtletně | pololetně | ročně | jednorázově.
 * - Úvěry: skryto (premium se nezadává).
 */
function frequencyOptionsForSegment(segment: string): ContractPaymentFrequency[] {
  const group = getSegmentUiGroup(segment);
  if (group === "investment") return ["monthly", "annual", "one_time"];
  if (group === "lending") return [];
  return ["monthly", "quarterly", "semiannual", "annual", "one_time"];
}

const FREQUENCY_LABEL: Record<ContractPaymentFrequency, string> = {
  monthly: "Měsíčně",
  quarterly: "Čtvrtletně",
  semiannual: "Pololetně",
  annual: "Ročně",
  one_time: "Jednorázově",
};

function computeFieldsForFrequency(
  frequency: ContractPaymentFrequency,
  rawInput: string
): { premiumAmount: string; premiumAnnual: string } {
  const v = rawInput?.trim() ?? "";
  if (!v) return { premiumAmount: "", premiumAnnual: "" };
  if (frequency === "monthly") {
    return {
      premiumAmount: v,
      premiumAnnual: annualPremiumFromMonthlyInput(v),
    };
  }
  if (frequency === "annual") {
    return {
      premiumAnnual: v,
      premiumAmount: "",
    };
  }
  if (frequency === "quarterly") {
    const annual = Number(v) * 4;
    if (!Number.isFinite(annual)) return { premiumAmount: v, premiumAnnual: "" };
    const annualStr = annual.toFixed(2);
    return {
      premiumAmount: "",
      premiumAnnual: annualStr,
    };
  }
  if (frequency === "semiannual") {
    const annual = Number(v) * 2;
    if (!Number.isFinite(annual)) return { premiumAmount: v, premiumAnnual: "" };
    const annualStr = annual.toFixed(2);
    return {
      premiumAmount: "",
      premiumAnnual: annualStr,
    };
  }
  // one_time: lump-sum, roční neexistuje.
  return { premiumAmount: v, premiumAnnual: "" };
}

function rawInputForFrequency(form: ContractFormState): string {
  switch (form.paymentFrequency) {
    case "annual":
      return form.premiumAnnual;
    case "monthly":
      return form.premiumAmount;
    case "quarterly":
      // Čtvrtletní = roční / 4, ale zobrazíme přímo pokud je uloženo jinak.
      if (form.premiumAnnual) {
        const q = Number(form.premiumAnnual) / 4;
        return Number.isFinite(q) && q > 0 ? q.toFixed(2) : "";
      }
      return "";
    case "semiannual":
      if (form.premiumAnnual) {
        const h = Number(form.premiumAnnual) / 2;
        return Number.isFinite(h) && h > 0 ? h.toFixed(2) : "";
      }
      return "";
    case "one_time":
      return form.premiumAmount;
    default:
      return form.premiumAmount;
  }
}

function amountFieldLabel(segment: string, frequency: ContractPaymentFrequency): string {
  const group = getSegmentUiGroup(segment);
  if (frequency === "one_time") {
    return group === "investment" ? "Jednorázová investice Kč" : "Pojistné (jednorázové) Kč";
  }
  if (frequency === "annual") {
    return group === "investment" ? "Pravidelná platba (roční) Kč" : "Pojistné (roční) Kč";
  }
  if (frequency === "quarterly") {
    return group === "investment" ? "Pravidelná platba (čtvrtletní) Kč" : "Pojistné (čtvrtletní) Kč";
  }
  if (frequency === "semiannual") {
    return group === "investment" ? "Pravidelná platba (pololetní) Kč" : "Pojistné (pololetní) Kč";
  }
  return group === "investment" ? "Pravidelná platba (měsíční) Kč" : "Pojistné (měsíční) Kč";
}

function amountHelperText(frequency: ContractPaymentFrequency): string {
  switch (frequency) {
    case "monthly":
      return "Roční pojistné se dopočítá automaticky (× 12).";
    case "annual":
      return "Roční platba — měsíční pojistné se nepočítá.";
    case "quarterly":
      return "Roční = zadaná částka × 4. Měsíční pojistné se nepočítá.";
    case "semiannual":
      return "Roční = zadaná částka × 2. Měsíční pojistné se nepočítá.";
    case "one_time":
      return "Jednorázová platba — roční ekvivalent se nepočítá.";
  }
}

export function ContractParametersFields({ form, setForm, classes }: Props) {
  const showPremium = segmentShowsPremiumOrContributionFields(form.segment);
  const annualPrimary = segmentUsesAnnualPremiumPrimaryInput(form.segment);
  const frequency: ContractPaymentFrequency = form.paymentFrequency ?? "monthly";
  const isOneTime = frequency === "one_time";
  const annualPill = isOneTime ? null : contractFormAnnualPillLabel(form);
  const frequencyOptions = frequencyOptionsForSegment(form.segment);
  const showFrequency = showPremium && frequencyOptions.length > 1 && !annualPrimary;

  const segmentGroup = getSegmentUiGroup(form.segment);
  const isInvestment = form.segment === "INV" || form.segment === "DIP";
  const isPension = form.segment === "DPS";
  const isMortgage = form.segment === "HYPO";
  const isConsumerLoan = form.segment === "UVER";
  const isLending = segmentGroup === "lending";
  const showEntryFee = isInvestment;
  const showParticipantContribution = isPension;
  const showLoanPrincipal = isLending;
  const showPpiToggle = isConsumerLoan;

  // Auto-detekce kategorie pro preview (používá stejnou logiku jako server action).
  const detected = classifyProduct({
    providerName: form.partnerName,
    productName: form.productName,
    segment: form.segment,
    paymentType: form.paymentType ?? undefined,
    hasEntryFee: form.entryFee ? Number(form.entryFee.replace(",", ".")) > 0 : undefined,
    hasPpi: form.hasPpi ?? undefined,
  });
  const effectiveCategory: ProductCategory = form.productCategory ?? detected.category;

  return (
    <div className="space-y-6">
      {showFrequency ? (
        <div>
          <label className={classes.label}>Frekvence platby</label>
          <div
            role="radiogroup"
            aria-label="Frekvence platby"
            className="flex flex-wrap gap-2"
          >
            {frequencyOptions.map((opt) => {
              const active = frequency === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    const nextPaymentType = paymentTypeFromFrequency(opt);
                    // Při změně frekvence nepřepočítáváme starou částku — uživatel
                    // zadává novou částku v nové jednotce. Zachovej premiumAmount jako
                    // historickou hodnotu (hook ji může přepsat při novém vstupu).
                    setForm((f) => ({
                      ...f,
                      paymentFrequency: opt,
                      paymentType: nextPaymentType,
                      ...(opt === "one_time" ? { premiumAnnual: "" } : {}),
                    }));
                  }}
                  className={`inline-flex min-h-[40px] items-center rounded-full px-4 py-1 text-sm font-semibold transition ${
                    active
                      ? "bg-slate-900 text-white border border-slate-900"
                      : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {FREQUENCY_LABEL[opt]}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {showPremium ? (
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <label className={classes.label}>
              {annualPrimary
                ? getMonthlyAmountFieldLabel(form.segment, form.paymentType)
                : amountFieldLabel(form.segment, frequency)}
            </label>
            {isOneTime && (
              <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-700">
                Jednorázová
              </span>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <input
              type="number"
              step="0.01"
              min={0}
              inputMode="decimal"
              value={annualPrimary ? form.premiumAnnual : rawInputForFrequency(form)}
              onChange={(e) => {
                const v = e.target.value;
                if (annualPrimary) {
                  setForm((f) => ({
                    ...f,
                    premiumAnnual: v,
                    premiumAmount: "",
                  }));
                  return;
                }
                const { premiumAmount, premiumAnnual } = computeFieldsForFrequency(frequency, v);
                setForm((f) => ({
                  ...f,
                  premiumAmount,
                  premiumAnnual,
                }));
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
          <p className="text-xs text-slate-400 mt-1">
            {annualPrimary
              ? getMonthlyAmountHelperText(form.segment, form.paymentType)
              : amountHelperText(frequency)}
          </p>
        </div>
      ) : null}

      {/* ─── BJ kalkulátor — vstupní pole specifická pro segment ─── */}
      {showEntryFee ? (
        <div>
          <label className={classes.label}>Vstupní poplatek (Kč)</label>
          <input
            type="number"
            step="0.01"
            min={0}
            inputMode="decimal"
            value={form.entryFee}
            onChange={(e) => setForm((f) => ({ ...f, entryFee: e.target.value }))}
            placeholder="např. 10000"
            className={classes.input}
          />
          <p className="text-xs text-slate-400 mt-1">
            Pro BJ přepočet u investic s VP (Amundi 4,2 BJ / 1 000 Kč, Edward 3,6, Codya 4,0, Investika 4,0).
          </p>
        </div>
      ) : null}

      {showParticipantContribution ? (
        <div>
          <label className={classes.label}>Měsíční příspěvek účastníka (Kč)</label>
          <input
            type="number"
            step="0.01"
            min={0}
            inputMode="decimal"
            value={form.participantContribution}
            onChange={(e) => setForm((f) => ({ ...f, participantContribution: e.target.value }))}
            placeholder="např. 1700"
            className={classes.input}
          />
          <p className="text-xs text-slate-400 mt-1">
            Pro BJ přepočet DPS (1,1 BJ / 100 Kč měs., cap 1 700 Kč/měs). Pokud je vyplněno, má přednost před pojistným.
          </p>
        </div>
      ) : null}

      {showLoanPrincipal ? (
        <div>
          <label className={classes.label}>Jistina úvěru (Kč)</label>
          <input
            type="number"
            step="0.01"
            min={0}
            inputMode="decimal"
            value={form.loanPrincipal}
            onChange={(e) => setForm((f) => ({ ...f, loanPrincipal: e.target.value }))}
            placeholder="např. 3500000"
            className={classes.input}
          />
          <p className="text-xs text-slate-400 mt-1">
            {isMortgage
              ? "Pro BJ přepočet hypotéky (RB fix 1-2 roky 44,8 BJ / 1 mil, standard 70 BJ / 1 mil)."
              : "Pro BJ přepočet spotřebitelského úvěru (112–132 BJ / 1 mil dle PPI)."}
          </p>
        </div>
      ) : null}

      {showPpiToggle ? (
        <div>
          <label className={classes.label}>Pojištění schopnosti splácet (PPI)</label>
          <div role="radiogroup" aria-label="PPI" className="flex flex-wrap gap-2">
            {[
              { value: true, label: "Ano" },
              { value: false, label: "Ne" },
              { value: null, label: "Neuvedeno" },
            ].map((opt) => {
              const active = form.hasPpi === opt.value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setForm((f) => ({ ...f, hasPpi: opt.value }))}
                  className={`inline-flex min-h-[40px] items-center rounded-full px-4 py-1 text-sm font-semibold transition ${
                    active
                      ? "bg-slate-900 text-white border border-slate-900"
                      : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            S PPI má úvěr vyšší BJ sazbu (+20 BJ / 1 mil u RSTS).
          </p>
        </div>
      ) : null}

      {/* ─── Kategorie pro provize / BJ přepočet ─── */}
      <div>
        <label className={classes.label}>Typ produktu pro provize</label>
        <select
          value={form.productCategory ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            setForm((f) => ({
              ...f,
              productCategory: v === "" ? null : (v as ProductCategory),
            }));
          }}
          className={classes.input}
        >
          <option value="">Auto-detekce ({PRODUCT_CATEGORY_LABELS[effectiveCategory]})</option>
          {PRODUCT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {PRODUCT_CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-400 mt-1">
          {form.productCategory
            ? "Ručně nastavená kategorie (přepíše auto-detekci)."
            : `Automaticky odvozeno z partnera + segmentu. Aktuálně: ${PRODUCT_CATEGORY_LABELS[effectiveCategory]}.`}
        </p>
      </div>

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
