"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X, Plus, Loader2, Save, Info } from "lucide-react";
import {
  createManualPaymentSetup,
  updateManualPaymentSetup,
  type ManualPaymentSetupInput,
} from "@/app/actions/manual-payment-setup";
import { getPartnersForTenant } from "@/app/actions/contracts";
import {
  getInstitutionDefaultAccount,
  type InstitutionDefaultAccount,
} from "@/app/actions/institution-payment-defaults";
import {
  renderInstitutionalAccountTemplate,
  splitContractNumberAndPrefix,
} from "@/lib/institutions/account-template";
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

function humanizePaymentType(t: string | null): string {
  switch (t) {
    case "first":
      return "1. pojistné";
    case "extra":
      return "mimořádné";
    case "employer":
      return "zaměstnavatelský příspěvek";
    case "regular":
      return "běžné";
    default:
      return t ?? "—";
  }
}

function humanizeProductCode(code: string | null): string {
  if (!code) return "—";
  switch (code) {
    case "active_horizont_invest":
      return "Active / Horizont Invest";
    case "classic_invest_czk":
      return "Classic Invest (CZK)";
    case "contract_10_digit":
      return "10místné číslo smlouvy";
    case "contract_8_digit":
      return "8místné číslo smlouvy";
    default:
      return code;
  }
}

function describeSpecificSymbolPlaceholder(template: string): string {
  if (template.includes("{birthNumber}")) return "rodné číslo klienta";
  if (template.includes("{ico}")) return "IČ zaměstnavatele";
  if (template.includes("{yearMonth}")) return "RRRRMM období platby";
  return "dle rámcové smlouvy";
}

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
  currency: string;
  frequency: string;
  firstPaymentDate: string;
  visibleToClient: boolean;
};

const CURRENCY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "CZK", label: "CZK — Česká koruna" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "USD", label: "USD — Dolar" },
  { value: "GBP", label: "GBP — Libra" },
  { value: "PLN", label: "PLN — Zlotý" },
  { value: "HUF", label: "HUF — Forint" },
  { value: "CHF", label: "CHF — Frank" },
];

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
  currency: "CZK",
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

/** Existující instrukce k editaci — všechny hodnoty načtené z DB. */
export type ManualPaymentSetupEdit = {
  id: string;
  providerName?: string | null;
  productName?: string | null;
  segment?: string | null;
  variableSymbol?: string | null;
  accountNumber?: string | null;
  bankCode?: string | null;
  iban?: string | null;
  constantSymbol?: string | null;
  specificSymbol?: string | null;
  amount?: string | null;
  currency?: string | null;
  frequency?: string | null;
  firstPaymentDate?: string | null;
  visibleToClient?: boolean | null;
};

/** Převede ISO/DD.MM.YYYY na yyyy-mm-dd pro <input type="date">. */
function toDateInputValue(value?: string | null): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const czMatch = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (czMatch) {
    const [, d, m, y] = czMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}

