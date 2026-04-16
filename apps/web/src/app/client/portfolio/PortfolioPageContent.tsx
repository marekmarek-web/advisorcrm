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
  CreditCard,
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
  canonicalPortfolioDetailRows,
  formatPortalPremiumLineCs,
  isFvEligibleSegment,
  portfolioContractStatusLabelCs,
  resolvePortalFundLogoPath,
  resolveFvMonthlyContribution,
} from "@/lib/client-portfolio/portal-portfolio-display";
import type { CanonicalProduct } from "@/lib/products/canonical-product-read";
import { computeSharedFutureValue, SHARED_FV_DISCLAIMER } from "@/lib/fund-library/shared-future-value";

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
    case "vehicles": return "bg-slate-200 text-slate-600";
    case "travel": return "bg-sky-100 text-sky-600";
    case "business": return "bg-amber-100 text-amber-600";
    default: return "bg-slate-100 text-slate-600";
  }
}

function segmentCardIconColors(segment: string): string {
  switch (segment) {
    case "INV":
    case "DIP": return "bg-emerald-100 text-emerald-700";
    case "DPS": return "bg-indigo-100 text-indigo-700";
    case "ZP": return "bg-purple-100 text-purple-700";
    case "MAJ":
    case "ODP": return "bg-blue-100 text-blue-700";
    case "AUTO_PR":
    case "AUTO_HAV": return "bg-slate-200 text-slate-700";
    case "HYPO":
    case "UVER": return "bg-rose-100 text-rose-700";
    case "CEST": return "bg-sky-100 text-sky-700";
    default: return "bg-indigo-100 text-indigo-700";
  }
}

