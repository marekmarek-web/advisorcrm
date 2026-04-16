"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Shield,
  TrendingUp,
  PiggyBank,
  CreditCard,
  Home,
  Car,
  Plane,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  Plus,
  CreditCard as PayCard,
  Users,
  AlignLeft,
  CheckCircle2,
  EyeOff,
  FileSignature,
  Edit2,
  Trash2,
  FileText,
} from "lucide-react";
import { getContractsByContact } from "@/app/actions/contracts";
import type { ContractRow } from "@/app/actions/contracts";
import { mapContractToCanonicalProduct } from "@/lib/products/canonical-product-read";
import { formatDisplayDateCs } from "@/lib/date/format-display-cs";
import { ContractProvenanceLine } from "@/app/components/aidvisora/ContractProvenanceLine";
import { deleteContract } from "@/app/actions/contracts";
import type { LucideIcon } from "lucide-react";

function productIcon(segment: string | undefined): LucideIcon {
  switch (segment) {
    case "INV":
    case "DIP":
      return TrendingUp;
    case "DPS":
      return PiggyBank;
    case "HYPO":
    case "UVER":
      return CreditCard;
    case "ZP":
      return Shield;
    case "MAJ":
    case "ODP":
      return Home;
    case "AUTO_PR":
    case "AUTO_HAV":
      return Car;
    case "CEST":
      return Plane;
    case "FIRMA_POJ":
      return Building2;
    default:
      return Briefcase;
  }
}

function segmentIconColors(segment: string | undefined): string {
  switch (segment) {
    case "INV":
    case "DIP":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "DPS":
      return "bg-indigo-100 text-indigo-700 border-indigo-200";
    case "ZP":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "MAJ":
    case "ODP":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "AUTO_PR":
    case "AUTO_HAV":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "HYPO":
    case "UVER":
      return "bg-rose-100 text-rose-700 border-rose-200";
    default:
      return "bg-indigo-100 text-indigo-700 border-indigo-200";
  }
}

function segmentLabel(segment: string | undefined): string {
  const m: Record<string, string> = {
    ZP: "Životní pojištění",
    INV: "Investice",
    DIP: "Investice (DIP)",
    DPS: "Penzijní produkty",
    HYPO: "Úvěry a hypotéky",
    UVER: "Úvěry a hypotéky",
    MAJ: "Majetkové pojištění",
    ODP: "Odpovědnostní pojištění",
    AUTO_PR: "Autopojištění (POV)",
    AUTO_HAV: "Autopojištění (HAV)",
    CEST: "Cestovní pojištění",
    FIRMA_POJ: "Firemní pojištění",
  };
  return m[segment ?? ""] ?? "Ostatní";
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return formatDisplayDateCs(d) || d;
}

