import { LIMITS, TERM_LIMITS } from "../mortgage.config";
import { FIX_OPTIONS } from "../mortgage.constants";
import type { NormalizedOffer, RateProvider } from "./types";

const KURZY_MORTGAGE_URL = "https://www.kurzy.cz/hypoteky/srovnani-hypotek/";
const KURZY_LOAN_URL = "https://www.kurzy.cz/pujcky/pujcky-srovnani";

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRate(text: string): number | null {
  const m = text.match(/(\d+[,.]\d{1,2})\s*%/);
  if (!m) return null;
  const parsed = Number(m[1].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseApr(text: string): number | undefined {
  const m = text.match(/RPSN[^0-9]*?(\d+[,.]\d{1,2})\s*%/i);
  if (!m) return undefined;
  const parsed = Number(m[1].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractRows(html: string): string[] {
  return Array.from(html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)).map((m) => m[0]);
}

function parseProviderName(text: string): string | null {
  const parts = text.split(/\s{2,}/).filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0].trim();
  if (first.length < 2) return null;
  if (/^(úrok|sazba|měsíčně|splátka|rpsn|produkt)$/i.test(first)) return null;
  return first;
}

function toId(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseKurzyRows(
  html: string,
  productType: "mortgage" | "loan",
  sourceUrl: string
): NormalizedOffer[] {
  const nowIso = new Date().toISOString();
  const rows = extractRows(html);
  const offers: NormalizedOffer[] = [];

  for (const rowHtml of rows) {
    const text = stripTags(rowHtml);
    const nominalRate = parseRate(text);
    const providerName = parseProviderName(text);
    if (!providerName || nominalRate == null) continue;

    offers.push({
      providerId: toId(providerName),
      providerName,
      productType,
      subtype: null,
      nominalRate,
      apr: parseApr(text),
      minAmount: productType === "mortgage" ? LIMITS.mortgage.min : LIMITS.loan.min,
      maxAmount: productType === "mortgage" ? LIMITS.mortgage.max : LIMITS.loan.max,
      minTermMonths:
        productType === "mortgage"
          ? TERM_LIMITS.mortgage.min * 12
          : TERM_LIMITS.loanConsumer.min * 12,
      maxTermMonths:
        productType === "mortgage"
          ? TERM_LIMITS.mortgage.max * 12
          : TERM_LIMITS.loanConsumer.max * 12,
      ltvLimit: productType === "mortgage" ? 90 : null,
      fixationOptions: productType === "mortgage" ? [...FIX_OPTIONS] : [],
      source: "kurzy-cz",
      sourceUrl,
      fetchedAt: nowIso,
    });
  }

  const unique = new Map<string, NormalizedOffer>();
  for (const offer of offers) {
    const existing = unique.get(offer.providerId);
    if (!existing || offer.nominalRate < existing.nominalRate) {
      unique.set(offer.providerId, offer);
    }
  }
  return Array.from(unique.values());
}

/**
 * Experimental scraper provider for kurzy.cz.
 * Keep disabled by default via ENABLE_KURZY_SCRAPER=false.
 */
export class KurzyRateProvider implements RateProvider {
  async fetchMortgageRates(): Promise<NormalizedOffer[]> {
    const response = await fetch(KURZY_MORTGAGE_URL, {
      headers: { "User-Agent": "AidvisorRatesBot/1.0" },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Kurzy mortgage fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const offers = parseKurzyRows(html, "mortgage", KURZY_MORTGAGE_URL);
    if (offers.length === 0) {
      throw new Error("Kurzy mortgage parser found no offers");
    }
    return offers;
  }

  async fetchLoanRates(): Promise<NormalizedOffer[]> {
    const response = await fetch(KURZY_LOAN_URL, {
      headers: { "User-Agent": "AidvisorRatesBot/1.0" },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Kurzy loan fetch failed: ${response.status}`);
    }

    const html = await response.text();
    const offers = parseKurzyRows(html, "loan", KURZY_LOAN_URL);
    if (offers.length === 0) {
      throw new Error("Kurzy loan parser found no offers");
    }
    return offers;
  }
}
