"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ElementType, type ReactNode } from "react";
import type { ContractRow, ContractAiProvenanceResult } from "@/app/actions/contracts";
import type { CanonicalProduct } from "@/lib/client-portfolio/canonical-contract-read";
import { ContractPendingFieldsGuard } from "./ContractPendingFieldsGuard";
import { ContractProvenanceLine } from "@/app/components/aidvisora/ContractProvenanceLine";
import { ZpRatingBadge } from "@/app/components/aidvisora/ZpRatingBadge";
import { advisorPrimaryAmountPresentation } from "./advisor-product-overview-format";
import { AdvisorProductFvBlock } from "./advisor-product-fv-block";
import {
  canonicalPortfolioDetailRows,
  resolvePortalProductDisplayLogo,
  isFvEligibleSegment,
} from "@/lib/client-portfolio/portal-portfolio-display";
import { fundLibraryLogoPathForPortal } from "@/lib/fund-library/shared-future-value";
import { formatDisplayDateCs } from "@/lib/date/format-display-cs";
import {
  Building2,
  Briefcase,
  Calendar,
  Car,
  ChevronDown,
  ChevronRight,
  CreditCard,
  FileCheck,
  FileText,
  Home,
  Landmark,
  PiggyBank,
  Plane,
  Shield,
  TrendingUp,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

function personRoleLabelCs(role: string): string {
  const m: Record<string, string> = {
    policyholder: "Pojistník",
    insured: "Pojištěný",
    beneficiary: "Oprávněná osoba",
    child: "Dítě",
    other: "Osoba",
  };
  return m[role] ?? "Osoba";
}

function AccordionRow({
  title,
  icon: Icon,
  defaultOpen,
  children,
}: {
  title: string;
  icon: ElementType;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface-muted)]/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px]"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Icon className="size-4 shrink-0 text-indigo-500" aria-hidden />
          <span className="truncate">{title}</span>
        </span>
        {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
      </button>
      {open ? (
        <div className="px-3 pb-3 pt-0 text-sm text-[color:var(--wp-text)] space-y-2 border-t border-[color:var(--wp-border-muted)]">
          {children}
        </div>
      ) : null}
    </div>
  );
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

function initialsFromPartner(product: CanonicalProduct): string {
  return (product.partnerName ?? product.productName ?? "?")
    .trim()
    .slice(0, 2)
    .toUpperCase();
}

function segmentIconColors(segment: string): string {
  switch (segment) {
    case "INV":
    case "DIP":
      return "bg-emerald-100 text-emerald-700";
    case "DPS":
      return "bg-indigo-100 text-indigo-700";
    case "ZP":
      return "bg-purple-100 text-purple-700";
    case "MAJ":
    case "ODP":
    case "ODP_ZAM":
      return "bg-blue-100 text-blue-700";
    case "AUTO_PR":
    case "AUTO_HAV":
      return "bg-slate-100 text-slate-700";
    case "HYPO":
    case "UVER":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-indigo-100 text-indigo-700";
  }
}

function segmentBadgeColors(segment: string): string {
  switch (segment) {
    case "INV":
    case "DIP":
      return "bg-emerald-50 text-emerald-800 border border-emerald-200/60";
    case "DPS":
      return "bg-indigo-50 text-indigo-800 border border-indigo-200/60";
    case "ZP":
      return "bg-purple-50 text-purple-800 border border-purple-200/60";
    case "MAJ":
    case "ODP":
    case "ODP_ZAM":
      return "bg-blue-50 text-blue-800 border border-blue-200/60";
    case "AUTO_PR":
    case "AUTO_HAV":
      return "bg-slate-50 text-slate-700 border border-slate-200/60";
    case "HYPO":
    case "UVER":
      return "bg-rose-50 text-rose-800 border border-rose-200/60";
    default:
      return "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]";
  }
}

function segmentKpiBg(segment: string): string {
  switch (segment) {
    case "INV":
    case "DIP":
      return "bg-emerald-50/40 border border-emerald-100/60";
    case "DPS":
      return "bg-indigo-50/40 border border-indigo-100/60";
    case "ZP":
      return "bg-purple-50/40 border border-purple-100/60";
    case "MAJ":
    case "ODP":
    case "ODP_ZAM":
      return "bg-blue-50/40 border border-blue-100/60";
    case "HYPO":
    case "UVER":
      return "bg-rose-50/40 border border-rose-100/60";
    default:
      return "bg-[color:var(--wp-surface-muted)]/60 border border-[color:var(--wp-border-muted)]";
  }
}

