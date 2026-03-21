import { BANKS_DATA } from "../mortgage.config";
import type { BankEntry } from "../mortgage.types";
import type { NormalizedOffer } from "./types";

export const ALLOWED_BANK_IDS = ["rb", "ucb", "csob", "cs", "mbank", "kb", "rsts", "mpyr"] as const;

const CANONICAL_BANK_META: Record<(typeof ALLOWED_BANK_IDS)[number], { name: string }> = {
  rb: { name: "Raiffeisenbank" },
  ucb: { name: "UniCredit Bank" },
  csob: { name: "ČSOB" },
  cs: { name: "Česká spořitelna" },
  mbank: { name: "mBank" },
  kb: { name: "Komerční banka" },
  rsts: { name: "Raiffeisen stavební spořitelna" },
  mpyr: { name: "Modrá pyramida" },
};

function detectCanonicalBankId(providerId: string, providerName: string): (typeof ALLOWED_BANK_IDS)[number] | null {
  const id = providerId.toLowerCase();
  const name = providerName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (id.includes("raiff") || name.includes("raiffeisen")) return "rb";
  if (id.includes("unicredit") || id === "ucb" || name.includes("unicredit")) return "ucb";
  if (id.includes("csob") || name.includes("csob")) return "csob";
  if (id === "cs" || id.includes("sporitelna") || name.includes("ceska sporitelna")) return "cs";
  if (id.includes("mbank") || name.includes("mbank")) return "mbank";
  if (id === "kb" || name.includes("komercni banka")) return "kb";
  if (id.includes("rsts") || name.includes("raiffeisen stavebni")) return "rsts";
  if (id.includes("mpyr") || id.includes("modra") || name.includes("modra pyramida")) return "mpyr";

  return null;
}

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
  const logosById = new Map(BANKS_DATA.map((bank) => [bank.id, bank.logoUrl] as const));
  const bestByCanonicalId = new Map<(typeof ALLOWED_BANK_IDS)[number], NormalizedOffer>();

  for (const offer of rankedOffers) {
    const canonicalId = detectCanonicalBankId(offer.providerId, offer.providerName);
    if (!canonicalId) continue;

    const existing = bestByCanonicalId.get(canonicalId);
    if (!existing || offer.nominalRate < existing.nominalRate) {
      bestByCanonicalId.set(canonicalId, offer);
    }
  }

  const entries = Array.from(bestByCanonicalId.entries()).map(([canonicalId, offer]) => ({
    id: canonicalId,
    name: CANONICAL_BANK_META[canonicalId].name,
    baseRate: productType === "mortgage" ? offer.nominalRate : 99,
    loanRate: productType === "loan" ? offer.nominalRate : 99,
    apr: offer.apr,
    logoUrl: logosById.get(canonicalId) ?? "",
    source: offer.source,
    sourceUrl: offer.sourceUrl,
    fetchedAt: offer.fetchedAt,
  }));

  return entries.sort((a, b) => {
    const aRate = productType === "mortgage" ? a.baseRate : a.loanRate;
    const bRate = productType === "mortgage" ? b.baseRate : b.loanRate;
    return aRate - bRate;
  });
}