export function ManualPaymentSetupModal({
  contactId,
  onClose,
  onSaved,
  prefill,
  editSetup,
}: {
  contactId: string;
  onClose: () => void;
  /** Zavoláno po úspěšném uložení — nadřazená komponenta může obnovit seznam. */
  onSaved: () => void;
  /** Volitelné předvyplnění z kontextu smlouvy (jen při vytváření). */
  prefill?: ManualPaymentSetupPrefill;
  /** Pokud je předáno, modal se přepne do režimu úpravy existujícího záznamu. */
  editSetup?: ManualPaymentSetupEdit;
}) {
  const isEditMode = Boolean(editSetup?.id);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [form, setForm] = useState<FormState>(() => {
    if (editSetup) {
      const combinedAccount =
        editSetup.accountNumber && editSetup.bankCode
          ? `${editSetup.accountNumber}/${editSetup.bankCode}`
          : editSetup.accountNumber ?? "";
      return {
        providerName: editSetup.providerName ?? "",
        productName: editSetup.productName ?? "",
        segment: editSetup.segment ?? "ZP",
        accountNumber: combinedAccount,
        iban: editSetup.iban ?? "",
        variableSymbol: editSetup.variableSymbol ?? "",
        constantSymbol: editSetup.constantSymbol ?? "",
        specificSymbol: editSetup.specificSymbol ?? "",
        amount: editSetup.amount ?? "",
        currency: editSetup.currency ?? "CZK",
        frequency: editSetup.frequency ?? "",
        firstPaymentDate: toDateInputValue(editSetup.firstPaymentDate),
        visibleToClient: editSetup.visibleToClient ?? true,
      };
    }
    return {
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
      ...(prefill?.firstPaymentDate
        ? { firstPaymentDate: toDateInputValue(prefill.firstPaymentDate) }
        : {}),
    };
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [institutionDefault, setInstitutionDefault] = useState<InstitutionDefaultAccount | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void getPartnersForTenant().then(setPartners).catch(() => undefined);
  }, []);

  // F5: Auto-předvyplnění institucionálních defaultů, když se změní provider/segment.
  // Přepisuje pouze prázdná pole (respektujeme ruční zadání poradce).
  useEffect(() => {
    const provider = form.providerName.trim();
    const segment = form.segment.trim();
    if (!provider || !segment) {
      setInstitutionDefault(null);
      return;
    }
    let cancelled = false;
    void getInstitutionDefaultAccount(provider, segment)
      .then((def) => {
        if (cancelled) return;
        setInstitutionDefault(def);
        if (!def) return;
        setForm((f) => {
          let next = f;
          if (!next.accountNumber.trim()) {
            if (!def.accountNumberTemplate && def.accountNumber) {
              next = {
                ...next,
                accountNumber: def.bankCode
                  ? `${def.accountNumber}/${def.bankCode}`
                  : def.accountNumber,
              };
            }
          }
          if (!next.constantSymbol.trim() && def.constantSymbol) {
            next = { ...next, constantSymbol: def.constantSymbol };
          }
          if (
            !next.specificSymbol.trim() &&
            def.specificSymbolTemplate &&
            !def.specificSymbolTemplate.includes("{")
          ) {
            next = { ...next, specificSymbol: def.specificSymbolTemplate };
          }
          return next;
        });
      })
      .catch(() => setInstitutionDefault(null));
    return () => {
      cancelled = true;
    };
  }, [form.providerName, form.segment]);

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
      currency: form.currency || undefined,
      frequency: form.frequency || undefined,
      firstPaymentDate: form.firstPaymentDate || undefined,
      visibleToClient: form.visibleToClient,
    };

    startTransition(async () => {
      const result = isEditMode && editSetup
        ? await updateManualPaymentSetup({ ...input, id: editSetup.id })
        : await createManualPaymentSetup(input);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      if (!isEditMode) setForm(EMPTY_FORM);
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
        className="relative z-10 w-full max-w-xl bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] shadow-2xl flex flex-col max-h-[90dvh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[color:var(--wp-surface-card-border)] shrink-0">
          <div>
            <h3 className="text-base font-black text-[color:var(--wp-text)]">
              {isEditMode ? "Upravit platební instrukci" : "Přidat platební instrukci"}
            </h3>
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
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-2.5 text-sm font-medium text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
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
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-2.5 text-sm font-medium text-[color:var(--wp-text)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
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
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-2.5 text-sm font-medium text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
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
                placeholder={institutionDefault?.accountNumberTemplate ?? "123456789/0800"}
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-2.5 text-sm font-medium text-[color:var(--wp-text)] font-mono placeholder:text-[color:var(--wp-text-tertiary)] placeholder:font-sans focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
              {institutionDefault?.note && (
                <p className="mt-1 flex items-start gap-1 text-[11px] text-[color:var(--wp-text-secondary)]">
                  <Info size={12} className="mt-0.5 shrink-0 text-indigo-500" />
                  <span>{institutionDefault.note}</span>
                </p>
              )}
              {institutionDefault && institutionDefault.alternatives.length > 0 && (
                <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5">
                  <p className="text-[11px] font-semibold text-amber-800 mb-1">
                    Pozor: u této instituce existují další účty podle typu platby nebo produktu
                  </p>
                  <ul className="space-y-0.5 text-[11px] text-amber-900 list-disc pl-4">
                    {institutionDefault.alternatives.map((alt, idx) => {
                      const parts: string[] = [];
                      if (alt.paymentType && alt.paymentType !== "regular") {
                        parts.push(`typ platby: ${humanizePaymentType(alt.paymentType)}`);
                      }
                      if (alt.productCode) parts.push(`produkt: ${humanizeProductCode(alt.productCode)}`);
                      const label = parts.join(", ");
                      const account = alt.accountNumberTemplate
                        ? alt.accountNumberTemplate
                        : alt.accountNumber && alt.bankCode
                          ? `${alt.accountNumber}/${alt.bankCode}`
                          : alt.accountNumber ?? "";
                      return (
                        <li key={idx}>
                          {label ? <span className="font-semibold">{label}:</span> : null}{" "}
                          <span className="font-mono">{account}</span>
                          {alt.note ? <span className="text-amber-800"> — {alt.note}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
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
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-2.5 text-sm font-medium text-[color:var(--wp-text)] font-mono placeholder:text-[color:var(--wp-text-tertiary)] placeholder:font-sans focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>

            {/* Variabilní symbol */}
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                Variabilní symbol {institutionDefault?.variableSymbolRequired === false ? "" : "*"}
              </label>
              <input
                value={form.variableSymbol}
                onChange={(e) => setForm((f) => ({ ...f, variableSymbol: e.target.value }))}
                placeholder={
                  institutionDefault?.variableSymbolRequired === false
                    ? "(není potřeba – instituce VS nevyžaduje)"
                    : "1234567890"
                }
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-2.5 text-sm font-medium text-[color:var(--wp-text)] font-mono placeholder:text-[color:var(--wp-text-tertiary)] placeholder:font-sans focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
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
                placeholder={institutionDefault?.constantSymbol ?? "0308"}
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-2.5 text-sm font-medium text-[color:var(--wp-text)] font-mono placeholder:text-[color:var(--wp-text-tertiary)] placeholder:font-sans focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
              {institutionDefault?.constantSymbol && !form.constantSymbol.trim() && (
                <p className="mt-1 text-[11px] text-[color:var(--wp-text-secondary)]">
                  Doporučený KS pro tuto instituci: <span className="font-mono">{institutionDefault.constantSymbol}</span>
                </p>
              )}
            </div>

            {/* Specifický symbol */}
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                Specifický symbol
              </label>
              <input
                value={form.specificSymbol}
                onChange={(e) => setForm((f) => ({ ...f, specificSymbol: e.target.value }))}
                placeholder={institutionDefault?.specificSymbolTemplate ?? "volitelně"}
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-2.5 text-sm font-medium text-[color:var(--wp-text)] font-mono placeholder:text-[color:var(--wp-text-tertiary)] placeholder:font-sans focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
              {institutionDefault?.specificSymbolTemplate && !form.specificSymbol.trim() && (
                <p className="mt-1 text-[11px] text-[color:var(--wp-text-secondary)]">
                  {institutionDefault.specificSymbolTemplate.includes("{")
                    ? `Vyplňte podle šablony ${institutionDefault.specificSymbolTemplate} (např. ${describeSpecificSymbolPlaceholder(institutionDefault.specificSymbolTemplate)}).`
                    : `Doporučený SS pro tuto instituci: ${institutionDefault.specificSymbolTemplate}`}
                </p>
              )}
            </div>

            {/* Symbol rules note (globální upozornění k VS/SS/KS) */}
            {institutionDefault?.symbolRulesNote && (
              <div className="sm:col-span-2">
                <p className="flex items-start gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] text-indigo-900">
                  <Info size={12} className="mt-0.5 shrink-0 text-indigo-500" />
                  <span>{institutionDefault.symbolRulesNote}</span>
                </p>
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                Částka
              </label>
              <input
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="2 500"
                inputMode="decimal"
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-2.5 text-sm font-medium text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>

            {/* Currency */}
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                Měna
              </label>
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-2.5 text-sm font-medium text-[color:var(--wp-text)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              >
                {CURRENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Frequency */}
            <div>
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                Frekvence
              </label>
              <select
                value={form.frequency}
                onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-2.5 text-sm font-medium text-[color:var(--wp-text)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
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
                className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-2.5 text-sm font-medium text-[color:var(--wp-text)] focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
            </div>
          </div>

          {/* Visible to client toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setForm((f) => ({ ...f, visibleToClient: !f.visibleToClient }))}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                form.visibleToClient ? "bg-emerald-500" : "bg-[color:var(--wp-surface-card-border)]"
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
            {isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isEditMode ? (
              <Save size={16} />
            ) : (
              <Plus size={16} />
            )}
            {isEditMode ? "Uložit změny" : "Uložit instrukci"}
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
