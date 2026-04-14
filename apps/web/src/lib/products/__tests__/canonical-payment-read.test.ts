/**
 * Phase 3 / Slice 1 — Canonical payment read layer tests.
 * Run: pnpm vitest run src/lib/products/__tests__/canonical-payment-read.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  paymentSegmentCategory,
  matchPaymentToProduct,
  paymentDedupKey,
  PAYMENT_CATEGORY_LABELS,
} from "../canonical-payment-read";
import type { CanonicalProduct } from "../canonical-product-read";

function makeProduct(overrides: Partial<CanonicalProduct> = {}): CanonicalProduct {
  return {
    id: "c-1",
    contactId: "contact-1",
    segment: "INV",
    partnerId: null,
    productId: null,
    partnerName: "ATRIS",
    productName: "Atris fond",
    premiumAmount: "5000",
    premiumAnnual: null,
    contractNumber: "INV-001",
    startDate: null,
    anniversaryDate: null,
    note: null,
    visibleToClient: true,
    portfolioStatus: "active",
    sourceKind: "manual",
    sourceDocumentId: null,
    sourceContractReviewId: null,
    advisorConfirmedAt: null,
    portfolioAttributes: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("paymentSegmentCategory", () => {
  it("maps known segments to Czech categories", () => {
    expect(paymentSegmentCategory("MAJ")).toBe("pojisteni_majetku");
    expect(paymentSegmentCategory("HYPO")).toBe("bydleni");
    expect(paymentSegmentCategory("UVER")).toBe("uvery");
    expect(paymentSegmentCategory("ZP")).toBe("pojisteni_osob");
    expect(paymentSegmentCategory("DPS")).toBe("penze");
    expect(paymentSegmentCategory("INV")).toBe("investice");
    expect(paymentSegmentCategory("DIP")).toBe("investice");
    expect(paymentSegmentCategory("AUTO_PR")).toBe("pojisteni_vozidel");
    expect(paymentSegmentCategory("AUTO_HAV")).toBe("pojisteni_vozidel");
  });

  it("returns 'ostatni' for unknown segments", () => {
    expect(paymentSegmentCategory("UNKNOWN")).toBe("ostatni");
    expect(paymentSegmentCategory("CEST")).toBe("ostatni");
  });
});

describe("PAYMENT_CATEGORY_LABELS", () => {
  it("all categories have Czech labels", () => {
    expect(PAYMENT_CATEGORY_LABELS.bydleni).toBe("Bydlení");
    expect(PAYMENT_CATEGORY_LABELS.investice).toBe("Investice");
    expect(PAYMENT_CATEGORY_LABELS.pojisteni_osob).toBe("Pojištění osob");
  });
});

describe("matchPaymentToProduct", () => {
  it("matches by contractNumber (strongest)", () => {
    const products = [
      makeProduct({ id: "p1", contractNumber: "ZP-100", segment: "ZP", partnerName: "Allianz" }),
      makeProduct({ id: "p2", contractNumber: "INV-200", segment: "INV", partnerName: "Conseq" }),
    ];
    const result = matchPaymentToProduct(
      { contractNumber: "ZP-100", partnerName: "Allianz", segment: "ZP" },
      products,
    );
    expect(result).toBe("p1");
  });

  it("matches case-insensitively", () => {
    const products = [makeProduct({ id: "p1", contractNumber: "Zp-100", segment: "ZP" })];
    expect(
      matchPaymentToProduct({ contractNumber: "zp-100", partnerName: "X", segment: "ZP" }, products),
    ).toBe("p1");
  });

  it("falls back to partnerName + segment when contractNumber missing", () => {
    const products = [
      makeProduct({ id: "p1", segment: "ZP", partnerName: "Allianz", contractNumber: null }),
    ];
    expect(
      matchPaymentToProduct({ contractNumber: null, partnerName: "Allianz", segment: "ZP" }, products),
    ).toBe("p1");
  });

  it("returns null when no match", () => {
    const products = [makeProduct({ id: "p1", segment: "INV", partnerName: "Conseq" })];
    expect(
      matchPaymentToProduct({ contractNumber: null, partnerName: "Allianz", segment: "ZP" }, products),
    ).toBeNull();
  });

  it("handles empty products array", () => {
    expect(
      matchPaymentToProduct({ contractNumber: "X", partnerName: "Y", segment: "ZP" }, []),
    ).toBeNull();
  });
});

describe("paymentDedupKey", () => {
  it("produces stable keys", () => {
    const key = paymentDedupKey({
      partnerName: "Allianz",
      productName: "ŽP Plus",
      contractNumber: "123",
      accountNumber: "12345/0100",
      variableSymbol: "123",
    });
    expect(typeof key).toBe("string");
    expect(key.split("|")).toHaveLength(5);
  });

  it("normalizes whitespace and case", () => {
    const key1 = paymentDedupKey({
      partnerName: " Allianz ",
      productName: null,
      contractNumber: null,
      accountNumber: "12345",
      variableSymbol: null,
    });
    const key2 = paymentDedupKey({
      partnerName: "allianz",
      productName: null,
      contractNumber: null,
      accountNumber: "12345",
      variableSymbol: null,
    });
    expect(key1).toBe(key2);
  });
});

describe("payments stability on empty/partial data", () => {
  it("matchPaymentToProduct handles null partnerName products", () => {
    const products = [makeProduct({ id: "p1", segment: "ZP", partnerName: null })];
    expect(
      matchPaymentToProduct({ contractNumber: null, partnerName: "X", segment: "ZP" }, products),
    ).toBeNull();
  });

  it("paymentDedupKey handles all nulls", () => {
    const key = paymentDedupKey({
      partnerName: "",
      productName: null,
      contractNumber: null,
      accountNumber: "",
      variableSymbol: null,
    });
    expect(key).toBe("||||");
  });
});
