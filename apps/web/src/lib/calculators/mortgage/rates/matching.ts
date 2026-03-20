import { BANKS_DATA } from "../mortgage.config";
import type { BankEntry } from "../mortgage.types";
import type { NormalizedOffer } from "./types";

export interface RateScenario {
  productType: "mortgage" | "loan";
  subtype: string;
  amount: number;
  termMonths: number;
  ltvOrAkontace: number;
  fixationYears?: number;
  mode: "new" | "refi";
}

function rangeFitScore(value: number, min: number, max: number, maxScore: number): number {
  if (value >= min && value <= max) return maxScore;
  const dist = value < min ? min - value : value - max;
  const span = Math.max(1, max - min);
  const penalty = (dist / span) * maxScore;
  return Math.max(0, maxScore - penalty);
}

function scoreOffer(offer: NormalizedOffer, scenario: RateScenario): number {
  let score = 0;

  if (offer.productType === scenario.productType) score += 25;
  score += rangeFitScore(scenario.amount, offer.minAmount, offer.maxAmount, 20);
  score += rangeFitScore(scenario.termMonths, offer.minTermMonths, offer.maxTermMonths, 15);

  if (offer.subtype == null) score += 5;
  else if (offer.subtype === scenario.subtype) score += 10;

  if (scenario.productType === "mortgage" && scenario.fixationYears != null) {
    if (offer.fixationOptions.length === 0) score += 2;
    else if (offer.fixationOptions.includes(scenario.fixationYears)) score += 8;
    else score -= 4;
  }

  if (offer.ltvLimit == null) score += 2;
  else if (scenario.ltvOrAkontace <= offer.ltvLimit) score += 8;
  else score -= 15;

  if (scenario.mode === "refi") score += 2;

  return score;
}

export function rankOffersByScenario(
  offers: NormalizedOffer[],
  scenario: RateScenario
): NormalizedOffer[] {
  const filtered = offers.filter((offer) => offer.productType === scenario.productType);
  return [...filtered].sort((a, b) => {
    const scoreDiff = scoreOffer(b, scenario) - scoreOffer(a, scenario);
    if (scoreDiff !== 0) return scoreDiff;
    return a.nominalRate - b.nominalRate;
  });
}

export function normalizedOffersToBankEntries(
  rankedOffers: NormalizedOffer[],
  productType: "mortgage" | "loan"
): BankEntry[] {
  const logosById = new Map(BANKS_DATA.map((bank) => [bank.id, bank.logoUrl]));

  return rankedOffers.map((offer) => ({
    id: offer.providerId,
    name: offer.providerName,
    baseRate: productType === "mortgage" ? offer.nominalRate : 99,
    loanRate: productType === "loan" ? offer.nominalRate : 99,
    apr: offer.apr,
    logoUrl: logosById.get(offer.providerId) ?? "",
    source: offer.source,
    sourceUrl: offer.sourceUrl,
    fetchedAt: offer.fetchedAt,
  }));
}
