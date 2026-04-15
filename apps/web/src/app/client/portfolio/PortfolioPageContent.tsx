import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Building2,
  Car,
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
    case "investments_pensions":
      return PiggyBank;
    case "loans":
      return Landmark;
    case "income_protection_life":
      return HeartPulse;
    case "children":
      return Users;
    case "property_liability":
      return Home;
    case "vehicles":
      return Car;
    case "travel":
      return Plane;
    case "business":
      return Building2;
    default:
      return Briefcase;
  }
}

function productIcon(segment: string): LucideIcon {
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

  let anyFvShown = false;
  for (const c of contracts) {
    const p = canonicalById.get(c.id);
    if (!p || !isFvEligibleSegment(c.segment) || !p.fvReadiness.fvSourceType) continue;
    const hit = computeSharedFutureValue({
      fvSourceType: p.fvReadiness.fvSourceType,
      resolvedFundId: p.fvReadiness.resolvedFundId,
      resolvedFundCategory: p.fvReadiness.resolvedFundCategory,
      investmentHorizon: p.fvReadiness.investmentHorizon,
      monthlyContribution: p.premiumMonthly,
      annualContribution: p.premiumAnnual,
    });
    if (hit.projectionState === "complete" && hit.projectedFutureValue != null) {
      anyFvShown = true;
      break;
    }
  }

  return (
    <div className="space-y-8 client-fade-in">
      <div>
        <h2 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight">Moje portfolio</h2>
        <p className="text-sm font-medium text-slate-500 mt-2 max-w-2xl">
          Přehled produktů, které váš poradce eviduje a zveřejnil pro vás v portálu. Údaje odpovídají evidenci smluv —
          žádné ukázkové hodnoty.
        </p>
      </div>

      {contracts.length === 0 ? (
        <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-8 md:p-10 text-center space-y-4">
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
          <section className="space-y-4" aria-label="Souhrn portfolia">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Souhrn</h3>
            <p className="text-[11px] text-slate-400 -mt-1 mb-1 max-w-2xl leading-relaxed">
              Částky v souhrnu počítáme jen u aktivních smluv. Ukončené smlouvy zůstávají v přehledu níže, ale neovlivňují měsíční součty.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm p-4 sm:p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">
                  Měsíční investice
                </p>
                <p className="text-2xl font-black text-slate-900">
                  {metrics.monthlyInvestments.toLocaleString("cs-CZ")} Kč
                </p>
              </div>
              <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm p-4 sm:p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">
                  Měsíční pojistné
                </p>
                <p className="text-2xl font-black text-slate-900">
                  {metrics.monthlyInsurancePremiums.toLocaleString("cs-CZ")} Kč
                </p>
              </div>
              <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm p-4 sm:p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">
                  Jistiny úvěrů (evidence)
                </p>
                <p className="text-2xl font-black text-slate-900">
                  {metrics.totalLoanPrincipal.toLocaleString("cs-CZ")} Kč
                </p>
              </div>
              <div className="bg-white rounded-[20px] border border-slate-100 shadow-sm p-4 sm:p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Položky v přehledu
                </p>
                <p className="text-2xl font-black text-slate-900">{metrics.activeContractCount}</p>
              </div>
            </div>
          </section>

          <section className="space-y-3" aria-label="Produktové skupiny">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Skupiny v portfoliu</h3>
            <div className="flex flex-wrap gap-2">
              {activeGroups.map((gk) => {
                const n = grouped.get(gk)?.length ?? 0;
                const Icon = groupIcon(gk);
                return (
                  <div
                    key={gk}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm"
                  >
                    <Icon size={14} className="text-indigo-600 shrink-0" />
                    <span>{PORTFOLIO_GROUP_LABELS[gk]}</span>
                    <span className="text-slate-400 font-black">{n}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {groupOrder.map((groupKey) => {
            const items = grouped.get(groupKey);
            if (!items?.length) return null;
            const Icon = groupIcon(groupKey);
            return (
              <section key={groupKey} className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                    <Icon size={18} />
                  </div>
                  <h3 className="text-lg font-black text-slate-900">{PORTFOLIO_GROUP_LABELS[groupKey]}</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                  {items.map((contract) => {
                    const p = canonicalById.get(contract.id)!;
                    const st = portfolioContractStatusLabelCs(contract.portfolioStatus, contract.startDate);
                    const LeadIcon = productIcon(contract.segment);
                    const logoPath = resolvePortalFundLogoPath(p);
                    const logoAlt =
                      p.segmentDetail?.kind === "investment" && p.segmentDetail.fundName
                        ? `Logo fondu ${p.segmentDetail.fundName}`
                        : "Logo instituce";
                    const fvShared =
                      isFvEligibleSegment(contract.segment) && p.fvReadiness.fvSourceType
                        ? computeSharedFutureValue({
                            fvSourceType: p.fvReadiness.fvSourceType,
                            resolvedFundId: p.fvReadiness.resolvedFundId,
                            resolvedFundCategory: p.fvReadiness.resolvedFundCategory,
                            investmentHorizon: p.fvReadiness.investmentHorizon,
                            monthlyContribution: p.premiumMonthly,
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
                    const detailRows = canonicalPortfolioDetailRows(p);

                    return (
                      <article
                        key={contract.id}
                        className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md hover:border-indigo-200 transition-all"
                      >
                        <div className="p-5 border-b border-slate-50 bg-slate-50/50 flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            {logoPath ? (
                              <div className="w-11 h-11 rounded-xl bg-white border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                                <Image src={logoPath} alt={logoAlt} width={44} height={44} className="object-contain p-1" />
                              </div>
                            ) : (
                              <div className="w-11 h-11 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-indigo-600 shrink-0">
                                <LeadIcon size={20} />
                              </div>
                            )}
                            <div className="min-w-0">
                              <h4 className="font-bold text-slate-900 leading-tight line-clamp-2">
                                {contract.productName || "Produkt"}
                              </h4>
                              <p className="text-xs font-semibold text-slate-500 truncate">
                                {contract.partnerName || "Partner"}
                              </p>
                              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wide">
                                {p.segmentLabel}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`shrink-0 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md border ${
                              st === "Aktivní"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                : st === "Ukončené"
                                  ? "bg-slate-100 text-slate-600 border-slate-200"
                                  : "bg-amber-50 text-amber-800 border-amber-100"
                            }`}
                          >
                            {st}
                          </span>
                        </div>

                        <div className="p-5 flex-1 flex flex-col gap-4 text-sm">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                                Platba / pojistné / splátka
                              </span>
                              <span className="font-bold text-slate-900">
                                {formatPortalPremiumLineCs(contract.premiumAmount, contract.premiumAnnual)}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                                Číslo smlouvy
                              </span>
                              <span className="font-mono text-slate-700">{contract.contractNumber || "—"}</span>
                            </div>
                          </div>

                          {detailRows.length > 0 ? (
                            <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-3 space-y-2">
                              {detailRows.map((row) => (
                                <div key={row.label} className="flex justify-between gap-3 text-xs">
                                  <span className="text-slate-500 font-bold shrink-0">{row.label}</span>
                                  <span className="text-slate-800 font-semibold text-right">{row.value}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {fv ? (
                            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 space-y-1">
                              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">
                                Odhad budoucí hodnoty (model)
                              </p>
                              <p className="text-lg font-black text-indigo-950">
                                {fv.amount.toLocaleString("cs-CZ")} Kč
                              </p>
                              <p className="text-[11px] text-indigo-900/80 leading-snug">{fv.sourceExplanation}</p>
                              <p className="text-[10px] text-indigo-800/90 leading-snug">{SHARED_FV_DISCLAIMER}</p>
                            </div>
                          ) : null}

                          {(contract.startDate || contract.anniversaryDate) && (
                            <div className="text-xs text-slate-500">
                              {contract.startDate ? (
                                <span>Od {formatDisplayDateCs(contract.startDate) || contract.startDate}</span>
                              ) : null}
                              {contract.anniversaryDate ? (
                                <span className={contract.startDate ? " ml-2" : ""}>
                                  Výročí {formatDisplayDateCs(contract.anniversaryDate) || contract.anniversaryDate}
                                </span>
                              ) : null}
                            </div>
                          )}

                          {contract.sourceDocumentId && visibleSourceDocs[contract.sourceDocumentId] ? (
                            <a
                              href={`/api/documents/${contract.sourceDocumentId}/download`}
                              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 text-xs font-black uppercase tracking-widest text-indigo-700 hover:bg-indigo-100 transition-colors"
                            >
                              Související dokument ({visibleSourceDocs[contract.sourceDocumentId].name})
                            </a>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {anyFvShown ? (
            <p className="text-[11px] text-slate-500 max-w-3xl leading-relaxed">
              U investičních a penzijních produktů může být uveden odhad budoucí hodnoty zjednodušeným modelem. Vždy
              jde o nezávaznou ilustraci na základě údajů ve smlouvě a obecně použitelných předpokladů — ne o příslib
              výnosu.
            </p>
          ) : null}

          <section className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-slate-900">Potřebujete změnu nebo vysvětlení?</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-xl">
                Portfolio odráží stav v evidenci poradce. Pro úpravy, dotazy nebo srovnání variant kontaktujte svého
                poradce.
              </p>
            </div>
            <Link
              href="/client/messages"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-indigo-600 px-6 text-sm font-black text-white hover:bg-indigo-700 transition-colors shrink-0"
            >
              Napsat poradci
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
