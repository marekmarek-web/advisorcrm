"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { fetchContactDocumentsBundle } from "@/app/dashboard/contacts/contact-documents-bundle";
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
  FileSignature,
  Pencil,
  Trash2,
  FileText,
  MoreHorizontal,
} from "lucide-react";
import type { ContractRow } from "@/app/actions/contracts";
import { mapContractToCanonicalProduct } from "@/lib/products/canonical-product-read";
import { overviewStructuredProductNotesBody } from "@/lib/client-portfolio/portal-portfolio-display";
import { formatDisplayDateCs } from "@/lib/date/format-display-cs";
import { ContractProvenanceLine } from "@/app/components/aidvisora/ContractProvenanceLine";
import { deleteContract } from "@/app/actions/contracts";
import type { LucideIcon } from "lucide-react";
import { resolveInstitutionLogo, institutionInitials } from "@/lib/institutions/institution-logo";


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
    case "ODP_ZAM":
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
    case "ODP_ZAM":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "AUTO_PR":
    case "AUTO_HAV":
      return "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)] border-[color:var(--wp-surface-card-border)]";
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
    ODP_ZAM: "Odpovědnost zaměstnance",
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

const PERSON_ROLE_LABELS: Record<string, string> = {
  policyholder: "Pojistník",
  insured: "Pojištěný",
  child: "Dítě",
  beneficiary: "Oprávněná osoba",
  other: "Ostatní",
};

function personRoleLabel(role: string | undefined): string {
  return PERSON_ROLE_LABELS[role ?? ""] ?? role ?? "Osoba";
}