function ContractDetailCard({
  contract,
  isExpanded,
  onToggle,
  contactId,
  onDelete,
}: {
  contract: ContractRow;
  isExpanded: boolean;
  onToggle: () => void;
  contactId: string;
  onDelete: (id: string) => void;
}) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    payment: true,
    persons: false,
    notes: false,
  });
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const product = mapContractToCanonicalProduct(contract);
  const Icon = productIcon(product.segment);
  const iconCls = segmentIconColors(product.segment);
  const displayName = product.productName?.trim() || segmentLabel(product.segment);
  const partnerName = product.partnerName ?? "—";
  const segLabel = segmentLabel(product.segment);
  const startDate = fmtDate(product.startDate);
  const contractNumber = product.contractNumber ?? "—";

  // Format premium display from canonical fields
  const premiumMonthly = product.premiumMonthly;
  const premiumAnnual = product.premiumAnnual;
  let premium = "—";
  if (premiumMonthly) {
    premium = premiumMonthly.toLocaleString("cs-CZ", { maximumFractionDigits: 0 }) + " Kč / měs";
  } else if (premiumAnnual) {
    premium = premiumAnnual.toLocaleString("cs-CZ", { maximumFractionDigits: 0 }) + " Kč / rok";
  }

  const inPortal = !!product.visibleToClient;

  // Extract segment-specific fields
  const d = product.segmentDetail;
  const persons = d?.kind === "life_insurance" ? (d.persons ?? []) : [];
  const risks = d?.kind === "life_insurance" ? (d.risks ?? []) : [];
  const paymentVs =
    d?.kind === "life_insurance" ? (d.paymentVariableSymbol ?? null) : null;
  const paymentAccount =
    d?.kind === "life_insurance" ? (d.paymentAccountDisplay ?? null) : null;
  const notes = (contract as { notes?: string | null; note?: string | null }).notes ??
    (contract as { notes?: string | null; note?: string | null }).note ?? "";

  function toggleSection(s: string) {
    setOpenSections((prev) => ({ ...prev, [s]: !prev[s] }));
  }

  async function handleDelete() {
    if (!confirm(`Opravdu smazat smlouvu ${displayName}?`)) return;
    setDeleting(true);
    try {
      await deleteContract(contract.id);
      onDelete(contract.id);
    } catch {
      // noop — keep item visible
    } finally {
      setDeleting(false);
    }
  }

  function handleEdit() {
    router.push(`${pathname}?tab=smlouvy&edit=${contract.id}`);
  }

  return (
    <div
      className={`bg-[color:var(--wp-surface-card)] rounded-[20px] border transition-all duration-200 overflow-hidden shadow-sm hover:shadow-md ${
        isExpanded
          ? "border-indigo-300 ring-2 ring-indigo-50"
          : "border-[color:var(--wp-surface-card-border)] hover:border-indigo-200"
      }`}
    >
      {/* Header row — always visible */}
      <div
        onClick={onToggle}
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors p-4 sm:p-5 ${
          isExpanded ? "bg-indigo-50/30" : "bg-[color:var(--wp-surface-card)] hover:bg-[color:var(--wp-surface-muted)]/40"
        }`}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${iconCls}`}
          >
            <Icon size={20} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className={`text-sm font-black truncate transition-colors ${
                  isExpanded ? "text-indigo-700" : "text-[color:var(--wp-text)]"
                }`}
              >
                {displayName}
              </h3>
              <span className="text-[10px] font-bold text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)] px-1.5 py-0.5 rounded-md whitespace-nowrap">
                {segLabel}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs font-bold text-[color:var(--wp-text-secondary)] truncate">
              <span className="truncate">{partnerName}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 pl-13 sm:pl-0">
          <div className="text-right">
            <span className="block text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-0.5">
              Pojistné / Vklad
            </span>
            <span className="text-sm font-black text-[color:var(--wp-text)]">{premium}</span>
          </div>
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all duration-200 shrink-0 ${
              isExpanded
                ? "bg-indigo-600 text-white border-indigo-600 rotate-180"
                : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-tertiary)] border-[color:var(--wp-surface-card-border)]"
            }`}
          >
            <ChevronDown size={16} />
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-[color:var(--wp-surface-card-border)]">
          {/* Data grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 bg-[color:var(--wp-surface-muted)]/30">
            <div>
              <span className="block text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
                Pojistné / Vklad
              </span>
              <span className="text-sm font-bold text-[color:var(--wp-text)]">{premium}</span>
            </div>
            <div>
              <span className="block text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
                Číslo smlouvy
              </span>
              <span className="text-xs font-bold text-[color:var(--wp-text)] font-mono bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] px-2 py-1 rounded-md inline-block">
                {contractNumber}
              </span>
            </div>
            <div>
              <span className="block text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
                Počátek
              </span>
              <span className="text-sm font-bold text-[color:var(--wp-text)]">{startDate}</span>
            </div>
          </div>

          {/* Accordion sub-sections */}
          <div className="p-4 sm:p-5 space-y-2">
            {/* Payment */}
            {(paymentAccount || paymentVs) && (
              <div className="border border-[color:var(--wp-surface-card-border)] rounded-xl overflow-hidden bg-[color:var(--wp-surface-card)]">
                <button
                  type="button"
                  onClick={() => toggleSection("payment")}
                  className={`w-full flex items-center justify-between p-3.5 text-left transition-colors ${
                    openSections.payment
                      ? "bg-[color:var(--wp-surface-muted)]/60 border-b border-[color:var(--wp-surface-card-border)]"
                      : "hover:bg-[color:var(--wp-surface-muted)]/40"
                  }`}
                >
                  <span
                    className={`flex items-center gap-2 text-sm font-bold ${
                      openSections.payment ? "text-indigo-600" : "text-[color:var(--wp-text)]"
                    }`}
                  >
                    <PayCard size={16} /> Platební instrukce
                  </span>
                  {openSections.payment ? (
                    <ChevronDown size={16} className="text-[color:var(--wp-text-tertiary)]" />
                  ) : (
                    <ChevronRight size={16} className="text-[color:var(--wp-text-tertiary)]" />
                  )}
                </button>
                {openSections.payment && (
                  <div className="p-4 space-y-2 text-xs">
                    {paymentAccount && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[color:var(--wp-text-secondary)] font-bold">Účet:</span>
                        <span className="font-mono font-black text-[color:var(--wp-text)] bg-[color:var(--wp-surface-muted)] px-1.5 py-0.5 rounded">
                          {paymentAccount}
                        </span>
                      </div>
                    )}
                    {paymentVs && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[color:var(--wp-text-secondary)] font-bold">VS:</span>
                        <span className="font-mono font-black text-[color:var(--wp-text)] bg-[color:var(--wp-surface-muted)] px-1.5 py-0.5 rounded">
                          {paymentVs}
                        </span>
                      </div>
                    )}
                    {premium && premium !== "—" && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[color:var(--wp-text-secondary)] font-bold">Výše:</span>
                        <span className="font-black text-indigo-600">{premium}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Persons */}
            {persons.length > 0 && (
              <div className="border border-[color:var(--wp-surface-card-border)] rounded-xl overflow-hidden bg-[color:var(--wp-surface-card)]">
                <button
                  type="button"
                  onClick={() => toggleSection("persons")}
                  className={`w-full flex items-center justify-between p-3.5 text-left transition-colors ${
                    openSections.persons
                      ? "bg-[color:var(--wp-surface-muted)]/60 border-b border-[color:var(--wp-surface-card-border)]"
                      : "hover:bg-[color:var(--wp-surface-muted)]/40"
                  }`}
                >
                  <span
                    className={`flex items-center gap-2 text-sm font-bold ${
                      openSections.persons ? "text-indigo-600" : "text-[color:var(--wp-text)]"
                    }`}
                  >
                    <Users size={16} /> Oprávněné osoby / Pojistníci
                    <span className="ml-1 text-[10px] font-black bg-indigo-100 text-indigo-700 px-1.5 rounded">
                      {persons.length}
                    </span>
                  </span>
                  {openSections.persons ? (
                    <ChevronDown size={16} className="text-[color:var(--wp-text-tertiary)]" />
                  ) : (
                    <ChevronRight size={16} className="text-[color:var(--wp-text-tertiary)]" />
                  )}
                </button>
                {openSections.persons && (
                  <div className="p-4 space-y-2">
                    {persons.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 text-sm text-[color:var(--wp-text)]"
                      >
                        <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-black text-[11px] shrink-0">
                          {(p.name ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-bold">{p.name ?? "—"}</span>
                          {p.role && (
                            <span className="ml-2 text-[10px] font-bold text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)] px-1.5 py-0.5 rounded-md">
                              {p.role}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Risks */}
            {risks.length > 0 && (
              <div className="border border-[color:var(--wp-surface-card-border)] rounded-xl overflow-hidden bg-[color:var(--wp-surface-card)]">
                <button
                  type="button"
                  onClick={() => toggleSection("risks")}
                  className={`w-full flex items-center justify-between p-3.5 text-left transition-colors ${
                    openSections.risks
                      ? "bg-[color:var(--wp-surface-muted)]/60 border-b border-[color:var(--wp-surface-card-border)]"
                      : "hover:bg-[color:var(--wp-surface-muted)]/40"
                  }`}
                >
                  <span
                    className={`flex items-center gap-2 text-sm font-bold ${
                      openSections.risks ? "text-indigo-600" : "text-[color:var(--wp-text)]"
                    }`}
                  >
                    <Shield size={16} /> Rizika / Krytí
                    <span className="ml-1 text-[10px] font-black bg-purple-100 text-purple-700 px-1.5 rounded">
                      {risks.length}
                    </span>
                  </span>
                  {openSections.risks ? (
                    <ChevronDown size={16} className="text-[color:var(--wp-text-tertiary)]" />
                  ) : (
                    <ChevronRight size={16} className="text-[color:var(--wp-text-tertiary)]" />
                  )}
                </button>
                {openSections.risks && (
                  <div className="p-4 space-y-1.5">
                    {risks.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-3 text-xs text-[color:var(--wp-text)]"
                      >
                        <span className="font-semibold">{r.label ?? "—"}</span>
                        {r.amount && (
                          <span className="font-black text-[color:var(--wp-text-secondary)]">
                            {r.amount}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            {notes && (
              <div className="border border-[color:var(--wp-surface-card-border)] rounded-xl overflow-hidden bg-[color:var(--wp-surface-card)]">
                <button
                  type="button"
                  onClick={() => toggleSection("notes")}
                  className={`w-full flex items-center justify-between p-3.5 text-left transition-colors ${
                    openSections.notes
                      ? "bg-[color:var(--wp-surface-muted)]/60 border-b border-[color:var(--wp-surface-card-border)]"
                      : "hover:bg-[color:var(--wp-surface-muted)]/40"
                  }`}
                >
                  <span
                    className={`flex items-center gap-2 text-sm font-bold ${
                      openSections.notes ? "text-indigo-600" : "text-[color:var(--wp-text)]"
                    }`}
                  >
                    <AlignLeft size={16} /> Poznámky k produktu
                  </span>
                  {openSections.notes ? (
                    <ChevronDown size={16} className="text-[color:var(--wp-text-tertiary)]" />
                  ) : (
                    <ChevronRight size={16} className="text-[color:var(--wp-text-tertiary)]" />
                  )}
                </button>
                {openSections.notes && (
                  <div className="p-4 text-sm text-[color:var(--wp-text-secondary)] whitespace-pre-wrap">
                    {notes}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Metadata footer */}
          <div className="px-5 py-3 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/40 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs font-bold text-[color:var(--wp-text-tertiary)]">
            {inPortal && (
              <span className="flex items-center gap-1.5 text-emerald-600">
                <CheckCircle2 size={13} /> Viditelné v klientské zóně
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <FileText size={13} />
              <ContractProvenanceLine
                sourceKind={contract.sourceKind}
                sourceDocumentId={contract.sourceDocumentId}
                sourceContractReviewId={contract.sourceContractReviewId}
                advisorConfirmedAt={contract.advisorConfirmedAt}
              />
            </span>
          </div>

          {/* Action footer */}
          <div className="px-5 py-4 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleEdit}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl border border-[color:var(--wp-surface-card-border)] text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors min-h-[36px]"
            >
              <Edit2 size={15} /> Upravit
            </button>
            {!inPortal && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-colors min-h-[36px]"
              >
                <EyeOff size={15} /> Skrýt v portálu
              </button>
            )}
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl border border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-colors min-h-[36px]"
            >
              <FileSignature size={15} /> Výpověď
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors ml-auto min-h-[36px] disabled:opacity-50"
            >
              <Trash2 size={15} /> {deleting ? "Mazání…" : "Smazat"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Skupiny segmentů pro zobrazení v přehledu */
const SEGMENT_GROUPS: { label: string; segments: string[] }[] = [
  { label: "Životní pojištění", segments: ["ZP"] },
  { label: "Investice", segments: ["INV", "DIP"] },
  { label: "Penzijní produkty", segments: ["DPS"] },
  { label: "Úvěry a hypotéky", segments: ["HYPO", "UVER"] },
  { label: "Majetkové pojištění", segments: ["MAJ", "ODP"] },
  { label: "Autopojištění", segments: ["AUTO_PR", "AUTO_HAV"] },
  { label: "Cestovní pojištění", segments: ["CEST"] },
  { label: "Firemní pojištění", segments: ["FIRMA_POJ"] },
  { label: "Ostatní", segments: [] },
];

function groupContracts(
  contracts: ContractRow[],
): { label: string; contracts: ContractRow[] }[] {
  const groups: { label: string; contracts: ContractRow[] }[] = [];
  const usedIds = new Set<string>();

  for (const g of SEGMENT_GROUPS) {
    const isOther = g.segments.length === 0;
    const matching = contracts.filter((c) => {
      if (usedIds.has(c.id)) return false;
      const p = mapContractToCanonicalProduct(c);
      if (isOther) return true;
      return g.segments.includes(p.segment ?? "");
    });
    if (matching.length > 0) {
      matching.forEach((c) => usedIds.add(c.id));
      groups.push({ label: g.label, contracts: matching });
    }
  }
  return groups;
}

export function ContactContractsOverview({
  contactId,
  baseQueryNoTab,
}: {
  contactId: string;
  baseQueryNoTab: string;
}) {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    getContractsByContact(contactId)
      .then((list) => {
        setLoadError(null);
        setContracts(list);
        if (list.length > 0) setExpandedId(list[0].id);
      })
      .catch(() => {
        setContracts([]);
        setLoadError("Nepodařilo se načíst smlouvy.");
      })
      .finally(() => setLoading(false));
  }, [contactId]);

  function handleDelete(id: string) {
    setContracts((prev) => prev.filter((c) => c.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function handleAddProduct() {
    router.push(`${pathname}?tab=smlouvy&add=1`);
  }

  const groups = groupContracts(contracts);

  return (
    <div className="bg-[color:var(--wp-surface-card)] rounded-[24px] border border-[color:var(--wp-surface-card-border)] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-[color:var(--wp-surface-card-border)]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-[color:var(--wp-text)] flex items-center gap-2">
            <Briefcase size={18} className="text-indigo-500" aria-hidden />
            Sjednané a rozjednané produkty
          </h2>
          {contracts.length > 0 && (
            <p className="text-xs font-bold text-[color:var(--wp-text-tertiary)] mt-0.5">
              Klikněte na produkt pro zobrazení detailu a platebních údajů.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleAddProduct}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 shrink-0 min-h-[40px]"
        >
          <Plus size={15} strokeWidth={2.5} /> Přidat produkt
        </button>
      </div>

      {/* Body */}
      <div className="p-4 sm:p-5">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-[16px] bg-[color:var(--wp-surface-muted)]"
              />
            ))}
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {loadError}
          </div>
        ) : contracts.length === 0 ? (
          <div className="py-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[color:var(--wp-surface-muted)] flex items-center justify-center mx-auto mb-3">
              <Briefcase size={22} className="text-[color:var(--wp-text-tertiary)]" />
            </div>
            <p className="text-sm font-bold text-[color:var(--wp-text-secondary)] mb-1">
              Žádné produkty v evidenci
            </p>
            <p className="text-xs text-[color:var(--wp-text-tertiary)] mb-4">
              Přidejte produkt nebo počkejte na zpracování z AI Review.
            </p>
            <button
              type="button"
              onClick={handleAddProduct}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors min-h-[40px]"
            >
              <Plus size={15} /> Přidat první produkt
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="flex items-center gap-2 mb-2.5">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                    {group.label}
                  </h3>
                  <span className="text-[10px] font-black bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] px-1.5 py-0.5 rounded-md">
                    {group.contracts.length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {group.contracts.map((c) => (
                    <ContractDetailCard
                      key={c.id}
                      contract={c}
                      isExpanded={expandedId === c.id}
                      onToggle={() => setExpandedId((prev) => (prev === c.id ? null : c.id))}
                      contactId={contactId}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
