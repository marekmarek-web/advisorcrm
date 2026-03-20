import { describe, expect, it } from "vitest";
import {
  normalizedOffersToBankEntries,
  rankOffersByScenario,
} from "../matching";
import type { NormalizedOffer } from "../types";

const mockOffers: NormalizedOffer[] = [
  {
    providerId: "a",
    providerName: "Banka A",
    productType: "mortgage",
    subtype: null,
    nominalRate: 4.59,
    minAmount: 500_000,
    maxAmount: 10_000_000,
    minTermMonths: 60,
    maxTermMonths: 420,
    ltvLimit: 90,
    fixationOptions: [3, 5],
    source: "static",
    fetchedAt: new Date().toISOString(),
  },
  {
    providerId: "b",
    providerName: "Banka B",
    productType: "mortgage",
    subtype: null,
    nominalRate: 4.29,
    minAmount: 3_000_000,
    maxAmount: 30_000_000,
    minTermMonths: 120,
    maxTermMonths: 420,
    ltvLimit: 80,
    fixationOptions: [5, 7, 10],
    source: "kurzy-cz",
    sourceUrl: "https://www.kurzy.cz/hypoteky/srovnani-hypotek/",
    fetchedAt: new Date().toISOString(),
  },
];

describe("rates matching", () => {
  it("ranks nearest offers by scenario relevance", () => {
    const ranked = rankOffersByScenario(mockOffers, {
      productType: "mortgage",
      subtype: "standard",
      amount: 4_000_000,
      termMonths: 360,
      ltvOrAkontace: 80,
      fixationYears: 5,
      mode: "new",
    });

    expect(ranked).toHaveLength(2);
    expect(ranked[0].providerId).toBe("b");
  });

  it("normalizes ranked offers into BankEntry shape", () => {
    const ranked = rankOffersByScenario(mockOffers, {
      productType: "mortgage",
      subtype: "standard",
      amount: 2_000_000,
      termMonths: 240,
      ltvOrAkontace: 75,
      fixationYears: 5,
      mode: "refi",
    });
    const banks = normalizedOffersToBankEntries(ranked, "mortgage");

    expect(banks[0].baseRate).toBeTypeOf("number");
    expect(banks[0].source).toBeDefined();
    expect(banks[0].fetchedAt).toBeDefined();
  });
});
