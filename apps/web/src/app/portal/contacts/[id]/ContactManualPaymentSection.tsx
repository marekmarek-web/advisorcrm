"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import {
  CreditCard,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import {
  deleteManualPaymentSetup,
  updatePaymentSetupVisibility,
} from "@/app/actions/manual-payment-setup";
import { resolveInstitutionLogo, institutionInitials } from "@/lib/institutions/institution-logo";
import { SEGMENT_LABELS } from "@/lib/db-constants";
import { formatDomesticAccountDisplayLine } from "@/lib/ai/payment-field-contract";

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

function InstitutionAvatar({ name }: { name: string | null }) {
  const logo = resolveInstitutionLogo(name);
  if (logo) {
    return (
      <Image
        src={logo.src}
        alt={logo.alt}
        width={83}
        height={83}
        className="h-[83px] w-[83px] shrink-0 object-contain"
        unoptimized
      />
    );
  }
  return (
    <div className="h-[83px] w-[83px] rounded-lg bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] text-sm font-black flex items-center justify-center shrink-0">
      {institutionInitials(name)}
    </div>
  );
}

function firstPaymentPillText(firstPaymentDate: string | null): string | null {
  if (!firstPaymentDate) return null;
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
  if (now > twoMonthsAfter) return null;
  return `První platba do ${date.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" })}`;
}

function PaymentSetupCard({
  row,
  contactId,
  onDeleted,
  onVisibilityChanged,
  onEdit,
}: {
  row: PaymentSetupRow;
  contactId: string;
  onDeleted: (id: string) => void;
  onVisibilityChanged: (id: string, visible: boolean) => void;
  onEdit: (row: PaymentSetupRow) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const displayAccount =
    row.iban?.trim() ||
    (row.accountNumber
      ? formatDomesticAccountDisplayLine(row.accountNumber, row.bankCode ?? "")
      : null) ||
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
            onClick={() => onEdit(row)}
            disabled={isPending}
            title="Upravit instrukci"
            className="p-2 rounded-lg text-[color:var(--wp-text-tertiary)] hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50 min-h-[36px] min-w-[36px] flex items-center justify-center"
            aria-label="Upravit platební instrukci"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            onClick={handleToggleVisibility}
            disabled={isPending}
            title={row.visibleToClient ? "Skrýt z portálu klienta" : "Zobrazit v portálu klienta"}
            className="p-2 rounded-lg text-[color:var(--wp-text-tertiary)] hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
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
                className="p-1 rounded-lg text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text)]"
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
              className="p-2 rounded-lg text-[color:var(--wp-text-tertiary)] hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-tertiary)]">
        {row.visibleToClient ? (
          <span className="text-emerald-600">● Viditelné v portálu klienta</span>
        ) : (
          <span>○ Skryto — klient nevidí</span>
        )}
      </div>
    </li>
  );
}

export function ContactManualPaymentSection({
  contactId,
  onOpenModal,
  onEditSetup,
}: {
  contactId: string;
  /** Zavolá rodičovský wrapper, který drží stav modalu. */
  onOpenModal: () => void;
  /** Otevře modal v editačním režimu s předvyplněnými daty. */
  onEditSetup: (row: PaymentSetupRow) => void;
}) {
  const [items, setItems] = useState<PaymentSetupRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  function loadItems() {
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
          setLoadError(data.error ?? "Nepodařilo se načíst platební instrukce.");
          return;
        }
        setItems(data.items ?? []);
      } catch {
        setLoadError("Síťová chyba.");
      }
    })();
  }

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  function handleDeleted(id: string) {
    setItems((prev) => prev?.filter((r) => r.id !== id) ?? null);
  }

  function handleVisibilityChanged(id: string, visible: boolean) {
    setItems(
      (prev) =>
        prev?.map((r) => (r.id === id ? { ...r, visibleToClient: visible } : r)) ?? null
    );
  }

  return (
    <div id="contact-manual-payments" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-[color:var(--wp-text-secondary)]" aria-hidden />
          <h2 className="text-base font-semibold text-[color:var(--wp-text)]">Platební instrukce</h2>
        </div>
        <button
          type="button"
          onClick={onOpenModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black transition-colors min-h-[36px]"
        >
          <Plus size={14} /> Přidat instrukci
        </button>
      </div>

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
              onEdit={onEditSetup}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Exportuje přímou funkci reload pro nadřazené komponenty — volána po uložení
 * z modalu, aby se seznam aktualizoval.
 */
export type { PaymentSetupRow };
