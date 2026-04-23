"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  Briefcase,
  Building2,
  Car,
  ChevronDown,
  HeartPulse,
  Home,
  Landmark,
  PiggyBank,
  Plane,
  Shield,
  TrendingUp,
  Users,
} from "lucide-react";
import type { ContractRow } from "@/app/actions/contracts";
import { formatDisplayDateCs } from "@/lib/date/format-display-cs";
import {
  aggregatePortfolioMetrics,
  mapContractToCanonicalProduct,
  PORTFOLIO_GROUP_LABELS,
  segmentToPortfolioGroup,
  type PortfolioUiGroup,
} from "@/lib/client-portfolio/read-model";
import {
  canonicalPortfolioDetailRowsForClientPortfolioCard,
  formatPortalPremiumLineCs,
  isFvEligibleSegment,
  portfolioContractStatusLabelCs,
  resolvePortalProductDisplayLogo,
  resolveFvMonthlyContribution,
} from "@/lib/client-portfolio/portal-portfolio-display";
import { institutionInitials } from "@/lib/institutions/institution-logo";
import type { CanonicalProduct } from "@/lib/products/canonical-product-read";
import {
  computeSharedFutureValueFromRate,
  SHARED_FV_DISCLAIMER,
} from "@/lib/fund-library/shared-future-value-pure";
import type {
  PortalFvContractAux,
  PortalFvContractAuxMap,
} from "@/lib/client-portfolio/portal-portfolio-fv-precompute.types";

type VisibleDocMap = Record<string, { name: string }>;

function contractToCanonical(c: ContractRow): CanonicalProduct {
  return mapContractToCanonicalProduct({
    id: c.id,
    contactId: c.contactId,
    segment: c.segment,
    type: c.type,
    partnerId: c.partnerId,
    productId: c.productId,
    partnerName: c.partnerName,
    productName: c.productName,
    premiumAmount: c.premiumAmount,
    premiumAnnual: c.premiumAnnual,
    contractNumber: c.contractNumber,
    startDate: c.startDate,
    anniversaryDate: c.anniversaryDate,
    note: c.note,
    visibleToClient: c.visibleToClient,
    portfolioStatus: c.portfolioStatus,
    sourceKind: c.sourceKind,
    portfolioAttributes: c.portfolioAttributes,
  });
}

function groupIcon(g: PortfolioUiGroup): LucideIcon {
  switch (g) {
    case "investments_pensions": return PiggyBank;
    case "loans": return Landmark;
    case "income_protection_life": return HeartPulse;
    case "children": return Users;
    case "property_liability": return Home;
    case "vehicles": return Car;
    case "travel": return Plane;
    case "business": return Building2;
    default: return Briefcase;
  }
}

function groupIconColors(g: PortfolioUiGroup): string {
  switch (g) {
    case "investments_pensions": return "bg-emerald-100 text-emerald-600";
    case "loans": return "bg-rose-100 text-rose-600";
    case "income_protection_life": return "bg-purple-100 text-purple-600";
    case "children": return "bg-pink-100 text-pink-600";
    case "property_liability": return "bg-blue-100 text-blue-600";
    case "vehicles": return "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]";
    case "travel": return "bg-sky-100 text-sky-600";
    case "business": return "bg-amber-100 text-amber-600";
    default: return "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]";
  }
}

const PERSON_ROLE_LABELS: Record<string, string> = {
  policyholder: "Pojistník",
  insured: "Pojištěný",
  child: "Dítě",
  beneficiary: "Oprávněná osoba",
  other: "Osoba",
};

type ProductCardProps = {
  contract: ContractRow;
  canonical: CanonicalProduct;
  visibleSourceDocs: VisibleDocMap;
  fvAux: PortalFvContractAux | null;
};