function productIcon(segment: string): LucideIcon {
  switch (segment) {
    case "INV":
    case "DIP": return TrendingUp;
    case "DPS": return PiggyBank;
    case "HYPO":
    case "UVER": return CreditCard;
    case "ZP": return Shield;
    case "MAJ":
    case "ODP": return Home;
    case "AUTO_PR":
    case "AUTO_HAV": return Car;
    case "CEST": return Plane;
    case "FIRMA_POJ": return Building2;
    default: return Briefcase;
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
};

function ProductCard({ contract, canonical: p, visibleSourceDocs }: ProductCardProps) {
  const [expanded, setExpanded] = useState(false);

  const st = portfolioContractStatusLabelCs(contract.portfolioStatus, contract.startDate);
  const logoPath = resolvePortalFundLogoPath(p);
  const logoAlt =
    p.segmentDetail?.kind === "investment" && p.segmentDetail.fundName
      ? `Logo fondu ${p.segmentDetail.fundName}`
      : "Logo instituce";

  const fvEligible = isFvEligibleSegment(contract.segment);
  const fvShared =
    fvEligible && p.fvReadiness.fvSourceType
      ? computeSharedFutureValue({
          fvSourceType: p.fvReadiness.fvSourceType,
          resolvedFundId: p.fvReadiness.resolvedFundId,
          resolvedFundCategory: p.fvReadiness.resolvedFundCategory,
          investmentHorizon: p.fvReadiness.investmentHorizon,
          monthlyContribution: resolveFvMonthlyContribution(p),
          annualContribution: p.premiumAnnual,
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
  const detailRows = canonicalPortfolioDetailRows(p).filter((r) => r.label !== "Typ produktu");

  const d = p.segmentDetail;
  const persons = d?.kind === "life_insurance" ? (d.persons ?? []) : [];
  const risks = d?.kind === "life_insurance" ? (d.risks ?? []) : [];

  const hasDetail =
    detailRows.length > 0 ||
    fv ||
    fvPartial ||
    persons.length > 0 ||
    risks.length > 0 ||
    (contract.sourceDocumentId && visibleSourceDocs[contract.sourceDocumentId]);

  const statusColors =
    st === "Aktivní"
      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
      : st === "Ukončené"
        ? "bg-slate-100 text-slate-500 border-slate-200"
        : "bg-amber-50 text-amber-700 border-amber-100";

  return (
    <article className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Card header — always visible */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          {/* Logo or initials */}
          {logoPath ? (
            <div className="w-11 h-11 rounded-xl bg-white border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
              <Image src={logoPath} alt={logoAlt} width={44} height={44} className="object-contain p-1" />
            </div>
          ) : (
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-sm font-black ${segmentCardIconColors(contract.segment)}`}
            >
              {(contract.partnerName ?? contract.productName ?? "?").trim().slice(0, 2).toUpperCase()}
            </div>
          )}

          {/* Title block */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-bold text-slate-900 text-[14px] leading-tight line-clamp-2">
                  {contract.productName || "Produkt"}
                </h4>
                <p className="text-xs text-slate-500 font-semibold mt-0.5 truncate">
                  {contract.partnerName || "—"}
                </p>
              </div>
              <span
                className={`shrink-0 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded border ${statusColors}`}
              >
                {st}
              </span>
            </div>

            {/* Segment badge + contract number in one row */}
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wide rounded-md bg-slate-100 text-slate-500">
                {p.segmentLabel}
              </span>
              {contract.contractNumber ? (
                <span className="text-[10px] font-bold text-slate-400 font-mono">
                  č. {contract.contractNumber}
                </span>
              ) : null}
              {contract.startDate ? (
                <span className="text-[10px] font-medium text-slate-400">
                  od {formatDisplayDateCs(contract.startDate) || contract.startDate}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Premium amount — prominent */}
        <div className="mt-3 flex items-end justify-between gap-2">
          <div>
            <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
              Platba / pojistné / splátka
            </span>
            <span className="text-[18px] font-black text-slate-900 leading-none">
              {formatPortalPremiumLineCs(contract.premiumAmount, contract.premiumAnnual)}
            </span>
          </div>
          {hasDetail && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                expanded
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              aria-expanded={expanded}
            >
              Detail
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && hasDetail && (
        <div className="border-t border-slate-100 px-4 pb-4 sm:px-5 sm:pb-5 pt-4 space-y-4">
          {/* Segment detail rows */}
          {detailRows.length > 0 && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 divide-y divide-slate-100 overflow-hidden">
              {detailRows.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3 px-3 py-2.5 text-xs">
                  <span className="text-slate-500 font-bold shrink-0">{row.label}</span>
                  <span className="text-slate-800 font-semibold text-right">{row.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Persons */}
          {persons.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                Osoby ve smlouvě
              </p>
              <div className="space-y-1.5">
                {persons.map((person, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-xs text-slate-700">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-[11px] shrink-0">
                      {(person.name ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold">{person.name || "—"}</span>
                    {person.role && (
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {PERSON_ROLE_LABELS[person.role] ?? person.role}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risks */}
          {risks.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                Rizika / krytí
              </p>
              <div className="rounded-xl border border-slate-100 bg-slate-50/60 divide-y divide-slate-100 overflow-hidden">
                {risks.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <span className="text-slate-700 font-semibold">{r.label || "—"}</span>
                    {r.amount && (
                      <span className="text-slate-500 font-bold shrink-0">{r.amount}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FV block — only when complete */}
          {fv ? (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-1.5">
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
};

export function PortfolioPageContent({ contracts, visibleSourceDocs }: PortfolioPageContentProps) {
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

  // Annual insurance: monthlyInsurancePremiums × 12 for display
  const annualInsurance = Math.round(metrics.monthlyInsurancePremiums * 12);

  let anyFvShown = false;
  for (const c of contracts) {
    const p = canonicalById.get(c.id);
    if (!p || !isFvEligibleSegment(c.segment) || !p.fvReadiness.fvSourceType) continue;
    const hit = computeSharedFutureValue({
      fvSourceType: p.fvReadiness.fvSourceType,
      resolvedFundId: p.fvReadiness.resolvedFundId,
      resolvedFundCategory: p.fvReadiness.resolvedFundCategory,
      investmentHorizon: p.fvReadiness.investmentHorizon,
      monthlyContribution: resolveFvMonthlyContribution(p),
      annualContribution: p.premiumAnnual,
    });
    if (hit.projectionState === "complete" && hit.projectedFutureValue != null) {
      anyFvShown = true;
      break;
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 client-fade-in">
      {/* Page title */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight">
          Moje portfolio
        </h2>
        <p className="text-sm font-medium text-slate-500 mt-1.5 max-w-2xl">
          Přehled produktů evidovaných vaším poradcem. Údaje odpovídají stavu smluv — žádné ukázkové hodnoty.
        </p>
      </div>

      {contracts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 md:p-10 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
            <Briefcase size={28} />
          </div>
          <p className="text-slate-700 font-semibold text-lg">Zatím zde nemáte zobrazené žádné produkty</p>
          <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed">
            Jakmile váš poradce doplní a zveřejní smlouvy v klientské zóně, objeví se zde přehledně podle skupin —
            investice, úvěry, pojištění a další.
          </p>
          <p className="text-slate-400 text-xs">
            Máte dotaz? Napište poradci přes Zprávy nebo vytvořte požadavek z hlavní stránky portálu.
          </p>
        </div>
      ) : (
        <>
          {/* ── A. KPI Summary ─────────────────────────────────────────────── */}
          <section aria-label="Souhrn portfolia">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Tvorba rezerv */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 relative overflow-hidden">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <TrendingUp size={13} />
                  </div>
                  <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">
                    Tvorba rezerv
                  </p>
                </div>
                <p className="text-[22px] font-black text-slate-900 leading-none">
                  {metrics.monthlyInvestments.toLocaleString("cs-CZ")} Kč
                </p>
                <p className="text-[10px] font-bold text-slate-400 mt-1">měsíčně</p>
                <div className="absolute -right-3 -bottom-3 w-20 h-20 bg-emerald-50 rounded-full blur-2xl pointer-events-none" />
              </div>

              {/* Ochrana — měsíčně */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 relative overflow-hidden">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                    <Shield size={13} />
                  </div>
                  <p className="text-[9px] font-black text-purple-600 uppercase tracking-widest">
                    Ochrana
                  </p>
                </div>
                <p className="text-[22px] font-black text-slate-900 leading-none">
                  {metrics.monthlyInsurancePremiums.toLocaleString("cs-CZ")} Kč
                </p>
                <p className="text-[10px] font-bold text-slate-400 mt-1">měsíční pojistné</p>
                <div className="absolute -right-3 -bottom-3 w-20 h-20 bg-purple-50 rounded-full blur-2xl pointer-events-none" />
              </div>

              {/* Ochrana — ročně */}
              {annualInsurance > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 relative overflow-hidden">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                      <Shield size={13} />
                    </div>
                    <p className="text-[9px] font-black text-violet-600 uppercase tracking-widest">
                      Roční pojistné
                    </p>
                  </div>
                  <p className="text-[22px] font-black text-slate-900 leading-none">
                    {annualInsurance.toLocaleString("cs-CZ")} Kč
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">ročně</p>
                  <div className="absolute -right-3 -bottom-3 w-20 h-20 bg-violet-50 rounded-full blur-2xl pointer-events-none" />
                </div>
              )}

              {/* Závazky */}
              {metrics.totalLoanPrincipal > 0 ? (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 relative overflow-hidden">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                      <Home size={13} />
                    </div>
                    <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest">
                      Závazky
                    </p>
                  </div>
                  <p className="text-[22px] font-black text-slate-900 leading-none">
                    {metrics.totalLoanPrincipal.toLocaleString("cs-CZ")} Kč
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">jistiny úvěrů</p>
                  <div className="absolute -right-3 -bottom-3 w-20 h-20 bg-rose-50 rounded-full blur-2xl pointer-events-none" />
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 relative overflow-hidden">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <Briefcase size={13} />
                    </div>
                    <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">
                      Položky
                    </p>
                  </div>
                  <p className="text-[22px] font-black text-slate-900 leading-none">
                    {metrics.activeContractCount}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 mt-1">v přehledu</p>
                  <div className="absolute -right-3 -bottom-3 w-20 h-20 bg-indigo-50 rounded-full blur-2xl pointer-events-none" />
                </div>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
              Souhrn vychází z aktivních smluv. Ukončené smlouvy jsou zobrazeny v přehledu níže.
            </p>
          </section>

          {/* ── B. Segment nav chips ────────────────────────────────────────── */}
          <section aria-label="Skupiny produktů">
            <div className="flex overflow-x-auto snap-x hide-scrollbar gap-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap pb-1">
              {activeGroups.map((gk) => {
                const n = grouped.get(gk)?.length ?? 0;
                const Icon = groupIcon(gk);
                const colors = groupIconColors(gk);
                return (
                  <div
                    key={gk}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm snap-center shrink-0"
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${colors}`}>
                      <Icon size={11} />
                    </div>
                    <span className="whitespace-nowrap">{PORTFOLIO_GROUP_LABELS[gk]}</span>
                    <span className="text-slate-400 font-black tabular-nums">{n}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── C+D. Segmented product list with expandable cards ──────────── */}
          {groupOrder.map((groupKey) => {
            const items = grouped.get(groupKey);
            if (!items?.length) return null;
            const Icon = groupIcon(groupKey);
            const iconColors = groupIconColors(groupKey);
            return (
              <section key={groupKey} className="space-y-3">
                {/* Group header */}
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconColors}`}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 leading-tight">
                      {PORTFOLIO_GROUP_LABELS[groupKey]}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">
                      {items.length}{" "}
                      {items.length === 1 ? "produkt" : items.length < 5 ? "produkty" : "produktů"}
                    </p>
                  </div>
                </div>

                {/* Product cards grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {items.map((contract) => {
                    const canonical = canonicalById.get(contract.id)!;
                    return (
                      <ProductCard
                        key={contract.id}
                        contract={contract}
                        canonical={canonical}
                        visibleSourceDocs={visibleSourceDocs}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}

          {anyFvShown ? (
            <p className="text-[11px] text-slate-500 max-w-3xl leading-relaxed">
              U investičních a penzijních produktů může být uveden odhad budoucí hodnoty zjednodušeným modelem.
              Vždy jde o nezávaznou ilustraci na základě údajů ve smlouvě — ne o příslib výnosu.
            </p>
          ) : null}

          {/* CTA footer */}
          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-base font-black text-slate-900">Potřebujete změnu nebo vysvětlení?</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md">
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
