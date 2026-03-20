import { getOrFetchWithCache } from "./cache";
import { KurzyRateProvider } from "./kurzy.provider";
import { StaticRateProvider } from "./static.provider";
import type { NormalizedOffer, RateProvider } from "./types";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let singletonProvider: RateProvider | null = null;
const staticProvider = new StaticRateProvider();

function parseOverride(raw: string | undefined, productType: "mortgage" | "loan"): NormalizedOffer[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{
      providerId: string;
      providerName: string;
      nominalRate: number;
      apr?: number;
      minAmount?: number;
      maxAmount?: number;
      minTermMonths?: number;
      maxTermMonths?: number;
      ltvLimit?: number | null;
      fixationOptions?: number[];
      subtype?: string | null;
      sourceUrl?: string;
    }>;
    const fetchedAt = new Date().toISOString();
    return parsed.map((entry) => ({
      providerId: entry.providerId,
      providerName: entry.providerName,
      productType,
      subtype: entry.subtype ?? null,
      nominalRate: entry.nominalRate,
      apr: entry.apr,
      minAmount: entry.minAmount ?? (productType === "mortgage" ? 500_000 : 20_000),
      maxAmount: entry.maxAmount ?? (productType === "mortgage" ? 30_000_000 : 2_500_000),
      minTermMonths: entry.minTermMonths ?? 12,
      maxTermMonths: entry.maxTermMonths ?? (productType === "mortgage" ? 420 : 144),
      ltvLimit: entry.ltvLimit ?? (productType === "mortgage" ? 90 : null),
      fixationOptions: entry.fixationOptions ?? (productType === "mortgage" ? [3, 5, 7, 10] : []),
      source: "override",
      sourceUrl: entry.sourceUrl,
      fetchedAt,
    }));
  } catch {
    return [];
  }
}

export function getRateProvider(): RateProvider {
  if (singletonProvider) return singletonProvider;

  // Live mode by default: always try Kurzy.cz first (server-side scraping provider).
  // Emergency switch: FORCE_STATIC_RATES=true forces static provider.
  const forceStatic = process.env.FORCE_STATIC_RATES === "true";
  singletonProvider = forceStatic ? new StaticRateProvider() : new KurzyRateProvider();
  return singletonProvider;
}

export async function getMortgageRates(): Promise<NormalizedOffer[]> {
  const override = parseOverride(process.env.MORTGAGE_RATES_OVERRIDE_JSON, "mortgage");
  if (override.length > 0) return override;

  const provider = getRateProvider();
  try {
    return await getOrFetchWithCache("mortgage-rates", CACHE_TTL_MS, () =>
      provider.fetchMortgageRates()
    );
  } catch {
    return staticProvider.fetchMortgageRates();
  }
}

export async function getLoanRates(): Promise<NormalizedOffer[]> {
  const override = parseOverride(process.env.LOAN_RATES_OVERRIDE_JSON, "loan");
  if (override.length > 0) return override;

  const provider = getRateProvider();
  try {
    return await getOrFetchWithCache("loan-rates", CACHE_TTL_MS, () =>
      provider.fetchLoanRates()
    );
  } catch {
    return staticProvider.fetchLoanRates();
  }
}

export type { NormalizedOffer, RateProvider } from "./types";
export { rankOffersByScenario, normalizedOffersToBankEntries } from "./matching";
