"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import {
  CreditCard,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import {
  createManualPaymentSetup,
  deleteManualPaymentSetup,
  updatePaymentSetupVisibility,
  type ManualPaymentSetupInput,
} from "@/app/actions/manual-payment-setup";
import { getPartnersForTenant } from "@/app/actions/contracts";
import { resolveInstitutionLogo, institutionInitials } from "@/lib/institutions/institution-logo";
import { SEGMENT_LABELS } from "db";

type PartnerOption = { id: string; name: string; segment: string };

type PaymentSetupRow = {
  id: string;
  providerName: string | null;
  productName: string | null;
  segment: string | null;
  accountNumber: string | null;
  bankCode: string | null;
  iban: string | null;
  variableSymbol: string | null;
  constantSymbol: string | null;
  specificSymbol: string | null;
  amount: string | null;
  currency: string | null;
  frequency: string | null;
  firstPaymentDate: string | null;
  visibleToClient: boolean;
  status: string;
  needsHumanReview: boolean | null;
};

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

function InstitutionAvatar({ name }: { name: string | null }) {
  const logo = resolveInstitutionLogo(name);
  if (logo) {
    return (
      <div className="w-8 h-8 rounded-lg overflow-hidden bg-white border border-slate-200 flex items-center justify-center shrink-0">
        <Image src={logo.src} alt={logo.alt} width={32} height={32} className="object-contain" unoptimized />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 text-xs font-black flex items-center justify-center shrink-0">
      {institutionInitials(name)}
    </div>
  );
}

function firstPaymentPillText(firstPaymentDate: string | null): string | null {
  if (!firstPaymentDate) return null;
  // Try ISO yyyy-mm-dd or dd.mm.yyyy
  let date: Date | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(firstPaymentDate)) {
    date = new Date(firstPaymentDate);
  } else if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(firstPaymentDate)) {
    const [d, m, y] = firstPaymentDate.split(".");
    date = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
  }
  if (!date || isNaN(date.getTime())) return null;

  const now = new Date();
  const twoMonthsAfter = new Date(date);
  twoMonthsAfter.setMonth(twoMonthsAfter.getMonth() + 2);

  // Show pill only if date is in the future or within 2 months in the past
  if (now > twoMonthsAfter) return null;

  return `První platba do ${date.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" })}`;
}

