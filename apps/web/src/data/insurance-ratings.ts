/**
 * ŽP insurance ratings – informational only.
 * Partner-level: legacy data below. Product-level: eucs-zivot-rating.json (EUCS).
 *
 * DISCLAIMER: These ratings are purely informational. The advisor is responsible
 * for all recommendations. WePlan does not recommend specific products.
 */

import eucsZivotRating from "./eucs-zivot-rating.json";

export type EucsZivotItem = { partner: string; product: string; rating_total: number; as_of: string };
const eucsItems = (eucsZivotRating as { items: EucsZivotItem[] }).items ?? [];

/** EUCS ŽP disclaimer (z eucs-zivot-rating.json). */
export const EUCS_ZP_DISCLAIMER =
  (eucsZivotRating as { disclaimer?: string }).disclaimer ??
  "Rating je pouze informativní. WePlan nedává doporučení. Poradce odpovídá za rozhodnutí.";

/** Product-level EUCS rating lookup. Normalizes partner/product name for match. */
export function getEucsRatingForProduct(partnerName: string, productName: string): EucsZivotItem | undefined {
  if (!partnerName || !productName) return undefined;
  const p = partnerName.trim().toLowerCase();
  const prod = productName.trim().toLowerCase();
  return eucsItems.find((i) => {
    const iP = i.partner.trim().toLowerCase();
    const iProd = i.product.trim().toLowerCase();
    return (p === iP || p.includes(iP) || iP.includes(p)) && (prod === iProd || prod.includes(iProd) || iProd.includes(prod));
  });
}

export interface RatingCategory {
  name: string;
  score: number;
  maxScore: number;
}

export interface InsuranceRating {
  partnerId: string;
  partnerName: string;
  totalScore: number;
  maxTotalScore: number;
  categories: RatingCategory[];
}

export const insuranceRatings: InsuranceRating[] = [
  {
    partnerId: "uniqa",
    partnerName: "UNIQA",
    totalScore: 85,
    maxTotalScore: 100,
    categories: [
      { name: "Pojistné plnění", score: 18, maxScore: 20 },
      { name: "Šíře krytí", score: 17, maxScore: 20 },
      { name: "Flexibilita", score: 16, maxScore: 20 },
      { name: "Cena / hodnota", score: 17, maxScore: 20 },
      { name: "Servis a digitalizace", score: 17, maxScore: 20 },
    ],
  },
  {
    partnerId: "nn",
    partnerName: "NN Životní pojišťovna",
    totalScore: 82,
    maxTotalScore: 100,
    categories: [
      { name: "Pojistné plnění", score: 17, maxScore: 20 },
      { name: "Šíře krytí", score: 18, maxScore: 20 },
      { name: "Flexibilita", score: 15, maxScore: 20 },
      { name: "Cena / hodnota", score: 16, maxScore: 20 },
      { name: "Servis a digitalizace", score: 16, maxScore: 20 },
    ],
  },
  {
    partnerId: "generali",
    partnerName: "Generali Česká pojišťovna",
    totalScore: 78,
    maxTotalScore: 100,
    categories: [
      { name: "Pojistné plnění", score: 16, maxScore: 20 },
      { name: "Šíře krytí", score: 16, maxScore: 20 },
      { name: "Flexibilita", score: 15, maxScore: 20 },
      { name: "Cena / hodnota", score: 15, maxScore: 20 },
      { name: "Servis a digitalizace", score: 16, maxScore: 20 },
    ],
  },
  {
    partnerId: "allianz",
    partnerName: "Allianz",
    totalScore: 80,
    maxTotalScore: 100,
    categories: [
      { name: "Pojistné plnění", score: 17, maxScore: 20 },
      { name: "Šíře krytí", score: 16, maxScore: 20 },
      { name: "Flexibilita", score: 16, maxScore: 20 },
      { name: "Cena / hodnota", score: 15, maxScore: 20 },
      { name: "Servis a digitalizace", score: 16, maxScore: 20 },
    ],
  },
  {
    partnerId: "kooperativa",
    partnerName: "Kooperativa",
    totalScore: 76,
    maxTotalScore: 100,
    categories: [
      { name: "Pojistné plnění", score: 16, maxScore: 20 },
      { name: "Šíře krytí", score: 15, maxScore: 20 },
      { name: "Flexibilita", score: 14, maxScore: 20 },
      { name: "Cena / hodnota", score: 16, maxScore: 20 },
      { name: "Servis a digitalizace", score: 15, maxScore: 20 },
    ],
  },
];

/** Quick lookup: partner name (lowercase) → has rating data */
export const insurancePartnerIndex: Record<string, boolean> = {};
for (const r of insuranceRatings) {
  insurancePartnerIndex[r.partnerName.toLowerCase()] = true;
  insurancePartnerIndex[r.partnerId.toLowerCase()] = true;
}

export function findRatingByPartnerName(name: string): InsuranceRating | undefined {
  const lower = name.toLowerCase();
  return insuranceRatings.find(
    (r) => r.partnerName.toLowerCase() === lower || r.partnerId.toLowerCase() === lower || lower.includes(r.partnerId.toLowerCase())
  );
}

/** Legacy disclaimer (partner-level popover). */
export const ZP_RATING_DISCLAIMER =
  "Tyto ratingy jsou pouze informativní. Poradce odpovídá za všechna doporučení. WePlan nedoporučuje konkrétní produkty.";
