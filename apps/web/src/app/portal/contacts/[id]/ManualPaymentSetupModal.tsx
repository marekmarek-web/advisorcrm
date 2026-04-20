"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import {
  createManualPaymentSetup,
  type ManualPaymentSetupInput,
} from "@/app/actions/manual-payment-setup";
import { getPartnersForTenant } from "@/app/actions/contracts";
import { SEGMENT_LABELS } from "@/lib/db-constants";

type PartnerOption = { id: string; name: string; segment: string };

const SEGMENT_OPTIONS = Object.entries(SEGMENT_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const FREQUENCY_OPTIONS = [
  "Měsíčně",
  "Čtvrtletně",
  "Pololetně",
  "Ročně",
  "Jednorázově",
];

type FormState = {
  providerName: string;
  productName: string;
  segment: string;
  accountNumber: string;
  iban: string;
  variableSymbol: string;
  constantSymbol: string;
  specificSymbol: string;
  amount: string;
  frequency: string;
  firstPaymentDate: string;
  visibleToClient: boolean;
};

const EMPTY_FORM: FormState = {
  providerName: "",
  productName: "",
  segment: "ZP",
  accountNumber: "",
  iban: "",
  variableSymbol: "",
  constantSymbol: "",
  specificSymbol: "",
  amount: "",
  frequency: "Měsíčně",
  firstPaymentDate: "",
  visibleToClient: true,
};

export type ManualPaymentSetupPrefill = {
  providerName?: string;
  productName?: string;
  segment?: string;
  variableSymbol?: string;
  /** Tuzemské číslo účtu (případně ve tvaru „1234/0800" — zobrazí se tak jak přijde). */
  accountNumber?: string;
  /** Samostatný kód banky (přebije hodnotu zjištěnou z accountNumber). */
  bankCode?: string;
  /** IBAN (pokud v dokumentu). */
  iban?: string;
  constantSymbol?: string;
  specificSymbol?: string;
  /** Částka v Kč (např. z AI Review — částka k úhradě nebo měsíční platba). */
  amount?: string;
  /** Lidská frekvence plateb („Měsíčně", „Jednorázově" …). */
  frequency?: string;
  /** Datum první platby / splatnosti (ISO nebo lidský tvar). */
  firstPaymentDate?: string;
};

export function ManualPaymentSetupModal({
  contactId,
  onClose,
  onSaved,
  prefill,
}: {
  contactId: string;
  onClose: () => void;
  /** Zavoláno po úspěšném uložení — nadřazená komponenta může obnovit seznam. */
  onSaved: () => void;
  /** Volitelné předvyplnění z kontextu smlouvy. */
  prefill?: ManualPaymentSetupPrefill;
}) {
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [form, setForm] = useState<FormState>({
    ...EMPTY_FORM,
    ...(prefill?.providerName ? { providerName: prefill.providerName } : {}),
    ...(prefill?.productName ? { productName: prefill.productName } : {}),
    ...(prefill?.segment ? { segment: prefill.segment } : {}),
    ...(prefill?.variableSymbol ? { variableSymbol: prefill.variableSymbol } : {}),
    ...(prefill?.accountNumber
      ? {
          accountNumber: prefill.bankCode
            ? `${prefill.accountNumber}/${prefill.bankCode}`.replace(/\/+$/, "")
            : prefill.accountNumber,
        }
      : {}),
    ...(prefill?.iban ? { iban: prefill.iban } : {}),
    ...(prefill?.constantSymbol ? { constantSymbol: prefill.constantSymbol } : {}),
    ...(prefill?.specificSymbol ? { specificSymbol: prefill.specificSymbol } : {}),
    ...(prefill?.amount ? { amount: prefill.amount } : {}),
    ...(prefill?.frequency ? { frequency: prefill.frequency } : {}),
    ...(prefill?.firstPaymentDate ? { firstPaymentDate: prefill.firstPaymentDate } : {}),
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getPartnersForTenant().then(setPartners).catch(() => undefined);
  }, []);

  // Zavření Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handlePartnerSelect(name: string) {
    const partner = partners.find((p) => p.name === name);
    setForm((f) => ({
      ...f,
      providerName: name,
      segment: partner?.segment ?? f.segment,
    }));
  }

  function handleSubmit() {
    setFormError(null);
    const input: ManualPaymentSetupInput = {
      contactId,
      providerName: form.providerName,
      productName: form.productName || undefined,
      segment: form.segment,
      accountNumber: form.accountNumber,
      iban: form.iban || undefined,
      variableSymbol: form.variableSymbol,
      constantSymbol: form.constantSymbol || undefined,
      specificSymbol: form.specificSymbol || undefined,
      amount: form.amount || undefined,
      frequency: form.frequency || undefined,
      firstPaymentDate: form.firstPaymentDate || undefined,
      visibleToClient: form.visibleToClient,
    };

    startTransition(async () => {
      const result = await createManualPaymentSetup(input);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setForm(EMPTY_FORM);
      onSaved();
      onClose();
    });
  }

  const uniqueProviderNames = [...new Set(partners.map((p) => p.name))].sort();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      <div
        ref={scrollRef}
        className="relative z-10 w-full max-w-xl bg-[color:var(--wp-surface-card)] rounded-[24px] border border-[color:var(--wp-surface-card-border)] shadow-2xl flex flex-col max-h-[90dvh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[color:var(--wp-surface-card-border)] shrink-0">
          <div>
            <h3 className="text-base font-black text-[color:var(--wp-text)]">Přidat platební instrukci</h3>
            <p className="text-xs text-[color:var(--wp-text-secondary)] mt-0.5">
              Interní evidence pro klientský portál — nezahrnuje doporučení produktu.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-muted)] transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
            aria-label="Zavřít"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollovatelné tělo */}
        <div className="overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Institution / provider */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                Instituce / poskytovatel *
              </label>
              <input
                list="mp-provider-names-list"
                value={form.providerName}
                onChange={(e) => handlePartnerSelect(e.target.value)}
                placeholder="Allianz, Kooperativa, …"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
              <datalist id="mp-provider-names-list">
                {uniqueProviderNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>

            {/* Segment */}
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                Segment *
              </label>
              <select
                value={form.segment}
                onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              >
                {SEGMENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Product name */}
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                Název produktu
              </label>
              <input
                value={form.productName}
                onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
                placeholder="Životní pojištění FLEXI, …"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>

            {/* Account number */}
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                Číslo účtu *
              </label>
              <input
                value={form.accountNumber}
                onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
                placeholder="123456789/0800"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 font-mono placeholder:text-slate-400 placeholder:font-sans focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>

            {/* IBAN */}
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                IBAN (volitelně)
              </label>
              <input
                value={form.iban}
                onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))}
                placeholder="CZ65 0800 0000 0001 2345 6789"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 font-mono placeholder:text-slate-400 placeholder:font-sans focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>

            {/* Variabilní symbol */}
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                Variabilní symbol *
              </label>
              <input
                value={form.variableSymbol}
                onChange={(e) => setForm((f) => ({ ...f, variableSymbol: e.target.value }))}
                placeholder="1234567890"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 font-mono placeholder:text-slate-400 placeholder:font-sans focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>

            {/* Konstantní symbol */}
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                Konstantní symbol
              </label>
              <input
                value={form.constantSymbol}
                onChange={(e) => setForm((f) => ({ ...f, constantSymbol: e.target.value }))}
                placeholder="0308"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 font-mono placeholder:text-slate-400 placeholder:font-sans focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>

            {/* Specifický symbol */}
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                Specifický symbol
              </label>
              <input
                value={form.specificSymbol}
                onChange={(e) => setForm((f) => ({ ...f, specificSymbol: e.target.value }))}
                placeholder="volitelně"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 font-mono placeholder:text-slate-400 placeholder:font-sans focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                Částka (Kč)
              </label>
              <input
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="2 500"
                inputMode="decimal"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>

            {/* Frequency */}
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                Frekvence
              </label>
              <select
                value={form.frequency}
                onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              >
                <option value="">— nevybráno —</option>
                {FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {/* First payment date */}
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                Datum první platby
              </label>
              <input
                type="date"
                value={form.firstPaymentDate}
                onChange={(e) => setForm((f) => ({ ...f, firstPaymentDate: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>
          </div>

          {/* Visible to client toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setForm((f) => ({ ...f, visibleToClient: !f.visibleToClient }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                form.visibleToClient ? "bg-emerald-500" : "bg-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  form.visibleToClient ? "translate-x-5" : ""
                }`}
              />
            </div>
            <span className="text-sm font-semibold text-[color:var(--wp-text)]">
              Zobrazit v portálu klienta
            </span>
          </label>

          {formError && (
            <p className="text-sm font-semibold text-red-600 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              {formError}
            </p>
          )}
        </div>

        {/* Footer akce */}
        <div className="px-6 pb-5 pt-4 border-t border-[color:var(--wp-surface-card-border)] flex gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black transition-colors disabled:opacity-60 min-h-[44px]"
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Uložit instrukci
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] text-sm font-semibold hover:bg-[color:var(--wp-surface-muted)] transition-colors min-h-[44px]"
          >
            Zrušit
          </button>
        </div>
      </div>
    </div>
  );
}