function ProductCard({ contract, canonical: p, visibleSourceDocs, fvAux }: ProductCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const isPaymentOnly = contract.portfolioRowKind === "payment_setup";
  const st = isPaymentOnly
    ? "V evidenci"
    : portfolioContractStatusLabelCs(contract.portfolioStatus, contract.startDate);
  const displayLogo = resolvePortalProductDisplayLogo(p, {
    fundLogoPath: fvAux?.fundLogoPath ?? null,
  });
  const logoPath = displayLogo?.src ?? null;
  const logoAlt = displayLogo?.alt ?? "Logo instituce";

  const fvEligible = isFvEligibleSegment(contract.segment);
  const isOneTimeInvestment =
    p.segmentDetail?.kind === "investment" && p.segmentDetail.paymentType === "one_time";
  const fvShared =
    fvEligible && p.fvReadiness.fvSourceType
      ? computeSharedFutureValueFromRate({
          fvSourceType: p.fvReadiness.fvSourceType,
          resolvedFundId: p.fvReadiness.resolvedFundId,
          resolvedFundCategory: p.fvReadiness.resolvedFundCategory,
          investmentHorizon: p.fvReadiness.investmentHorizon,
          monthlyContribution: resolveFvMonthlyContribution(p),
          annualContribution: isOneTimeInvestment ? null : p.premiumAnnual,
          lumpContribution: isOneTimeInvestment ? p.premiumMonthly : null,
          resolvedAnnualRatePercent: fvAux?.resolvedAnnualRatePercent ?? null,
          resolvedFundDisplayName: fvAux?.resolvedFundDisplayName ?? null,
        })
      : null;
  const fv =
    fvShared?.projectionState === "complete" &&
    fvShared.projectedFutureValue != null &&
    fvShared.horizonYears != null
      ? {
          amount: fvShared.projectedFutureValue,
          horizonYears: fvShared.horizonYears,
          sourceExplanation: fvShared.sourceLabel,
        }
      : null;
  const fvPartial = !fv && fvEligible && fvShared?.projectionState === "partial";
  const detailRows = canonicalPortfolioDetailRowsForClientPortfolioCard(p);

  const d = p.segmentDetail;
  const persons = d?.kind === "life_insurance" ? (d.persons ?? []) : [];
  const risks = d?.kind === "life_insurance" ? (d.risks ?? []) : [];

  const dpsBreakdown =
    d?.kind === "pension" &&
    (d.participantContribution || d.employerContribution || d.stateContributionEstimate)
      ? {
          participant: d.participantContribution,
          employer: d.employerContribution,
          state: d.stateContributionEstimate,
        }
      : null;

  const payAttrs = contract.portfolioAttributes as Record<string, unknown>;
  const hasDetail =
    isPaymentOnly ||
    detailRows.length > 0 ||
    fv ||
    fvPartial ||
    persons.length > 0 ||
    risks.length > 0 ||
    dpsBreakdown ||
    (contract.sourceDocumentId && visibleSourceDocs[contract.sourceDocumentId]);

  const statusColors =
    isPaymentOnly
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : st === "Aktivní"
        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
        : st === "Ukončené"
          ? "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]"
          : "bg-amber-50 text-amber-700 border-amber-100";

  const showLogo = !!logoPath && !logoError;
  const initials = institutionInitials(contract.partnerName ?? p.productName);

  return (
    <article
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-shadow hover:shadow-md ${
        expanded ? "border-indigo-200 ring-2 ring-indigo-50" : "border-[color:var(--wp-surface-card-border)]"
      }`}
    >
      {/* Header — always visible, clickable when detail available */}
      <div
        role={hasDetail ? "button" : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        onKeyDown={
          hasDetail
            ? (e) => { if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v); }
            : undefined
        }
        onClick={hasDetail ? () => setExpanded((v) => !v) : undefined}
        className={`flex items-center gap-4 p-4 md:p-5 ${hasDetail ? "cursor-pointer select-none" : ""}`}
      >
        {/* Logo or icon — compact 44px */}
        <div className="shrink-0">
          {showLogo ? (
            <Image
              src={logoPath}
              alt={logoAlt}
              width={44}
              height={44}
              className="h-11 w-11 object-contain"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div
              className="h-11 w-11 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-main-scroll-bg)] flex items-center justify-center text-[11px] font-black text-[color:var(--wp-text-secondary)] shrink-0"
              aria-hidden
            >
              {initials}
            </div>
          )}
        </div>

        {/* Main info block */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 justify-between">
            {/* Left: name + partner */}
            <div className="min-w-0 flex-1">
              <h4 className="font-black text-[color:var(--wp-text)] text-[15px] leading-snug line-clamp-2">
                {contract.productName || "Produkt"}
              </h4>
              <p className="text-xs text-[color:var(--wp-text-secondary)] font-semibold mt-0.5 truncate flex items-center gap-1">
                <Building2 size={11} className="shrink-0 text-[color:var(--wp-text-tertiary)]" />
                {contract.partnerName || "—"}
              </p>
            </div>
            {/* Right: status + premium */}
            <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1 shrink-0">
              <span
                className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wide rounded border ${statusColors}`}
              >
                {st}
              </span>
              <span className="text-[15px] font-black text-[color:var(--wp-text)] tabular-nums whitespace-nowrap">
                {formatPortalPremiumLineCs(
                  contract.premiumAmount,
                  contract.premiumAnnual,
                  p.segmentDetail?.kind === "investment" ? p.segmentDetail.paymentType : null,
                )}
              </span>
            </div>
          </div>

          {/* Meta badges */}
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wide rounded-md bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]">
              {p.segmentLabel}
            </span>
            {contract.contractNumber ? (
              <span className="text-[10px] font-bold text-[color:var(--wp-text-tertiary)] font-mono">
                č.&nbsp;{contract.contractNumber}
              </span>
            ) : null}
            {contract.startDate ? (
              <span className="text-[10px] font-medium text-[color:var(--wp-text-tertiary)]">
                od&nbsp;{formatDisplayDateCs(contract.startDate) || contract.startDate}
              </span>
            ) : null}
          </div>
        </div>

        {/* Expand chevron */}
        {hasDetail && (
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all duration-200 shrink-0 ${
              expanded
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-[color:var(--wp-main-scroll-bg)] text-[color:var(--wp-text-tertiary)] border-[color:var(--wp-surface-card-border)]"
            }`}
            aria-hidden
          >
            <ChevronDown
              size={16}
              className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && hasDetail && (
        <div className="border-t border-[color:var(--wp-surface-card-border)] px-4 pb-5 sm:px-5 pt-4 space-y-4 bg-[color:var(--wp-main-scroll-bg)]/40">
          {isPaymentOnly && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">Platební instrukce</p>
              <p className="text-xs text-[color:var(--wp-text-secondary)]">
                Položka z platebního pokynu — zobrazuje se v portfoliu i bez nahrané smlouvy v detailu.
              </p>
              {typeof payAttrs.paymentInstructionAccount === "string" && payAttrs.paymentInstructionAccount.trim() ? (
                <p className="text-sm font-bold text-[color:var(--wp-text)]">
                  <span className="text-[color:var(--wp-text-tertiary)] font-semibold">Účet: </span>
                  {payAttrs.paymentInstructionAccount}
                </p>
              ) : null}
              {typeof payAttrs.paymentInstructionVs === "string" && payAttrs.paymentInstructionVs.trim() ? (
                <p className="text-sm font-bold text-[color:var(--wp-text)]">
                  <span className="text-[color:var(--wp-text-tertiary)] font-semibold">VS: </span>
                  {payAttrs.paymentInstructionVs}
                </p>
              ) : null}
              {typeof payAttrs.paymentInstructionNotes === "string" && payAttrs.paymentInstructionNotes?.trim() ? (
                <p className="text-xs font-medium text-[color:var(--wp-text)] whitespace-pre-wrap break-words">
                  {payAttrs.paymentInstructionNotes}
                </p>
              ) : null}
            </div>
          )}
          {/* Detail rows grid */}
          {detailRows.length > 0 && (
            <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)]/90 bg-white shadow-sm overflow-hidden">
              {detailRows.map((row, idx) => (
                <div
                  key={`${row.label}-${idx}`}
                  className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6 px-4 py-3.5 border-b border-[color:var(--wp-surface-card-border)] last:border-b-0"
                >
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] sm:w-[min(42%,14rem)] sm:shrink-0">
                    {row.label}
                  </span>
                  <span className="text-sm font-bold text-[color:var(--wp-text)] sm:text-right min-w-0 leading-snug break-words">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Persons */}
          {persons.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">
                Osoby ve smlouvě
              </p>
              <div className="space-y-1.5">
                {persons.map((person, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-xs text-[color:var(--wp-text)]">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-[11px] shrink-0">
                      {(person.name ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold">{person.name || "—"}</span>
                    {person.role && (
                      <span className="text-[10px] font-bold text-[color:var(--wp-text-tertiary)] bg-[color:var(--wp-surface-muted)] px-1.5 py-0.5 rounded">
                        {PERSON_ROLE_LABELS[person.role] ?? person.role}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risks — tile grid (label + amount) */}
          {risks.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] mb-2.5 px-0.5">
                Rizika / krytí
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {risks.map((r, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-[color:var(--wp-surface-card-border)]/90 bg-white p-3 shadow-sm flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-[color:var(--wp-text-tertiary)] mb-0.5">
                        Krytí
                      </p>
                      <p className="text-[13px] font-bold text-[color:var(--wp-text)] leading-snug break-words">
                        {r.label || "—"}
                      </p>
                    </div>
                    {r.amount ? (
                      <span className="text-[13px] font-black text-purple-700 tabular-nums shrink-0 mt-3.5">
                        {r.amount}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DPS contribution breakdown */}
          {dpsBreakdown && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                Složení měsíčního vkladu
              </p>
              <div className="space-y-2">
                {dpsBreakdown.participant ? (
                  <div className="flex justify-between items-center text-xs font-bold text-[color:var(--wp-text)]">
                    <span>Vlastní vklad</span>
                    <span className="tabular-nums text-[color:var(--wp-text)]">{dpsBreakdown.participant}</span>
                  </div>
                ) : null}
                {dpsBreakdown.state ? (
                  <div className="flex justify-between items-center text-xs font-bold text-indigo-700">
                    <span>Státní příspěvek (odhad)</span>
                    <span className="tabular-nums">+ {dpsBreakdown.state}</span>
                  </div>
                ) : null}
                {dpsBreakdown.employer ? (
                  <div className="flex justify-between items-center text-xs font-bold text-emerald-700">
                    <span>Zaměstnavatel</span>
                    <span className="tabular-nums">+ {dpsBreakdown.employer}</span>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* FV block */}
          {fv ? (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
                Odhad za {fv.horizonYears} let (model)
              </p>
              <p className="text-xl font-black text-indigo-950">
                {fv.amount.toLocaleString("cs-CZ")} Kč
              </p>
              <p className="text-[11px] text-indigo-900/80 leading-snug">{fv.sourceExplanation}</p>
              <p className="text-[10px] text-indigo-800/60 leading-snug">{SHARED_FV_DISCLAIMER}</p>
            </div>
          ) : fvPartial ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3 flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" aria-hidden />
              <p className="text-[11px] text-amber-800 leading-snug">
                Odhad budoucí hodnoty nelze zobrazit — v evidenci chybí horizont, příspěvek nebo fond.
              </p>
            </div>
          ) : null}

          {/* Source document link */}
          {contract.sourceDocumentId && visibleSourceDocs[contract.sourceDocumentId] ? (
            <a
              href={`/api/documents/${contract.sourceDocumentId}/download`}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-xs font-black uppercase tracking-widest text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              {visibleSourceDocs[contract.sourceDocumentId].name}
            </a>
          ) : null}
        </div>
      )}
    </article>
  );
}

type PortfolioPageContentProps = {
  contracts: ContractRow[];
  visibleSourceDocs: VisibleDocMap;
  fvContractAux: PortalFvContractAuxMap;
};

export function PortfolioPageContent({ contracts, visibleSourceDocs, fvContractAux }: PortfolioPageContentProps) {
  const metrics = aggregatePortfolioMetrics(
    contracts.map((c) => ({
      segment: c.segment,
      premiumAmount: c.premiumAmount,
      premiumAnnual: c.premiumAnnual,
      portfolioAttributes: c.portfolioAttributes,
      portfolioStatus: c.portfolioStatus,
    })),
  );
  const canonicalById = new Map<string, CanonicalProduct>();
  for (const c of contracts) {
    canonicalById.set(c.id, contractToCanonical(c));
  }

  const grouped = new Map<PortfolioUiGroup, ContractRow[]>();
  for (const c of contracts) {
    const g = segmentToPortfolioGroup(c.segment, c.portfolioAttributes);
    const list = grouped.get(g) ?? [];
    list.push(c);
    grouped.set(g, list);
  }

  const groupOrder: PortfolioUiGroup[] = [
    "investments_pensions",
    "loans",
    "income_protection_life",
    "children",
    "property_liability",
    "vehicles",
    "travel",
    "business",
    "other",
  ];

  const activeGroups = groupOrder.filter((k) => (grouped.get(k)?.length ?? 0) > 0);

  const annualInsurance = Math.round(metrics.monthlyInsurancePremiums * 12);

  // Light coverage projection — deterministic, evidence-based only.
  // Compliance: purely informative — does NOT recommend products to client.
  const coverageGroupOrder: PortfolioUiGroup[] = [
    "investments_pensions",
    "income_protection_life",
    "property_liability",
    "vehicles",
    "loans",
  ];
  const coverageStatus: { group: PortfolioUiGroup; count: number; risksCount: number; personsCount: number }[] =
    coverageGroupOrder.map((g) => {
      const items = grouped.get(g) ?? [];
      let risksCount = 0;
      let personsCount = 0;
      for (const c of items) {
        const p = canonicalById.get(c.id);
        const d = p?.segmentDetail;
        if (d?.kind === "life_insurance") {
          risksCount += d.risks?.length ?? 0;
          personsCount += d.persons?.length ?? 0;
        }
      }
      return { group: g, count: items.length, risksCount, personsCount };
    });

  let anyFvShown = false;
  for (const c of contracts) {
    const p = canonicalById.get(c.id);
    if (!p || !isFvEligibleSegment(c.segment) || !p.fvReadiness.fvSourceType) continue;
    const aux = fvContractAux[c.id] ?? null;
    const hit = computeSharedFutureValueFromRate({
      fvSourceType: p.fvReadiness.fvSourceType,
      resolvedFundId: p.fvReadiness.resolvedFundId,
      resolvedFundCategory: p.fvReadiness.resolvedFundCategory,
      investmentHorizon: p.fvReadiness.investmentHorizon,
      monthlyContribution: resolveFvMonthlyContribution(p),
      annualContribution: p.premiumAnnual,
      resolvedAnnualRatePercent: aux?.resolvedAnnualRatePercent ?? null,
      resolvedFundDisplayName: aux?.resolvedFundDisplayName ?? null,
    });
    if (hit.projectionState === "complete" && hit.projectedFutureValue != null) {
      anyFvShown = true;
      break;
    }
  }

  return (
    <div className="space-y-8 client-fade-in">
      {/* Page title */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-display font-black text-[color:var(--wp-text)] tracking-tight">
          Moje portfolio
        </h2>
        <p className="text-sm font-medium text-[color:var(--wp-text-secondary)] mt-1.5">
          Přehled produktů evidovaných vaším poradcem. Údaje odpovídají stavu smluv — žádné ukázkové hodnoty.
        </p>
      </div>

      {contracts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[color:var(--wp-surface-card-border)] shadow-sm p-8 md:p-10 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[color:var(--wp-surface-muted)] flex items-center justify-center text-[color:var(--wp-text-tertiary)]">
            <Briefcase size={28} />
          </div>
          <p className="text-[color:var(--wp-text)] font-semibold text-lg">Zatím zde nemáte zobrazené žádné produkty</p>
          <p className="text-[color:var(--wp-text-secondary)] text-sm max-w-md mx-auto leading-relaxed">
            Jakmile váš poradce doplní a zveřejní smlouvy v klientské zóně, objeví se zde přehledně podle skupin —
            investice, úvěry, pojištění a další.
          </p>
          <p className="text-[color:var(--wp-text-tertiary)] text-xs">
            Máte dotaz? Napište poradci přes Zprávy nebo vytvořte požadavek z hlavní stránky portálu.
          </p>
        </div>
      ) : (
        <>
          {/* ── A. KPI Summary ─────────────────────────────────────── */}
          <section aria-label="Souhrn portfolia">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {/* Tvorba rezerv */}
              <div className="bg-white rounded-2xl border border-[color:var(--wp-surface-card-border)] shadow-sm p-4 md:p-5 relative overflow-hidden">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <TrendingUp size={14} />
                  </div>
                  <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">
                    Tvorba rezerv
                  </p>
                </div>
                <p className="text-[22px] font-black text-[color:var(--wp-text)] leading-none tabular-nums">
                  {metrics.monthlyInvestments.toLocaleString("cs-CZ")} Kč
                </p>
                <p className="text-[10px] font-bold text-[color:var(--wp-text-tertiary)] mt-1">měsíčně</p>
                <div className="absolute -right-3 -bottom-3 w-20 h-20 bg-emerald-50 rounded-full blur-2xl pointer-events-none" />
              </div>

              {/* Ochrana — měsíčně */}
              <div className="bg-white rounded-2xl border border-[color:var(--wp-surface-card-border)] shadow-sm p-4 md:p-5 relative overflow-hidden">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <Shield size={14} />
                  </div>
                  <p className="text-[9px] font-black text-purple-600 uppercase tracking-widest">
                    Ochrana
                  </p>
                </div>
                <p className="text-[22px] font-black text-[color:var(--wp-text)] leading-none tabular-nums">
                  {metrics.monthlyInsurancePremiums.toLocaleString("cs-CZ")} Kč
                </p>
                <p className="text-[10px] font-bold text-[color:var(--wp-text-tertiary)] mt-1">měsíční pojistné</p>
                <div className="absolute -right-3 -bottom-3 w-20 h-20 bg-purple-50 rounded-full blur-2xl pointer-events-none" />
              </div>

              {/* Roční pojistné */}
              {annualInsurance > 0 && (
                <div className="bg-white rounded-2xl border border-[color:var(--wp-surface-card-border)] shadow-sm p-4 md:p-5 relative overflow-hidden">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                      <Shield size={14} />
                    </div>
                    <p className="text-[9px] font-black text-violet-600 uppercase tracking-widest">
                      Roční pojistné
                    </p>
                  </div>
                  <p className="text-[22px] font-black text-[color:var(--wp-text)] leading-none tabular-nums">
                    {annualInsurance.toLocaleString("cs-CZ")} Kč
                  </p>
                  <p className="text-[10px] font-bold text-[color:var(--wp-text-tertiary)] mt-1">ročně</p>
                  <div className="absolute -right-3 -bottom-3 w-20 h-20 bg-violet-50 rounded-full blur-2xl pointer-events-none" />
                </div>
              )}

              {/* Závazky / Položky */}
              {metrics.totalLoanPrincipal > 0 ? (
                <div className="bg-white rounded-2xl border border-[color:var(--wp-surface-card-border)] shadow-sm p-4 md:p-5 relative overflow-hidden">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                      <Home size={14} />
                    </div>
                    <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest">
                      Závazky
                    </p>
                  </div>
                  <p className="text-[22px] font-black text-[color:var(--wp-text)] leading-none tabular-nums">
                    {metrics.totalLoanPrincipal.toLocaleString("cs-CZ")} Kč
                  </p>
                  <p className="text-[10px] font-bold text-[color:var(--wp-text-tertiary)] mt-1">jistiny úvěrů</p>
                  <div className="absolute -right-3 -bottom-3 w-20 h-20 bg-rose-50 rounded-full blur-2xl pointer-events-none" />
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-[color:var(--wp-surface-card-border)] shadow-sm p-4 md:p-5 relative overflow-hidden">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <Briefcase size={14} />
                    </div>
                    <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">
                      Položky
                    </p>
                  </div>
                  <p className="text-[22px] font-black text-[color:var(--wp-text)] leading-none tabular-nums">
                    {metrics.activeContractCount}
                  </p>
                  <p className="text-[10px] font-bold text-[color:var(--wp-text-tertiary)] mt-1">v přehledu</p>
                  <div className="absolute -right-3 -bottom-3 w-20 h-20 bg-indigo-50 rounded-full blur-2xl pointer-events-none" />
                </div>
              )}
            </div>
            <p className="text-[10px] text-[color:var(--wp-text-tertiary)] mt-2 leading-relaxed">
              Souhrn vychází z aktivních smluv. Ukončené smlouvy jsou zobrazeny v přehledu níže.
            </p>
          </section>

          {/* ── B. Segment nav chips ─────────────────────────────── */}
          {activeGroups.length > 1 && (
            <section aria-label="Skupiny produktů">
              <div className="flex overflow-x-auto snap-x hide-scrollbar gap-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap pb-1">
                {activeGroups.map((gk) => {
                  const n = grouped.get(gk)?.length ?? 0;
                  const Icon = groupIcon(gk);
                  const colors = groupIconColors(gk);
                  return (
                    <div
                      key={gk}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--wp-surface-card-border)] bg-white px-3 py-1.5 text-xs font-bold text-[color:var(--wp-text)] shadow-sm snap-center shrink-0"
                    >
                      <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${colors}`}>
                        <Icon size={11} />
                      </div>
                      <span className="whitespace-nowrap">{PORTFOLIO_GROUP_LABELS[gk]}</span>
                      <span className="text-[color:var(--wp-text-tertiary)] font-black tabular-nums">{n}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── B2. Coverage projection (evidence-based, informative only) ─── */}
          <section aria-label="Přehled evidovaných oblastí">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-[color:var(--wp-text-secondary)]">
                Přehled evidovaných oblastí
              </h3>
              <p className="text-[10px] text-[color:var(--wp-text-tertiary)] font-medium">
                Pouze informativní — odráží stav v evidenci poradce
              </p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 md:gap-3">
              {coverageStatus.map(({ group, count, risksCount, personsCount }) => {
                const Icon = groupIcon(group);
                const colors = groupIconColors(group);
                const covered = count > 0;
                return (
                  <div
                    key={group}
                    className={`bg-white rounded-2xl border p-3 md:p-4 flex items-start gap-2.5 transition-colors ${
                      covered ? "border-[color:var(--wp-surface-card-border)]" : "border-dashed border-[color:var(--wp-surface-card-border)]"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        covered ? colors : "bg-[color:var(--wp-main-scroll-bg)] text-[color:var(--wp-text-tertiary)]"
                      }`}
                    >
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-[color:var(--wp-text)] leading-tight line-clamp-2">
                        {PORTFOLIO_GROUP_LABELS[group]}
                      </p>
                      {covered ? (
                        <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 mt-1">
                          V evidenci
                        </p>
                      ) : (
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--wp-text-tertiary)] mt-1">
                          Bez evidence
                        </p>
                      )}
                      {covered && (risksCount > 0 || personsCount > 0) ? (
                        <p className="text-[10px] text-[color:var(--wp-text-secondary)] mt-1 leading-snug">
                          {risksCount > 0 ? (
                            <span>
                              {risksCount} {risksCount === 1 ? "krytí" : "krytí"}
                            </span>
                          ) : null}
                          {risksCount > 0 && personsCount > 0 ? <span> · </span> : null}
                          {personsCount > 0 ? (
                            <span>
                              {personsCount} {personsCount === 1 ? "osoba" : personsCount < 5 ? "osoby" : "osob"}
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                      {covered && count > 1 ? (
                        <p className="text-[10px] text-[color:var(--wp-text-tertiary)] mt-0.5">{count} smluv</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── C. Segmented accordion product list ──────────────── */}
          {groupOrder.map((groupKey) => {
            const items = grouped.get(groupKey);
            if (!items?.length) return null;
            const Icon = groupIcon(groupKey);
            const iconColors = groupIconColors(groupKey);
            return (
              <section key={groupKey} className="space-y-3">
                {/* Group header with separator */}
                <div className="flex items-center gap-3 pb-3 border-b border-[color:var(--wp-surface-card-border)]">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconColors}`}
                  >
                    <Icon size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-black text-[color:var(--wp-text)] leading-tight">
                      {PORTFOLIO_GROUP_LABELS[groupKey]}
                    </h3>
                    <p className="text-[11px] text-[color:var(--wp-text-tertiary)] font-medium">
                      {items.length}{" "}
                      {items.length === 1 ? "produkt" : items.length < 5 ? "produkty" : "produktů"}
                    </p>
                  </div>
                </div>

                {/* Full-width accordion product list */}
                <div className="space-y-2">
                  {items.map((contract) => {
                    const canonical = canonicalById.get(contract.id)!;
                    return (
                      <ProductCard
                        key={contract.id}
                        contract={contract}
                        canonical={canonical}
                        visibleSourceDocs={visibleSourceDocs}
                        fvAux={fvContractAux[contract.id] ?? null}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}

          {anyFvShown ? (
            <p className="text-[11px] text-[color:var(--wp-text-secondary)] leading-relaxed">
              U investičních a penzijních produktů může být uveden odhad budoucí hodnoty zjednodušeným modelem.
              Vždy jde o nezávaznou ilustraci na základě údajů ve smlouvě — ne o příslib výnosu.
            </p>
          ) : null}

          {/* CTA footer */}
          <section className="bg-white rounded-2xl border border-[color:var(--wp-surface-card-border)] shadow-sm p-5 md:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-base font-black text-[color:var(--wp-text)]">Potřebujete změnu nebo vysvětlení?</h3>
              <p className="text-sm text-[color:var(--wp-text-secondary)] mt-1 max-w-md">
                Portfolio odráží stav v evidenci poradce. Pro úpravy, dotazy nebo srovnání kontaktujte svého poradce.
              </p>
            </div>
            <Link
              href="/client/messages"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-indigo-600 px-6 text-sm font-black text-white hover:bg-indigo-700 transition-colors shrink-0"
            >
              Napsat poradci
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
