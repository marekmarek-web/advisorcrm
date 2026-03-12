"use client";

import { useState, useEffect } from "react";
import {
  getContractsByContact,
  getContractSegments,
  createContract,
  updateContract,
  deleteContract,
} from "@/app/actions/contracts";
import type { ContractRow } from "@/app/actions/contracts";
import { ProductPicker } from "@/app/components/weplan/ProductPicker";
import type { ProductPickerValue } from "@/app/components/weplan/ProductPicker";
import { segmentLabel } from "@/app/lib/segment-labels";
import { ZpRatingBadge } from "@/app/components/weplan/ZpRatingBadge";
import { EUCS_ZP_DISCLAIMER } from "@/data/insurance-ratings";
import { uploadDocument } from "@/app/actions/documents";
import { ConfirmDeleteModal } from "@/app/components/ConfirmDeleteModal";

export function ContractsSection({ contactId }: { contactId: string }) {
  const [list, setList] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [segments, setSegments] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
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
  const [contractFile, setContractFile] = useState<File | null>(null);

  function load() {
    setLoading(true);
    Promise.all([
      getContractsByContact(contactId),
      getContractSegments().then(setSegments),
    ])
      .then(([contracts]) => {
        setList(contracts);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => load(), [contactId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash.includes("add=1")) {
      setAdding(true);
    }
    const onHashChange = () => {
      if (window.location.hash.includes("add=1")) setAdding(true);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    let contractId: string | null = null;
    if (editingId) {
      await updateContract(editingId, payload);
      contractId = editingId;
      setEditingId(null);
    } else {
      contractId = await createContract(contactId, payload);
      setAdding(false);
    }
    if (contractId && contractFile?.size) {
      const fd = new FormData();
      fd.set("file", contractFile);
      fd.set("name", contractFile.name);
      try {
        await uploadDocument(contactId, fd, { contractId, visibleToClient: false });
      } catch (err) {
        console.error("Upload smlouvy selhal:", err);
      }
      setContractFile(null);
    }
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
    load();
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

  if (loading) return <p className="text-slate-500 text-sm">Načítám smlouvy…</p>;

  return (
    <div className="rounded-[var(--wp-radius-lg)] border border-slate-200 bg-white p-6 shadow-sm">
      <ConfirmDeleteModal
        open={deleteConfirmId !== null}
        title="Opravdu smazat smlouvu?"
        onConfirm={() => deleteConfirmId && doDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
        loading={deletePending}
      />
      <h2 className="font-semibold text-slate-800 mb-2">Produkty / Smlouvy</h2>
      <p className="text-xs text-slate-500 mb-4">
        {EUCS_ZP_DISCLAIMER}
      </p>
      <ul className="space-y-3 mb-4">
        {list.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--wp-radius)] border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm min-h-[44px]">
            <span className="min-w-0">
              {c.contractNumber ? (
                <>
                  <span className="font-medium text-slate-800">č. {c.contractNumber}</span>
                  <span className="text-slate-500"> · </span>
                </>
              ) : null}
              {segmentLabel(c.segment)} – {c.partnerName || c.productName || "—"}
              {c.premiumAmount ? ` • ${Number(c.premiumAmount).toLocaleString("cs-CZ")} Kč` : ""}
              {c.partnerName && <ZpRatingBadge partnerName={c.partnerName} productName={c.productName ?? undefined} segment={c.segment} />}
            </span>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => startEdit(c)} className="px-3 py-2 rounded-[var(--wp-radius)] text-[var(--wp-accent)] font-medium hover:bg-slate-100 min-h-[44px]">
                Upravit
              </button>
              <button type="button" onClick={() => setDeleteConfirmId(c.id)} className="px-3 py-2 rounded-[var(--wp-radius)] text-red-600 font-medium hover:bg-red-50 min-h-[44px]">
                Smazat
              </button>
            </div>
          </li>
        ))}
      </ul>
      {(adding || editingId) ? (
        <form onSubmit={handleSubmit} className="space-y-2 max-w-md">
          <div>
            <label className="block text-xs font-medium text-slate-500">Segment</label>
            <select
              value={form.segment}
              onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value }))}
              className="w-full rounded border border-monday-border px-2 py-1.5 text-sm"
            >
              {segments.map((s) => (
                <option key={s} value={s}>{segmentLabel(s)}</option>
              ))}
            </select>
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
            <label className="block text-xs font-medium text-slate-500">Partner / Produkt (text)</label>
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
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500">Pojistné (měsíční)</label>
              <input
                type="number"
                step="0.01"
                value={form.premiumAmount}
                onChange={(e) => setForm((f) => ({ ...f, premiumAmount: e.target.value }))}
                placeholder="Kč"
                className="w-full rounded border border-monday-border px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500">Roční pojistné</label>
              <input
                type="number"
                step="0.01"
                value={form.premiumAnnual}
                onChange={(e) => setForm((f) => ({ ...f, premiumAnnual: e.target.value }))}
                placeholder="Kč"
                className="w-full rounded border border-monday-border px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Číslo smlouvy</label>
            <input
              value={form.contractNumber}
              onChange={(e) => setForm((f) => ({ ...f, contractNumber: e.target.value }))}
              placeholder="např. 12345678"
              className="w-full rounded border border-monday-border px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nahrát smlouvu (PDF)</label>
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setContractFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-monday-blue file:px-3 file:py-1 file:text-white file:text-sm"
            />
            {contractFile && <span className="text-xs text-slate-500 mt-1 block">{contractFile.name}</span>}
          </div>
          <div className="flex gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-500">Od</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full rounded border border-monday-border px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500">Výročí</label>
              <input
                type="date"
                value={form.anniversaryDate}
                onChange={(e) => setForm((f) => ({ ...f, anniversaryDate: e.target.value }))}
                className="w-full rounded border border-monday-border px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Poznámka</label>
            <input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              className="w-full rounded border border-monday-border px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded px-3 py-1.5 text-sm font-semibold text-white bg-monday-blue"
            >
              {editingId ? "Uložit" : "Přidat"}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setEditingId(null); setContractFile(null); }}
              className="rounded px-3 py-1.5 text-sm font-semibold border border-slate-300 text-slate-600"
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