function portfolioStatusLabelCs(status: string): string {
  const m: Record<string, string> = {
    ended: "Ukončené",
    pending_review: "Čeká na kontrolu",
    draft: "Koncept",
  };
  return m[status] ?? status;
}

export type CanonicalProductAdvisorOverviewCardProps = {
  contactId: string;
  contract: ContractRow;
  product: CanonicalProduct;
  provenance: ContractAiProvenanceResult | undefined;
  variant: "published" | "pending";
  onEdit: () => void;
  onDelete: () => void;
  onApproveForClient?: () => void;
  publishBusy?: boolean;
};

export function CanonicalProductAdvisorOverviewCard({
  contactId,
  contract,
  product,
  provenance,
  variant,
  onEdit,
  onDelete,
  onApproveForClient,
  publishBusy,
}: CanonicalProductAdvisorOverviewCardProps) {
  const primary = advisorPrimaryAmountPresentation(product, contract);
  const advisorFundLogoPath = (() => {
    const d = product.segmentDetail;
    if (d?.kind !== "investment") return null;
    return fundLibraryLogoPathForPortal(d.resolvedFundId || product.fvReadiness.resolvedFundId);
  })();
  const displayLogo = resolvePortalProductDisplayLogo(product, { fundLogoPath: advisorFundLogoPath });
  const logoPath = displayLogo?.src ?? null;
  const LeadIcon = productIcon(contract.segment);
  const logoAlt = displayLogo?.alt ?? "Logo instituce";
  const d = product.segmentDetail;
  const detailRows = !d ? canonicalPortfolioDetailRows(product) : [];

  const life = d?.kind === "life_insurance" ? d : null;
  const inv = d?.kind === "investment" ? d : null;
  const pen = d?.kind === "pension" ? d : null;
  const veh = d?.kind === "vehicle" ? d : null;
  const prop = d?.kind === "property" ? d : null;
  const loan = d?.kind === "loan" ? d : null;

  const lifeStartDisplay = life?.startDate ? (formatDisplayDateCs(life.startDate) || life.startDate) : null;
  const lifeEndDisplay = life?.endDate ? (formatDisplayDateCs(life.endDate) || life.endDate) : null;

  return (
    <article className="rounded-[var(--wp-radius-lg)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] shadow-sm flex flex-col gap-0 overflow-hidden">
      {/* ── Card header: logo + identity ── */}
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4 pb-3">
        {logoPath ? (
          <Image
            src={logoPath}
            alt={logoAlt}
            width={114}
            height={114}
            className="h-[7.125rem] w-[7.125rem] shrink-0 object-contain"
          />
        ) : (
          <div
            className={`h-[7.125rem] w-[7.125rem] rounded-xl flex items-center justify-center text-base font-black shrink-0 ${segmentIconColors(contract.segment)}`}
            aria-hidden
          >
            {initialsFromPartner(product)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
            <span className={`inline-flex items-center gap-1 rounded-md text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 ${segmentBadgeColors(contract.segment)}`}>
              <LeadIcon className="size-3 shrink-0" aria-hidden />
              {product.segmentLabel}
            </span>
            {contract.portfolioStatus && contract.portfolioStatus !== "active" ? (
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 rounded-md px-1.5 py-0.5 border border-amber-200/60">
                {portfolioStatusLabelCs(contract.portfolioStatus)}
              </span>
            ) : null}
          </div>
          <h3 className="font-bold text-[color:var(--wp-text)] leading-tight line-clamp-2 text-base">
            {contract.productName?.trim() || product.productName?.trim() || "Produkt neuveden"}
          </h3>
          <p className="text-sm text-[color:var(--wp-text-muted)] flex items-center gap-1.5 mt-0.5">
            <Building2 className="size-3.5 shrink-0 opacity-70" aria-hidden />
            <span className="truncate">{contract.partnerName?.trim() || "—"}</span>
            {contract.partnerName ? (
              <ZpRatingBadge
                partnerName={contract.partnerName}
                productName={contract.productName ?? undefined}
                segment={contract.segment}
              />
            ) : null}
          </p>
        </div>
      </div>

      {/* ── Primary KPI row ── */}
      <div className={`mx-4 mb-3 rounded-[var(--wp-radius)] px-3 py-2.5 ${segmentKpiBg(contract.segment)}`}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-muted)]">{primary.label}</p>
            <p className="font-bold text-[color:var(--wp-text)] tabular-nums">{primary.value}</p>
          </div>
          {contract.contractNumber ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-muted)]">Číslo smlouvy</p>
              <p className="font-mono tabular-nums text-sm">{contract.contractNumber}</p>
            </div>
          ) : null}
          {/* Life insurance: počátek + konec */}
          {life && lifeStartDisplay ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-muted)] flex items-center gap-1">
                <Calendar className="size-3" aria-hidden />
                Počátek
              </p>
              <p className="text-sm font-semibold text-[color:var(--wp-text)]">{lifeStartDisplay}</p>
            </div>
          ) : null}
          {life && lifeEndDisplay ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-muted)] flex items-center gap-1">
                <Calendar className="size-3" aria-hidden />
                {life.endDate === product.anniversaryDate ? "Výročí / konec" : "Konec pojistné doby"}
              </p>
              <p className="text-sm font-semibold text-[color:var(--wp-text)]">{lifeEndDisplay}</p>
            </div>
          ) : null}
          {/* Investment: příspěvek + horizont */}
          {inv?.monthlyContribution != null && inv.monthlyContribution > 0 ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-muted)]">Příspěvek / měsíc</p>
              <p className="font-bold text-emerald-700 tabular-nums">{inv.monthlyContribution.toLocaleString("cs-CZ")} Kč</p>
            </div>
          ) : null}
          {(inv?.investmentHorizon ?? product.fvReadiness.investmentHorizon) ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-muted)]">Horizont</p>
              <p className="text-sm font-semibold text-[color:var(--wp-text)]">{inv?.investmentHorizon ?? product.fvReadiness.investmentHorizon}</p>
            </div>
          ) : null}
          {/* Pension: příspěvek */}
          {pen?.participantContribution ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-muted)]">Příspěvek účastníka</p>
              <p className="font-bold text-[color:var(--wp-text)] tabular-nums">{pen.participantContribution}</p>
            </div>
          ) : null}
          {pen?.employerContribution ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-muted)]">Zaměstnavatel</p>
              <p className="text-sm font-semibold text-emerald-700">{pen.employerContribution}</p>
            </div>
          ) : null}
          {/* Vehicle: SPZ */}
          {veh?.vehicleRegistration ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-muted)]">SPZ / vozidlo</p>
              <p className="text-sm font-semibold text-[color:var(--wp-text)]">{veh.vehicleRegistration}</p>
            </div>
          ) : null}
          {/* Property: address */}
          {prop?.propertyAddress ? (
            <div className="col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-muted)]">Adresa / předmět</p>
              <p className="text-sm font-semibold text-[color:var(--wp-text)]">{prop.propertyAddress}</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── FV block for investment-eligible segments ── */}
      {isFvEligibleSegment(contract.segment) ? (
        <div className="mx-4 mb-3">
          <AdvisorProductFvBlock product={product} />
        </div>
      ) : null}

      {/* ── Life insurance: investment component ── */}
      {life && (life.investmentStrategy || life.investmentPremiumLabel) ? (
        <div className="mx-4 mb-3 rounded-[var(--wp-radius)] border border-emerald-200/80 bg-emerald-50/50 px-3 py-2 text-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-900 mb-1">Investiční složka</p>
          {life.investmentStrategy ? (
            <p className="text-emerald-950">
              <span className="text-emerald-800/80">Strategie: </span>
              {life.investmentStrategy}
            </p>
          ) : null}
          {life.investmentPremiumLabel ? (
            <p className="text-emerald-950 mt-1">
              <span className="text-emerald-800/80">Investiční pojistné: </span>
              {life.investmentPremiumLabel}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── Secondary payment details (collapsible) ── */}
      {life && (life.paymentAccountDisplay || life.paymentFrequencyLabel || life.paymentVariableSymbol) ? (
        <div className="px-4 mb-3">
          <AccordionRow title="Platební údaje" icon={CreditCard}>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {life.paymentFrequencyLabel ? (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-muted)]">Frekvence</dt>
                  <dd>{life.paymentFrequencyLabel}</dd>
                </div>
              ) : null}
              {life.paymentVariableSymbol ? (
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-muted)]">Variabilní symbol</dt>
                  <dd className="font-mono tabular-nums">{life.paymentVariableSymbol}</dd>
                </div>
              ) : null}
              {life.paymentAccountDisplay ? (
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-muted)]">Účet</dt>
                  <dd className="font-mono text-xs break-all">{life.paymentAccountDisplay}</dd>
                </div>
              ) : null}
              {life.extraPaymentAccountDisplay ? (
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-muted)]">Další účet</dt>
                  <dd className="font-mono text-xs break-all">{life.extraPaymentAccountDisplay}</dd>
                </div>
              ) : null}
            </dl>
          </AccordionRow>
        </div>
      ) : null}

      {/* ── Segment-specific accordions ── */}
      <div className="px-4 pb-3 space-y-2">
        {inv ? (
          <AccordionRow title="Investice / DIP — parametry" icon={TrendingUp} defaultOpen>
            <ul className="space-y-1.5 text-sm">
              {inv.fundName ? (
                <li>
                  <span className="text-[color:var(--wp-text-muted)]">Fond / třída: </span>
                  <span className="font-semibold">{inv.fundName}</span>
                  {inv.fundAllocation ? <span className="text-[color:var(--wp-text-muted)]"> ({inv.fundAllocation})</span> : null}
                </li>
              ) : null}
              {inv.investmentStrategy ? (
                <li>
                  <span className="text-[color:var(--wp-text-muted)]">Strategie: </span>
                  {inv.investmentStrategy}
                </li>
              ) : null}
              {inv.investmentHorizon ? (
                <li>
                  <span className="text-[color:var(--wp-text-muted)]">Horizont: </span>
                  {inv.investmentHorizon}
                </li>
              ) : null}
              {inv.monthlyContribution != null && inv.monthlyContribution > 0 ? (
                <li>
                  <span className="text-[color:var(--wp-text-muted)]">Příspěvek: </span>
                  {inv.monthlyContribution.toLocaleString("cs-CZ")} Kč / měsíc
                </li>
              ) : null}
              {inv.targetAmount ? (
                <li>
                  <span className="text-[color:var(--wp-text-muted)]">Cíl / částka: </span>
                  {inv.targetAmount}
                </li>
              ) : null}
              {!inv.fundName &&
              !inv.investmentStrategy &&
              !inv.investmentHorizon &&
              !(inv.monthlyContribution != null && inv.monthlyContribution > 0) &&
              !inv.targetAmount ? (
                <li className="text-[color:var(--wp-text-muted)]">Žádné další parametry v evidenci.</li>
              ) : null}
            </ul>
          </AccordionRow>
        ) : null}

        {pen ? (
          <AccordionRow title="Penze — parametry" icon={PiggyBank} defaultOpen>
            <ul className="space-y-1.5 text-sm">
              {pen.company ? (
                <li>
                  <span className="text-[color:var(--wp-text-muted)]">Společnost: </span>
                  {pen.company}
                </li>
              ) : null}
              {pen.participantContribution ? (
                <li>
                  <span className="text-[color:var(--wp-text-muted)]">Účastník: </span>
                  <span className="font-semibold">{pen.participantContribution}</span>
                </li>
              ) : null}
              {pen.employerContribution ? (
                <li>
                  <span className="text-[color:var(--wp-text-muted)]">Zaměstnavatel: </span>
                  <span className="text-emerald-700 font-semibold">{pen.employerContribution}</span>
                </li>
              ) : null}
              {pen.stateContributionEstimate ? (
                <li>
                  <span className="text-[color:var(--wp-text-muted)]">Státní příspěvek (odhad): </span>
                  <span className="text-indigo-700 font-semibold">{pen.stateContributionEstimate}</span>
                </li>
              ) : null}
              {pen.investmentStrategy ? (
                <li>
                  <span className="text-[color:var(--wp-text-muted)]">Strategie: </span>
                  {pen.investmentStrategy}
                </li>
              ) : null}
              {product.fvReadiness.investmentHorizon ? (
                <li>
                  <span className="text-[color:var(--wp-text-muted)]">Horizont: </span>
                  {product.fvReadiness.investmentHorizon}
                </li>
              ) : null}
              {!pen.company &&
              !pen.participantContribution &&
              !pen.employerContribution &&
              !pen.stateContributionEstimate &&
              !pen.investmentStrategy &&
              !product.fvReadiness.investmentHorizon ? (
                <li className="text-[color:var(--wp-text-muted)]">Žádné další parametry v evidenci.</li>
              ) : null}
            </ul>
          </AccordionRow>
        ) : null}

        {life && life.risks.length > 0 ? (
          <AccordionRow title="Životní pojištění — rizika" icon={Shield} defaultOpen>
            <ul className="space-y-2">
              {life.risks.map((r, i) => (
                <li key={`${r.label}-${i}`} className="rounded-md bg-[color:var(--wp-surface-muted)] px-2 py-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{r.label}</span>
                    {r.amount ? <span className="font-bold text-purple-700 text-sm shrink-0">{r.amount}</span> : null}
                  </div>
                  {r.coverageEnd ? (
                    <span className="block text-xs text-[color:var(--wp-text-muted)] mt-0.5">Do {r.coverageEnd}</span>
                  ) : null}
                  {r.monthlyRiskPremium ? (
                    <span className="block text-xs text-[color:var(--wp-text-muted)]">Měsíční rizikové: {r.monthlyRiskPremium}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </AccordionRow>
        ) : null}

        {life && life.persons.length > 0 ? (
          <AccordionRow title="Životní pojištění — osoby" icon={User}>
            <ul className="space-y-2">
              {life.persons.map((p, i) => (
                <li key={`${p.name ?? ""}-${i}`} className="rounded-md bg-[color:var(--wp-surface-muted)] px-2 py-1.5 flex items-start gap-2">
                  <User className="size-3.5 text-purple-500 shrink-0 mt-0.5" aria-hidden />
                  <div className="min-w-0">
                    <span className="font-medium">{p.name ?? "—"}</span>
                    <span className="text-[color:var(--wp-text-muted)]"> · {personRoleLabelCs(p.role)}</span>
                    {p.birthDate ? (
                      <span className="block text-xs text-[color:var(--wp-text-muted)]">Nar.: {p.birthDate}</span>
                    ) : null}
                    {p.personalId ? (
                      <span className="block text-xs text-[color:var(--wp-text-muted)]">RČ: {p.personalId}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </AccordionRow>
        ) : null}

        {(veh && veh.coverageLines.length > 0) || (prop && prop.coverageLines.length > 0) ? (
          <AccordionRow title="Majetek / vozidlo — limity a připojištění" icon={veh ? Car : Home} defaultOpen>
            <ul className="space-y-2">
              {(veh?.coverageLines ?? prop?.coverageLines ?? []).map((line, i) => (
                <li key={`cov-${i}`} className="rounded-md bg-[color:var(--wp-surface-muted)] px-2 py-1.5 text-sm flex items-start justify-between gap-2">
                  <span className="font-medium">{line.label ?? "Položka"}</span>
                  {line.amount ? <span className="font-bold text-[color:var(--wp-text)] shrink-0">{line.amount}</span> : null}
                  {line.description ? (
                    <span className="block text-xs text-[color:var(--wp-text-muted)] mt-0.5">{line.description}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </AccordionRow>
        ) : null}

        {prop?.sumInsured ? (
          <AccordionRow title="Majetek — pojistná částka / limit" icon={Home}>
            <p className="text-sm font-semibold">{prop.sumInsured}</p>
          </AccordionRow>
        ) : null}

        {loan ? (
          <AccordionRow title="Úvěr — parametry" icon={Landmark} defaultOpen>
            <ul className="space-y-1.5 text-sm">
              {loan.lender ? (
                <li>
                  <span className="text-[color:var(--wp-text-muted)]">Věřitel: </span>
                  {loan.lender}
                </li>
              ) : null}
              {loan.loanPrincipal ? (
                <li>
                  <span className="text-[color:var(--wp-text-muted)]">Jistina: </span>
                  <span className="font-bold text-rose-700">{loan.loanPrincipal}</span>
                </li>
              ) : null}
              {loan.monthlyPayment != null && loan.monthlyPayment > 0 ? (
                <li>
                  <span className="text-[color:var(--wp-text-muted)]">Splátka: </span>
                  {loan.monthlyPayment.toLocaleString("cs-CZ")} Kč / měsíc
                </li>
              ) : null}
              {loan.fixationUntil ? (
                <li>
                  <span className="text-[color:var(--wp-text-muted)]">Fixace do: </span>
                  <span className="font-semibold text-amber-700">{loan.fixationUntil}</span>
                </li>
              ) : null}
              {loan.maturityDate ? (
                <li>
                  <span className="text-[color:var(--wp-text-muted)]">Splatnost: </span>
                  {loan.maturityDate}
                </li>
              ) : null}
            </ul>
          </AccordionRow>
        ) : null}

        {!d && detailRows.length > 0 ? (
          <AccordionRow title="Podrobnosti produktu" icon={FileText} defaultOpen>
            <ul className="space-y-2">
              {detailRows.map((row) => (
                <li key={row.label} className="flex justify-between gap-3 text-xs">
                  <span className="text-[color:var(--wp-text-muted)] font-semibold shrink-0">{row.label}</span>
                  <span className="text-[color:var(--wp-text)] font-medium text-right">{row.value}</span>
                </li>
              ))}
            </ul>
          </AccordionRow>
        ) : null}

        {contract.note?.trim() ? (
          <AccordionRow title="Poznámka v evidenci" icon={FileText}>
            <p className="text-sm whitespace-pre-wrap">{contract.note.trim()}</p>
          </AccordionRow>
        ) : null}
      </div>

      {/* ── Provenance footer ── */}
      <div className="px-4 pb-3 text-[11px] text-[color:var(--wp-text-muted)] flex flex-wrap gap-x-2 gap-y-1 border-t border-[color:var(--wp-border-muted)] pt-2">
        <span>
          {contract.visibleToClient === false ? "Skryto v klientské zóně" : "V klientské zóně"}
        </span>
        <ContractProvenanceLine
          sourceKind={contract.sourceKind}
          sourceDocumentId={contract.sourceDocumentId}
          sourceContractReviewId={contract.sourceContractReviewId}
          advisorConfirmedAt={contract.advisorConfirmedAt}
        />
      </div>

      {provenance !== undefined ? (
        <div className="px-4 pb-2">
          {provenance?.supportingDocumentGuard ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 leading-none">
              <FileCheck className="w-3 h-3 text-slate-400" aria-hidden />
              Podkladový dokument — evidenční záznam bez potvrzovacího toku
            </span>
          ) : (
            <ContractPendingFieldsGuard contractId={contract.id} provenance={provenance} />
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-[color:var(--wp-border-muted)]">
        {variant === "pending" && onApproveForClient ? (
          <button
            type="button"
            onClick={() => void onApproveForClient()}
            disabled={publishBusy}
            className="rounded-[var(--wp-radius)] bg-emerald-600 text-white px-3 py-2 text-sm font-semibold min-h-[44px] hover:bg-emerald-700 disabled:opacity-60"
          >
            {publishBusy ? "Zveřejňuji…" : "Schválit pro klienta"}
          </button>
        ) : null}
        <Link
          href={`/portal/terminations/new?contactId=${encodeURIComponent(contactId)}&contractId=${encodeURIComponent(contract.id)}`}
          className="inline-flex items-center justify-center rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] px-3 py-2 text-sm font-semibold text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px]"
        >
          Výpověď
        </Link>
        <button
          type="button"
          onClick={onEdit}
          className="px-3 py-2 rounded-[var(--wp-radius)] text-[var(--wp-accent)] font-medium hover:bg-[color:var(--wp-surface-muted)] min-h-[44px] border border-[color:var(--wp-border)]"
        >
          Upravit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="px-3 py-2 rounded-[var(--wp-radius)] text-red-600 font-medium hover:bg-red-50 min-h-[44px]"
        >
          Smazat
        </button>
      </div>
    </article>
  );
}
