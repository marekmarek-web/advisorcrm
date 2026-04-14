/**
 * Shared presentation helpers for client portal portfolio (web + mobile).
 * Input: canonical product from `mapContractToCanonicalProduct` — single read path.
 */

import { formatDisplayDateCs } from "@/lib/date/format-display-cs";
import type { CanonicalProduct } from "@/lib/products/canonical-product-read";
import { fundLibraryLogoPathForPortal } from "@/lib/fund-library/shared-future-value";

export function formatPortalPremiumLineCs(monthly: string | null, annual: string | null): string {
  const m = Number(monthly ?? "");
  const y = Number(annual ?? "");
  if (Number.isFinite(y) && y > 0) return `${y.toLocaleString("cs-CZ")} Kč / rok`;
  if (Number.isFinite(m) && m > 0) return `${m.toLocaleString("cs-CZ")} Kč / měsíc`;
  return "Dle smlouvy";
}

export function portfolioContractStatusLabelCs(portfolioStatus: string, startDate: string | null): string {
  if (portfolioStatus === "ended") return "Ukončené";
  if (!startDate) return "V evidenci";
  return "Aktivní";
}

export function isFvEligibleSegment(segment: string): boolean {
  return segment === "INV" || segment === "DIP" || segment === "DPS";
}

export function resolvePortalFundLogoPath(p: CanonicalProduct): string | null {
  if (p.segmentDetail?.kind === "investment" && p.segmentDetail.resolvedFundId) {
    return fundLibraryLogoPathForPortal(p.segmentDetail.resolvedFundId);
  }
  return fundLibraryLogoPathForPortal(p.fvReadiness.resolvedFundId);
}

export function canonicalPortfolioDetailRows(p: CanonicalProduct): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const d = p.segmentDetail;

  rows.push({ label: "Typ produktu", value: p.segmentLabel });

  if (d?.kind === "investment") {
    if (d.institution) rows.push({ label: "Instituce", value: d.institution });
    if (d.fundName) rows.push({ label: "Fond / třída", value: d.fundName });
    if (d.investmentStrategy) rows.push({ label: "Strategie", value: d.investmentStrategy });
    if (d.investmentHorizon) rows.push({ label: "Investiční horizont", value: d.investmentHorizon });
    if (d.monthlyContribution != null && d.monthlyContribution > 0) {
      rows.push({
        label: "Pravidelná částka",
        value: `${d.monthlyContribution.toLocaleString("cs-CZ")} Kč / měsíc`,
      });
    }
    if (d.targetAmount) rows.push({ label: "Cílová částka", value: d.targetAmount });
  } else if (d?.kind === "life_insurance") {
    if (d.insurer) rows.push({ label: "Pojišťovna", value: d.insurer });
    if (d.startDate) rows.push({ label: "Počátek", value: formatDisplayDateCs(d.startDate) || d.startDate });
    if (d.endDate) rows.push({ label: "Výročí / konec pojistné doby", value: formatDisplayDateCs(d.endDate) || d.endDate });
    if (d.monthlyPremium != null && d.monthlyPremium > 0) {
      rows.push({ label: "Měsíční pojistné", value: `${d.monthlyPremium.toLocaleString("cs-CZ")} Kč` });
    }
    if (d.sumInsured) rows.push({ label: "Pojistná částka", value: d.sumInsured });
    if (d.persons.length) rows.push({ label: "Osoby ve smlouvě", value: `${d.persons.length}` });
    if (d.risks.length) rows.push({ label: "Rizika / připojištění", value: `${d.risks.length} položek` });
  } else if (d?.kind === "vehicle") {
    rows.push({ label: "Typ", value: d.subtype === "HAV" ? "Havarijní pojištění" : "Povinné ručení" });
    if (d.vehicleRegistration) rows.push({ label: "SPZ / vozidlo", value: d.vehicleRegistration });
    if (d.insurer) rows.push({ label: "Pojišťovna", value: d.insurer });
  } else if (d?.kind === "property") {
    rows.push({
      label: "Typ",
      value: d.subtype === "liability" ? "Odpovědnost" : "Majetek",
    });
    if (d.propertyAddress) rows.push({ label: "Adresa / předmět", value: d.propertyAddress });
    if (d.insurer) rows.push({ label: "Pojišťovna", value: d.insurer });
    if (d.sumInsured) rows.push({ label: "Limit / pojistná částka", value: d.sumInsured });
  } else if (d?.kind === "pension") {
    if (d.company) rows.push({ label: "Společnost", value: d.company });
    if (d.participantContribution) rows.push({ label: "Účastník", value: d.participantContribution });
    if (d.employerContribution) rows.push({ label: "Zaměstnavatel", value: d.employerContribution });
    if (d.stateContributionEstimate) rows.push({ label: "Státní příspěvek (odhad)", value: d.stateContributionEstimate });
    if (d.investmentStrategy) rows.push({ label: "Strategie", value: d.investmentStrategy });
    if (p.fvReadiness.investmentHorizon) {
      rows.push({ label: "Investiční horizont", value: p.fvReadiness.investmentHorizon });
    }
  } else if (d?.kind === "loan") {
    if (d.lender) rows.push({ label: "Úvěrující", value: d.lender });
    if (d.loanPrincipal) rows.push({ label: "Jistina", value: d.loanPrincipal });
    if (d.monthlyPayment != null && d.monthlyPayment > 0) {
      rows.push({ label: "Měsíční splátka", value: `${d.monthlyPayment.toLocaleString("cs-CZ")} Kč` });
    }
    if (d.fixationUntil) rows.push({ label: "Fixace do", value: d.fixationUntil });
    if (d.maturityDate) rows.push({ label: "Splatnost", value: d.maturityDate });
  }

  return rows;
}