function ContractDetailCard({
  contract,
  isExpanded,
  onToggle,
  contactId,
  onDelete,
  onOpenPaymentModal,
  onMenuStackDelta,
}: {
  contract: ContractRow;
  isExpanded: boolean;
  onToggle: () => void;
  contactId: string;
  onDelete: (id: string) => void;
  onOpenPaymentModal?: (
    prefill?: {
      providerName?: string;
      productName?: string;
      segment?: string;
      variableSymbol?: string;
      accountNumber?: string;
      iban?: string;
      amount?: string;
      frequency?: string;
      firstPaymentDate?: string;
    }
  ) => void;
  onMenuStackDelta?: (delta: 1 | -1) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    payment: true,
    persons: false,
    risks: false,
    notes: false,
  });
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
  const paymentFrequencyLabel = String(
    (contract.portfolioAttributes as Record<string, unknown> | null)?.paymentFrequencyLabel ??
      (contract.portfolioAttributes as Record<string, unknown> | null)?.paymentFrequency ??
      "",
  ).toLowerCase();
  const hasAnnualPaymentFrequency = /roč|roc|annual/.test(paymentFrequencyLabel);
  const investmentPaymentType =
    product.segmentDetail?.kind === "investment" ? product.segmentDetail.paymentType : null;
  let premium = "—";
  if (investmentPaymentType === "one_time" && premiumMonthly) {
    premium = premiumMonthly.toLocaleString("cs-CZ", { maximumFractionDigits: 0 }) + " Kč jednorázově";
  } else if (hasAnnualPaymentFrequency && premiumAnnual) {
    premium = premiumAnnual.toLocaleString("cs-CZ", { maximumFractionDigits: 0 }) + " Kč / rok";
  } else if (premiumMonthly) {
    premium = premiumMonthly.toLocaleString("cs-CZ", { maximumFractionDigits: 0 }) + " Kč / měs";
  } else if (premiumAnnual) {
    premium = premiumAnnual.toLocaleString("cs-CZ", { maximumFractionDigits: 0 }) + " Kč / rok";
  }

  const inPortal = !!product.visibleToClient;
  const portfolioStatusLabel =
    product.portfolioStatus === "ended"
      ? "Ukončené"
      : product.startDate
        ? "Aktivní"
        : "V evidenci";
  const statusBadgeCls =
    portfolioStatusLabel === "Aktivní"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : portfolioStatusLabel === "Ukončené"
        ? "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]"
        : "bg-amber-50 text-amber-700 border-amber-100";

  // Logo instituce
  const institutionLogo = resolveInstitutionLogo(partnerName);

  // Extract segment-specific fields
  const d = product.segmentDetail;
  const persons = d?.kind === "life_insurance" ? (d.persons ?? []) : [];
  const risks = d?.kind === "life_insurance" ? (d.risks ?? []) : [];
  const paymentVs =
    d?.kind === "life_insurance" ? (d.paymentVariableSymbol ?? null) : null;
  const paymentAccount =
    d?.kind === "life_insurance" ? (d.paymentAccountDisplay ?? null) : null;
  const advisorNote =
    (contract as { notes?: string | null; note?: string | null }).notes ??
    contract.note ??
    "";
  const notesBody = overviewStructuredProductNotesBody(product, advisorNote);

  function toggleSection(s: string) {
    setOpenSections((prev) => ({ ...prev, [s]: !prev[s] }));
  }

  // Close ... menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (!onMenuStackDelta || !menuOpen) return;
    onMenuStackDelta(1);
    return () => onMenuStackDelta(-1);
  }, [menuOpen, onMenuStackDelta]);

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
    const p = new URLSearchParams(searchParams.toString());
    p.delete("add");
    p.set("edit", contract.id);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  function handleVypoved() {
    router.push(
      `/portal/terminations/new?contactId=${encodeURIComponent(contactId)}&contractId=${encodeURIComponent(contract.id)}`,
    );
  }

  return (
    <div
      className={`bg-[color:var(--wp-surface-card)] rounded-[20px] border transition-all duration-200 shadow-sm hover:shadow-md ${
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
          {institutionLogo ? (
            <Image
              src={institutionLogo.src}
              alt={institutionLogo.alt}
              width={83}
              height={83}
              className="h-[83px] w-[83px] shrink-0 object-contain"
              unoptimized
            />
          ) : (
            <div
              className={`h-[83px] w-[83px] rounded-xl flex items-center justify-center shrink-0 border ${iconCls}`}
            >
              <Icon size={29} strokeWidth={2} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <h3
                className={`text-sm font-black truncate transition-colors ${
                  isExpanded ? "text-indigo-700" : "text-[color:var(--wp-text)]"
                }`}
              >
                {displayName}
              </h3>
              <span
                className={`shrink-0 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded border ${statusBadgeCls}`}
              >
                {portfolioStatusLabel}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[10px] font-bold text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)] px-1.5 py-0.5 rounded-md whitespace-nowrap">
                {segLabel}
              </span>
              <span className="text-xs font-bold text-[color:var(--wp-text-secondary)] truncate">{partnerName}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-13 sm:pl-0">
          <div className="text-right mr-1">
            <span className="block text-[9px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-0.5">
              Platba / pojistné / splátka
            </span>
            <span className="text-sm font-black text-[color:var(--wp-text)]">{premium}</span>
          </div>

          {/* Upravit — vždy viditelné */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleEdit(); }}
            title="Upravit smlouvu"
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-card)] text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200 transition-colors shrink-0"
          >
            <Pencil size={14} />
          </button>

          {/* Kontextové menu ... */}
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
              title="Další akce"
              className="w-8 h-8 rounded-lg flex items-center justify-center border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-colors"
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-card)] shadow-xl overflow-hidden z-50">
                {onOpenPaymentModal && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onOpenPaymentModal({
                        providerName: product.partnerName ?? undefined,
                        productName: product.productName ?? undefined,
                        segment: product.segment,
                        variableSymbol: paymentVs ?? product.contractNumber ?? undefined,
                        accountNumber: paymentAccount ?? undefined,
                        amount:
                          hasAnnualPaymentFrequency && product.premiumAnnual != null
                            ? String(product.premiumAnnual)
                            : product.premiumMonthly != null
                            ? String(product.premiumMonthly)
                            : product.premiumAnnual != null
                              ? String(product.premiumAnnual)
                              : undefined,
                        frequency:
                          hasAnnualPaymentFrequency && product.premiumAnnual
                            ? "Ročně"
                            : product.premiumMonthly
                            ? "Měsíčně"
                            : product.premiumAnnual
                              ? "Ročně"
                              : undefined,
                      });
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-colors text-left"
                  >
                    <PayCard size={14} /> Doplnit platební instrukci
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); handleVypoved(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] transition-colors text-left"
                >
                  <FileSignature size={14} /> Výpověď smlouvy
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); void handleDelete(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-rose-600 hover:bg-rose-50 transition-colors text-left disabled:opacity-50"
                >
                  <Trash2 size={14} /> {deleting ? "Mazání…" : "Smazat smlouvu"}
                </button>
              </div>
            )}
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
                Platba / pojistné / splátka
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
                              {personRoleLabel(p.role)}
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

            {/* Poznámky — strukturovaný výpis z kanonického produktu (+ interní poznámka) */}
            {notesBody && (
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
                    {notesBody}
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

          {/* Action footer odstraněn — editace smlouvy probíhá výhradně přes modal (tlačítko tužky v hlavičce karty) */}
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
  { label: "Majetkové pojištění", segments: ["MAJ", "ODP", "ODP_ZAM"] },
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
  onOpenPaymentModal,
}: {
  contactId: string;
  baseQueryNoTab: string;
  onOpenPaymentModal?: (
    prefill?: {
      providerName?: string;
      productName?: string;
      segment?: string;
      variableSymbol?: string;
      accountNumber?: string;
      iban?: string;
      amount?: string;
      frequency?: string;
      firstPaymentDate?: string;
    }
  ) => void;
}) {
  const queryClient = useQueryClient();
  const bundleQK = queryKeys.contacts.documentsBundle(contactId);
  const {
    data: bundleData,
    isPending: loading,
    isError: bundleIsError,
    error: bundleErr,
  } = useQuery({
    queryKey: bundleQK,
    queryFn: () => fetchContactDocumentsBundle(contactId),
    staleTime: 45_000,
  });

  // Poradce MUSÍ vidět všechny smlouvy kontaktu bez ohledu na `sourceKind`.
  // Historická verze zde filtrovala na `ADVISOR_PRODUCT_SOURCE_KINDS`
  // = {"manual","ai_review"}, což schovávalo smlouvy s `sourceKind` "document"
  // (vytvořené z document-extraction / scan flow) i "import" (legacy bulk
  // import) — poradce je nikdy neviděl, přestože klient je měl na portálu
  // (klientský read model `getClientPortfolioForContact` filtruje pouze na
  // `visibleToClient + portfolioStatus`, nikoli na `sourceKind`). Výsledek:
  // smlouva existovala v DB, klient ji viděl, poradce ne → poradce netušil,
  // že smlouvu vůbec má rozjednanou.
  //
  // KPI (`contact-overview-kpi.ts`) si svůj přísnější filter záměrně ponechává,
  // aby nepočítaly rozpracované drafty do Osobní AUM / měsíčních příspěvků.
  // Seznam v UI tu roli nemá — provenienci kartiček zobrazí
  // `ContractProvenanceLine` (ruční záznam / AI Review / dokument / import).
  const contracts = useMemo(() => {
    return bundleData?.contracts ?? [];
  }, [bundleData?.contracts]);

  const loadError = bundleIsError
    ? bundleErr instanceof Error
      ? bundleErr.message
      : "Nepodařilo se načíst smlouvy."
    : null;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contractMenuStack, setContractMenuStack] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const menuStackDelta = useCallback((delta: 1 | -1) => {
    setContractMenuStack((c) => c + delta);
  }, []);

  useEffect(() => {
    if (contracts.length === 0) {
      setExpandedId(null);
      return;
    }
    setExpandedId((prev) =>
      prev != null && contracts.some((c) => c.id === prev) ? prev : contracts[0].id,
    );
  }, [contracts]);

  function handleDelete(id: string) {
    void queryClient.invalidateQueries({ queryKey: bundleQK });
    void queryClient.invalidateQueries({ queryKey: queryKeys.contacts.contractDupPairs(contactId) });
    if (expandedId === id) setExpandedId(null);
  }

  function handleAddProduct() {
    const p = new URLSearchParams(searchParams.toString());
    p.set("add", "1");
    p.delete("edit");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  const groups = groupContracts(contracts);

  return (
    <div
      className={`bg-[color:var(--wp-surface-card)] rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] shadow-sm ${
        contractMenuStack > 0 ? "relative z-50" : ""
      }`}
    >
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
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
          {onOpenPaymentModal && (
            <button
              type="button"
              onClick={() => onOpenPaymentModal()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)] text-xs font-black uppercase tracking-widest transition-all shrink-0 min-h-[40px] flex-1 sm:flex-initial"
            >
              <PayCard size={15} strokeWidth={2.5} aria-hidden /> Doplnit platební instrukci
            </button>
          )}
          <button
            type="button"
            onClick={handleAddProduct}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 shrink-0 min-h-[40px] flex-1 sm:flex-initial"
          >
            <Plus size={15} strokeWidth={2.5} /> Přidat produkt
          </button>
        </div>
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
                      onOpenPaymentModal={onOpenPaymentModal}
                      onMenuStackDelta={menuStackDelta}
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
