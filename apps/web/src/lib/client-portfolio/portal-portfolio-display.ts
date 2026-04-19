/**
 * Shared presentation helpers for client portal portfolio (web + mobile).
 * Input: canonical product from `mapContractToCanonicalProduct` — single read path.
 */

import { formatDisplayDateCs } from "@/lib/date/format-display-cs";
import type { CanonicalProduct } from "@/lib/products/canonical-product-read";
import { fundLibraryLogoPathForPortal } from "@/lib/fund-library/shared-future-value";
import { resolveInstitutionLogo } from "@/lib/institutions/institution-logo";

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

/**
 * Resolves the monthly contribution to use for FV computation.
 * For DPS: prefer participantContributionNumeric from segmentDetail (most truthful source),
 * fall back to premiumMonthly.
 * For INV/DIP: use premiumMonthly directly.
 */
export function resolveFvMonthlyContribution(p: CanonicalProduct): number | null {
  if (p.segment === "DPS" && p.segmentDetail?.kind === "pension") {
    const explicit = p.segmentDetail.participantContributionNumeric;
    if (explicit != null && explicit > 0) return explicit;
  }
  return p.premiumMonthly;
}

function collectInstitutionNameCandidates(p: CanonicalProduct): string[] {
  const names: string[] = [];
  const d = p.segmentDetail;
  if (d?.kind === "investment" && d.institution?.trim()) names.push(d.institution.trim());
  else if (d?.kind === "life_insurance" && d.insurer?.trim()) names.push(d.insurer.trim());
  else if (d?.kind === "vehicle" && d.insurer?.trim()) names.push(d.insurer.trim());
  else if (d?.kind === "property" && d.insurer?.trim()) names.push(d.insurer.trim());
  else if (d?.kind === "pension" && d.company?.trim()) names.push(d.company.trim());
  else if (d?.kind === "loan" && d.lender?.trim()) names.push(d.lender.trim());
  if (p.partnerName?.trim()) names.push(p.partnerName.trim());
  return names;
}

/**
 * Logo pro kartu portfolia:
 * 1) mapa institucí `/logos/*` (pojistitel, platforma, partner — AMUNDI, UNIQA, …),
 * 2) u řádků s `segmentDetail.kind === "investment"` logo fondu z knihovny (když má brand asset),
 * 3) jinak null.
 *
 * Pořadí je záměrně „instituce před fondem“, aby u AMUNDI / platform nezůstalo generické logo fondu.
 * Logo fondu se nebere z `fvReadiness` u neinvestičních segmentů (např. ŽP s omylem vyplněným fondem).
 */
export function resolvePortalProductDisplayLogo(p: CanonicalProduct): { src: string; alt: string } | null {
  for (const name of collectInstitutionNameCandidates(p)) {
    const logo = resolveInstitutionLogo(name);
    if (logo) return { src: logo.src, alt: `Logo ${logo.alt}` };
  }

  const fundId =
    p.segmentDetail?.kind === "investment"
      ? (p.segmentDetail.resolvedFundId || p.fvReadiness.resolvedFundId)
      : null;
  const fundPath = fundLibraryLogoPathForPortal(fundId);
  if (fundPath) {
    const fundName =
      p.segmentDetail?.kind === "investment" ? p.segmentDetail.fundName?.trim() ?? null : null;
    return {
      src: fundPath,
      alt: fundName ? `Logo fondu ${fundName}` : "Logo fondu",
    };
  }

  return null;
}

/** Vrací jen cestu k obrázku (stejná logika jako `resolvePortalProductDisplayLogo`). */
export function resolvePortalFundLogoPath(p: CanonicalProduct): string | null {
  return resolvePortalProductDisplayLogo(p)?.src ?? null;
}

/**
 * Když je v jednom textovém poli krytí dvakrát stejný seznam (např. chyba zdroje),
 * sjednotí části oddělené středníkem bez změny pořadí prvního výskytu.
 */