function PaymentSetupCard({
  row,
  contactId,
  onDeleted,
  onVisibilityChanged,
}: {
  row: PaymentSetupRow;
  contactId: string;
  onDeleted: (id: string) => void;
  onVisibilityChanged: (id: string, visible: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const displayAccount =
    row.iban?.trim() ||
    (row.accountNumber && row.bankCode
      ? `${row.accountNumber}/${row.bankCode}`
      : row.accountNumber) ||
    null;

  const pill = firstPaymentPillText(row.firstPaymentDate);

  function handleToggleVisibility() {
    startTransition(async () => {
      await updatePaymentSetupVisibility(row.id, contactId, !row.visibleToClient);
      onVisibilityChanged(row.id, !row.visibleToClient);
    });
  }

  function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    startTransition(async () => {
      await deleteManualPaymentSetup(row.id, contactId);
      onDeleted(row.id);
    });
  }

  const isAiProvided = !!row.needsHumanReview === false && !row.visibleToClient && row.status !== "active";

  return (
    <li className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/60 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <InstitutionAvatar name={row.providerName} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
              <span className="font-semibold text-[color:var(--wp-text)] truncate">
                {row.providerName ?? "—"}
                {row.productName ? ` · ${row.productName}` : ""}
              </span>
              {row.segment && SEGMENT_LABELS[row.segment] && (
                <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-wide border border-indigo-100">
                  {SEGMENT_LABELS[row.segment]}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--wp-text-secondary)] mt-1">
              {displayAccount && <span className="font-mono">{displayAccount}</span>}
              {row.variableSymbol && <span>VS: {row.variableSymbol}</span>}
              {row.amount && (
                <span className="font-semibold text-[color:var(--wp-text)]">
                  {Number(row.amount).toLocaleString("cs-CZ")} {row.currency ?? "Kč"}
                </span>
              )}
              {row.frequency && <span>{row.frequency}</span>}
            </div>
            {pill && (
              <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-black uppercase tracking-wide">
                {pill}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleToggleVisibility}
            disabled={isPending}
            title={row.visibleToClient ? "Skrýt z portálu klienta" : "Zobrazit v portálu klienta"}
            className="p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : row.visibleToClient ? (
              <Eye size={16} className="text-emerald-600" />
            ) : (
              <EyeOff size={16} />
            )}
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="px-2 py-1 rounded-lg bg-red-500 text-white text-xs font-bold disabled:opacity-50"
              >
                Smazat?
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              title="Smazat instrukci"
              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {row.visibleToClient ? (
          <span className="text-emerald-600">● Viditelné v portálu klienta</span>
        ) : (
          <span>○ Skryto — klient nevidí</span>
        )}
      </div>
    </li>
  );
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

export function ContactManualPaymentSection({ contactId }: { contactId: string }) {
  const [items, setItems] = useState<PaymentSetupRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/clients/${contactId}/payment-setups`, {
          credentials: "include",
        });
        const data = (await res.json()) as {
          items?: PaymentSetupRow[];
          error?: string;
        };
        if (!res.ok) {
          if (!cancelled) setLoadError(data.error ?? "Nepodařilo se načíst platební instrukce.");
          return;
        }
        if (!cancelled) setItems(data.items ?? []);
      } catch {
        if (!cancelled) setLoadError("Síťová chyba.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getPartnersForTenant();
        if (!cancelled) setPartners(res);
      } catch {
        /* non-blocking */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showForm]);

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
      // Reload list from API
      try {
        const res = await fetch(`/api/clients/${contactId}/payment-setups`, {
          credentials: "include",
        });
        const data = (await res.json()) as { items?: PaymentSetupRow[] };
        setItems(data.items ?? []);
      } catch {
        /* best effort */
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
    });
  }

  function handleDeleted(id: string) {
    setItems((prev) => prev?.filter((r) => r.id !== id) ?? null);
  }

  function handleVisibilityChanged(id: string, visible: boolean) {
    setItems(
      (prev) =>
        prev?.map((r) => (r.id === id ? { ...r, visibleToClient: visible } : r)) ?? null
    );
  }

  const uniqueProviderNames = [...new Set(partners.map((p) => p.name))].sort();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-[color:var(--wp-text-secondary)]" aria-hidden />
          <h2 className="text-base font-semibold text-[color:var(--wp-text)]">Platební instrukce</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black transition-colors min-h-[36px]"
        >
          {showForm ? (
            <>
              <ChevronUp size={14} /> Zavřít
            </>
          ) : (
            <>
              <Plus size={14} /> Přidat instrukci
            </>
          )}
        </button>
      </div>

      {showForm && (
        <div
          ref={formRef}
          className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5 space-y-4"
        >
          <p className="text-xs font-black uppercase tracking-widest text-indigo-600">
            Nová platební instrukce
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Institution / provider */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-[color:var(--wp-text-secondary)] mb-1">
                Instituce / poskytovatel *
              </label>
              <div className="relative">
                <input
                  list="provider-names-list"
                  value={form.providerName}
                  onChange={(e) => handlePartnerSelect(e.target.value)}
                  placeholder="Allianz, Kooperativa, …"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                />
                <datalist id="provider-names-list">
                  {uniqueProviderNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
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

          <div className="flex gap-2 pt-1">
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
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_FORM);
                setFormError(null);
              }}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors min-h-[44px]"
            >
              Zrušit
            </button>
          </div>
        </div>
      )}

      {loadError && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {items === null && !loadError && (
        <div className="flex items-center gap-2 text-sm text-[color:var(--wp-text-secondary)] py-2">
          <Loader2 size={16} className="animate-spin shrink-0" />
          Načítání platebních instrukcí…
        </div>
      )}

      {items !== null && items.length === 0 && (
        <p className="text-sm text-[color:var(--wp-text-secondary)] rounded-xl border border-dashed border-[color:var(--wp-surface-card-border)] px-4 py-5">
          Zatím žádné platební instrukce. Klikněte na „Přidat instrukci" pro ruční zadání, nebo nahrajte smlouvu přes AI Review.
        </p>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((row) => (
            <PaymentSetupCard
              key={row.id}
              row={row}
              contactId={contactId}
              onDeleted={handleDeleted}
              onVisibilityChanged={handleVisibilityChanged}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
