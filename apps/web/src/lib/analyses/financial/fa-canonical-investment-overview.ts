/**
 * Investiční přehled pro finanční analýzu ze stejného kanonického read modelu jako portál
 * a klientské portfolio — mapování přes `mapContractToCanonicalProduct`, FV výhradně přes
 * `computePortalInvestmentFutureValue` (sdílený kalkulátor).
 */

import {
  mapContractToCanonicalProduct,
  type CanonicalProduct,
  type RawContractInput,
} from "@/lib/products/canonical-product-read";
import { computePortalInvestmentFutureValue } from "@/lib/fund-library/shared-future-value";

const FV_SEGMENTS = new Set(["INV", "DIP", "DPS"]);

/** Řádek přehledu pro UI / HTML report — žádné interní enumy pro vykreslení. */
export type FaCanonicalInvestmentOverviewRow = {
  contractId: string;
  segmentLabel: string;
  productTitle: string;
  institution: string | null;
  fundOrStrategy: string | null;
  contributionSummary: string;
  horizonLabel: string | null;
  futureValueFormatted: string | null;
  /** Částka FV v Kč pro součty v UI/reportu; null pokud FV nejde spočítat. */
  futureValueAmount: number | null;
  /** Krátké české vysvětlení odhadu FV (bez technických kódů). */
  futureValueNotes: string[];
};

const FV_NON_GUARANTEE_CS =
  "Jedná se o orientační modelaci — není to záruka výnosu ani budoucí hodnoty.";

const EVIDENCE_SCOPE_CS =
  "Řádek vychází ze skutečné smlouvy v evidenci (zápis v CRM po schválení a publikaci).";

function fundOrStrategyLine(p: CanonicalProduct): string | null {
  const d = p.segmentDetail;
  if (d?.kind === "investment") {
    const parts = [d.fundName, d.investmentStrategy].filter(Boolean) as string[];
    const joined = parts.join(" — ").trim();
    if (joined) return joined;
    return p.productName;
  }
  if (d?.kind === "pension") {
    const parts = [d.investmentStrategy, p.productName].filter(Boolean) as string[];
    const joined = parts.join(" — ").trim();
    return joined || null;
  }
  return p.productName;
}

function horizonLabel(p: CanonicalProduct): string | null {
  const fr = p.fvReadiness.investmentHorizon?.trim();
  if (fr) return fr;
  if (p.segmentDetail?.kind === "investment") {
    return p.segmentDetail.investmentHorizon?.trim() || null;
  }
  return null;
}

function contributionSummary(p: CanonicalProduct): string {
  const m = p.premiumMonthly ?? 0;
  const y = p.premiumAnnual ?? 0;
  if (m > 0) return `Pravidelně ${m.toLocaleString("cs-CZ")} Kč / měsíc`;
  if (y > 0) return `Pravidelně ${y.toLocaleString("cs-CZ")} Kč / rok`;
  if (p.segmentDetail?.kind === "investment" && p.segmentDetail.targetAmount?.trim()) {
    return `Jednorázově / cíl: ${p.segmentDetail.targetAmount.trim()}`;
  }
  return "Dle smlouvy";
}

function institutionLine(p: CanonicalProduct): string | null {
  if (p.segmentDetail?.kind === "investment") {
    return p.segmentDetail.institution?.trim() || p.partnerName;
  }
  if (p.segmentDetail?.kind === "pension") {
    return p.segmentDetail.company?.trim() || p.partnerName;
  }
  return p.partnerName;
}

/**
 * Sestaví řádky investičního přehledu z normalizovaných smluv (stejný vstup jako portál).
 */
export function buildFaCanonicalInvestmentOverviewRows(
  contracts: RawContractInput[],
): FaCanonicalInvestmentOverviewRow[] {
  const out: FaCanonicalInvestmentOverviewRow[] = [];

  for (const row of contracts) {
    if (!FV_SEGMENTS.has(row.segment)) continue;

    const p = mapContractToCanonicalProduct(row);

    const fv = computePortalInvestmentFutureValue({
      fvSourceType: p.fvReadiness.fvSourceType,
      resolvedFundId: p.fvReadiness.resolvedFundId,
      resolvedFundCategory: p.fvReadiness.resolvedFundCategory,
      investmentHorizon: p.fvReadiness.investmentHorizon,
      monthlyContribution: p.premiumMonthly,
      annualContribution: p.premiumAnnual,
    });

    const notes: string[] = [];
    notes.push(EVIDENCE_SCOPE_CS);
    if (fv) {
      notes.push(fv.sourceExplanation);
      notes.push(FV_NON_GUARANTEE_CS);
    }

    out.push({
      contractId: p.id,
      segmentLabel: p.segmentLabel,
      productTitle: p.productName?.trim() || p.segmentLabel,
      institution: institutionLine(p),
      fundOrStrategy: fundOrStrategyLine(p),
      contributionSummary: contributionSummary(p),
      horizonLabel: horizonLabel(p),
      futureValueFormatted: fv ? `${fv.amount.toLocaleString("cs-CZ")} Kč` : null,
      futureValueAmount: fv ? fv.amount : null,
      futureValueNotes: notes,
    });
  }

  return out;
}