export function dedupeSemicolonSeparatedPhrases(line: string): string {
  const parts = line
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.normalize("NFC").replace(/\s+/g, " ").toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out.join("; ");
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
    const cn = p.contractNumber?.trim();
    if (cn) rows.push({ label: "Číslo smlouvy", value: cn });
    if (d.insurer) rows.push({ label: "Pojišťovna", value: d.insurer });
    if (d.startDate) rows.push({ label: "Počátek", value: formatDisplayDateCs(d.startDate) || d.startDate });
    if (d.endDate) rows.push({ label: "Výročí / konec pojistné doby", value: formatDisplayDateCs(d.endDate) || d.endDate });
    if (d.monthlyPremium != null && d.monthlyPremium > 0) {
      rows.push({ label: "Měsíční pojistné", value: `${d.monthlyPremium.toLocaleString("cs-CZ")} Kč` });
    }
    if (d.sumInsured) rows.push({ label: "Pojistná částka", value: d.sumInsured });
    if (d.generalPractitioner?.trim()) {
      rows.push({ label: "Praktický lékař", value: d.generalPractitioner.trim() });
    }
    if (d.idCardNumber?.trim()) {
      rows.push({ label: "Číslo dokladu (OP/pas)", value: d.idCardNumber.trim() });
    }
    if (d.persons.length) {
      const PERSON_ROLE_LABELS: Record<string, string> = {
        policyholder: "Pojistník",
        insured: "Pojištěný",
        child: "Dítě",
        beneficiary: "Oprávněná osoba",
        other: "Osoba",
      };
      for (const person of d.persons) {
        const roleLabel = PERSON_ROLE_LABELS[person.role] ?? "Osoba";
        const parts: string[] = [];
        if (person.name?.trim()) parts.push(person.name.trim());
        const bd = person.birthDate?.trim();
        if (bd) parts.push(`nar. ${formatDisplayDateCs(bd) || bd}`);
        const rc = person.personalId?.trim();
        if (rc) parts.push(`rodné číslo ${rc}`);
        const op = person.idCardNumber?.trim();
        if (op) parts.push(`č. dokladu: ${op}`);
        const value = parts.length > 0 ? parts.join(" · ") : roleLabel;
        rows.push({ label: `Osoba (${roleLabel})`, value });
      }
    }
    if (d.risks.length) {
      const riskParts: string[] = d.risks.map((risk) =>
        risk.amount ? `${risk.label}: ${risk.amount}` : risk.label,
      );
      rows.push({
        label: "Pojistné krytí",
        value: dedupeSemicolonSeparatedPhrases(riskParts.join("; ")),
      });
    }
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
    const pensionHorizon = d.investmentHorizon || p.fvReadiness.investmentHorizon;
    if (pensionHorizon) {
      rows.push({ label: "Investiční horizont", value: pensionHorizon });
    }
  } else if (d?.kind === "loan") {
    if (d.lender) rows.push({ label: "Úvěrující", value: d.lender });
    if (d.loanPrincipal) rows.push({ label: "Jistina", value: d.loanPrincipal });
    if (d.monthlyPayment != null && d.monthlyPayment > 0) {
      rows.push({ label: "Měsíční splátka", value: `${d.monthlyPayment.toLocaleString("cs-CZ")} Kč` });
    }
    if (d.interestRate) rows.push({ label: "Úroková sazba", value: d.interestRate });
    if (d.fixationUntil) rows.push({ label: "Fixace do", value: d.fixationUntil });
    if (d.maturityDate) rows.push({ label: "Splatnost", value: d.maturityDate });
  }

  return rows;
}

/**
 * Popisky skryté v klientském portfoliu (u ŽP nahrazuje textové krytí sekce „Rizika / krytí“,
 * u DPS nahrazuje řádky příspěvků sekce „Složení měsíčního vkladu“).
 */
const CLIENT_ZONE_PORTFOLIO_DETAIL_OMIT_LABELS = new Set([
  "Pojistné krytí",
  "Číslo dokladu (OP/pas)",
  "Praktický lékař",
  "Účastník",
  "Zaměstnavatel",
  "Státní příspěvek (odhad)",
]);

/**
 * Řádky pro rozbalený detail v klientském portfoliu (web i mobil).
 * Bez souhrnného krytí, čísla OP u smlouvy a lékaře; bez DPS příspěvků (jsou v breakdown widgetu);
 * bez řádku „Typ produktu“ (je v záhlaví karty).
 */
export function canonicalPortfolioDetailRowsForClientPortfolioCard(
  p: CanonicalProduct,
): { label: string; value: string }[] {
  return canonicalPortfolioDetailRows(p)
    .filter((r) => !CLIENT_ZONE_PORTFOLIO_DETAIL_OMIT_LABELS.has(r.label))
    .filter((r) => r.label !== "Typ produktu");
}

/**
 * Text pro sekci „Poznámky k produktu“ na přehledu — strukturované řádky z kanonického modelu
 * + volitelná interní poznámka poradce, pokud doplňuje nebo se liší.
 */
export function overviewStructuredProductNotesBody(
  product: CanonicalProduct,
  advisorNote: string | null | undefined,
): string {
  const rows = canonicalPortfolioDetailRows(product);
  const lines = rows
    .map((r) => (r.value?.trim() ? `${r.label}: ${r.value}` : ""))
    .filter(Boolean);
  const structured = lines.join("\n");
  const note = (advisorNote ?? "").trim();
  if (!structured && !note) return "";
  if (structured && note && note !== structured && !structured.includes(note)) {
    return `${structured}\n\n— Interní poznámka poradce —\n${note}`;
  }
  if (structured) return structured;
  return note;
}
