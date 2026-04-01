"use client";

import { useState, useEffect } from "react";
import {
  getContractsByContact,
  getContractSegments,
  updateContract,
  deleteContract,
} from "@/app/actions/contracts";
import type { ContractRow } from "@/app/actions/contracts";
import { ProductPicker } from "@/app/components/aidvisora/ProductPicker";
import type { ProductPickerValue } from "@/app/components/aidvisora/ProductPicker";
import { segmentLabel } from "@/app/lib/segment-labels";
import { ZpRatingBadge } from "@/app/components/aidvisora/ZpRatingBadge";
import { EUCS_ZP_DISCLAIMER } from "@/data/insurance-ratings";
import { ConfirmDeleteModal } from "@/app/components/ConfirmDeleteModal";
import { NewContractWizard } from "@/app/components/aidvisora/NewContractWizard";
import { DocumentUploadZone } from "@/app/components/upload/DocumentUploadZone";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";
import { FileText } from "lucide-react";
import {
  annualPremiumFromMonthlyInput,
  annualPremiumPillLabel,
} from "@/lib/contracts/annual-premium-from-monthly";

export function ContractsSection({ contactId }: { contactId: string }) {
  const [list, setList] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [segments, setSegments] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({
    segment: "ZP",
    partnerId: "",
    productId: "",
    partnerName: "",
    productName: "",
    premiumAmount: "",
    premiumAnnual: "",
    contractNumber: "",
    startDate: "",
    anniversaryDate: "",
    note: "",
  });
  const [pickerValue, setPickerValue] = useState<ProductPickerValue>({ partnerId: "", productId: "" });

  function load() {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      getContractsByContact(contactId),
      getContractSegments().then(setSegments),
    ])
      .then(([contracts]) => {
        setList(contracts);
      })
      .catch((err) => {
        setList([]);
        setLoadError(err instanceof Error ? err.message : "Nepodařilo se načíst smlouvy.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => load(), [contactId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash.includes("add=1")) setAdding(true);
    const onHashChange = () => {
      if (window.location.hash.includes("add=1")) setAdding(true);
    };
    const onOpenAdd = () => setAdding(true);
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("contact-open-add-contract", onOpenAdd);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("contact-open-add-contract", onOpenAdd);
    };
  }, []);


  async function handleSubmitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setSubmitError(null);
    const payload = {
      segment: form.segment,
      partnerId: form.partnerId || undefined,
      productId: form.productId || undefined,
      partnerName: form.partnerName || undefined,
      productName: form.productName || undefined,
      premiumAmount: form.premiumAmount || undefined,
      premiumAnnual: form.premiumAnnual || undefined,
      contractNumber: form.contractNumber || undefined,
      startDate: form.startDate || undefined,
      anniversaryDate: form.anniversaryDate || undefined,
      note: form.note || undefined,
    };
    try {
      await updateContract(editingId, payload);
      setForm({
        segment: "ZP",
        partnerId: "",
        productId: "",
        partnerName: "",
        productName: "",
        premiumAmount: "",
        premiumAnnual: "",
        contractNumber: "",
        startDate: "",
        anniversaryDate: "",
        note: "",
      });
      setPickerValue({ partnerId: "", productId: "" });
      setEditingId(null);
      load();
    } catch (err) {
      console.error("Chyba při ukládání smlouvy:", err);
      const message =
        err instanceof Error
          ? err.message
          : "Smlouvu se nepodařilo uložit. Zkontrolujte vyplněné údaje a zkuste to znovu.";
      setSubmitError(message);
    }
  }

  async function doDelete(id: string) {
    setDeletePending(true);
    try {
      await deleteContract(id);
      load();
      if (editingId === id) setEditingId(null);
      setDeleteConfirmId(null);
    } finally {
      setDeletePending(false);
    }
  }

  function startEdit(c: ContractRow) {
    setEditingId(c.id);
    setForm({
      segment: c.segment,
      partnerId: c.partnerId ?? "",
      productId: c.productId ?? "",
      partnerName: c.partnerName ?? "",
      productName: c.productName ?? "",
      premiumAmount: c.premiumAmount ?? "",
      premiumAnnual: c.premiumAnnual ?? "",
      contractNumber: c.contractNumber ?? "",
      startDate: c.startDate ?? "",
      anniversaryDate: c.anniversaryDate ?? "",
      note: c.note ?? "",
    });
    setPickerValue({
      partnerId: c.partnerId ?? "",
      productId: c.productId ?? "",
      partnerName: c.partnerName ?? undefined,
      productName: c.productName ?? undefined,
    });
  }

  if (loading) return <p className="text-[color:var(--wp-text-muted)] text-sm">Načítám smlouvy…</p>;
  const editAnnualPill = annualPremiumPillLabel(form.premiumAmount);

  if (loadError) {
    return (
      <div className="rounded-[var(--wp-radius-lg)] border border-red-200 bg-red-50 p-6 shadow-sm">
        <p className="text-red-600 text-sm mb-3">{loadError}</p>
        <button type="button" onClick={() => load()} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 min-h-[44px]">
          Zkusit znovu
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--wp-radius-lg)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-6 shadow-sm">
      <ConfirmDeleteModal
        open={deleteConfirmId !== null}
        title="Opravdu smazat smlouvu?"
        onConfirm={() => deleteConfirmId && doDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
        loading={deletePending}
      />
      <h2 className="font-semibold text-[color:var(--wp-text)] mb-2">Produkty / Smlouvy</h2>
      <p className="text-xs text-[color:var(--wp-text-muted)] mb-4">
        {EUCS_ZP_DISCLAIMER}
      </p>
      <ul className="space-y-3 mb-4">
        {list.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-muted)] px-4 py-3 text-sm min-h-[44px]">
            <span className="min-w-0">
              {c.contractNumber ? (
                <>
                  <span className="font-medium text-[color:var(--wp-text)]">č. {c.contractNumber}</span>
                  <span className="text-[color:var(--wp-text-muted)]"> · </span>
                </>
              ) : null}
              {segmentLabel(c.segment)} – {c.partnerName || c.productName || "—"}
              {c.premiumAmount ? ` • ${Number(c.premiumAmount).toLocaleString("cs-CZ")} Kč` : ""}
              {c.partnerName && <ZpRatingBadge partnerName={c.partnerName} productName={c.productName ?? undefined} segment={c.segment} />}
            </span>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => startEdit(c)} className="px-3 py-2 rounded-[var(--wp-radius)] text-[var(--wp-accent)] font-medium hover:bg-[color:var(--wp-surface-muted)] min-h-[44px]">
                Upravit
              </button>
              <button type="button" onClick={() => setDeleteConfirmId(c.id)} className="px-3 py-2 rounded-[var(--wp-radius)] text-red-600 font-medium hover:bg-red-50 min-h-[44px]">
                Smazat
              </button>
            </div>
          </li>
        ))}
      </ul>
      <NewContractWizard
        open={adding}
        contactId={contactId}
        onClose={() => { setAdding(false); load(); }}
        onSuccess={() => load()}
      />
      {editingId ? (
        <form onSubmit={handleSubmitEdit} className="space-y-2 max-w-md">
          <div>
            <label className="block text-xs font-medium text-[color:var(--wp-text-muted)]">Segment</label>
            <CustomDropdown
              value={form.segment}
              onChange={(seg) => {
                setForm((f) => ({ ...f, segment: seg, partnerId: "", productId: "", partnerName: "", productName: "" }));
                setPickerValue({ partnerId: "", productId: "" });
              }}
              options={segments.map((s) => ({ id: s, label: segmentLabel(s) }))}
              placeholder="Segment"
              icon={FileText}
            />
          </div>
          <div>
            <ProductPicker
              segment={form.segment}
              value={pickerValue}
              onChange={(v) => {
                setPickerValue(v);
                setForm((f) => ({
                  ...f,
                  partnerId: v.partnerId,
                  productId: v.productId,
                  partnerName: v.partnerName ?? f.partnerName,
                  productName: v.productName ?? f.productName,
                }));
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[color:var(--wp-text-muted)]">Partner / Produkt (text)</label>
            <input
              value={form.partnerName}
              onChange={(e) => setForm((f) => ({ ...f, partnerName: e.target.value }))}
              placeholder="název partnera"
              className="w-full rounded border border-monday-border px-2 py-1.5 text-sm"
            />
            <input
              value={form.productName}
              onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
              placeholder="název produktu"
              className="w-full rounded border border-monday-border px-2 py-1.5 text-sm mt-1"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[color:var(--wp-text-muted)]">Pojistné (měsíční)</label>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <input
                type="number"
                step="0.01"
                min={0}
                inputMode="decimal"
                value={form.premiumAmount}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({
                    ...f,
                    premiumAmount: v,
                    premiumAnnual: annualPremiumFromMonthlyInput(v),
                  }));
                }}
                placeholder="Kč"
                className="w-full max-w-[220px] rounded border border-monday-border px-2 py-1.5 text-sm min-h-[44px]"
              />
              {editAnnualPill ? (
                <span
                  className="inline-flex min-h-[44px] items-center rounded-full border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-muted)] px-3 py-2 text-sm font-semibold text-[color:var(--wp-text)]"
                  aria-live="polite"
                >
                  {editAnnualPill}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-[color:var(--wp-text-muted)] mt-1">Roční pojistné se dopočítá automaticky (× 12).</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[color:var(--wp-text-muted)]">Číslo smlouvy</label>
            <input
              value={form.contractNumber}
              onChange={(e) => setForm((f) => ({ ...f, contractNumber: e.target.value }))}
              placeholder="např. 12345678"
              className="w-full rounded border border-monday-border px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[color:var(--wp-text-muted)] mb-1">Nahrát smlouvu (PDF)</label>
            <DocumentUploadZone
              contactId={contactId}
              initialContractId={editingId}
              submitButtonLabel="Nahrát smlouvu"
              chooseButtonLabel="Vybrat smlouvu (PDF / foto)"
              onUploaded={() => load()}
              className="p-0 border-0 bg-transparent"
            />
          </div>
          <div className="flex gap-2">
            <div>
              <label className="block text-xs font-medium text-[color:var(--wp-text-muted)]">Od</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full rounded border border-monday-border px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[color:var(--wp-text-muted)]">Výročí</label>
              <input
                type="date"
                value={form.anniversaryDate}
                onChange={(e) => setForm((f) => ({ ...f, anniversaryDate: e.target.value }))}
                className="w-full rounded border border-monday-border px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[color:var(--wp-text-muted)]">Poznámka</label>
            <input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className="w-full rounded border border-monday-border px-2 py-1.5 text-sm"
            />
          </div>
          {submitError && <p className="text-sm text-red-600" role="alert">{submitError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded px-3 py-1.5 text-sm font-semibold text-white bg-monday-blue"
            >
              Uložit
            </button>
            <button
              type="button"
              onClick={() => { setEditingId(null); setSubmitError(null); }}
              className="rounded px-3 py-1.5 text-sm font-semibold border border-[color:var(--wp-border-strong)] text-[color:var(--wp-text-muted)]"
            >
              Zrušit
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-[var(--wp-radius)] px-4 py-2.5 text-sm font-semibold bg-[var(--wp-accent)] text-white hover:opacity-90 min-h-[44px]"
        >
          + Přidat produkt / smlouvu
        </button>
      )}
    </div>
  );
}
