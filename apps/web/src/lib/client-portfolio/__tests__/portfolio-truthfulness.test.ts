/**
 * Portfolio non-empty truthfulness tests.
 *
 * These tests verify that the canonical read layer does NOT accidentally
 * filter out or hide valid contracts that should appear in the portfolio.
 */
import { describe, it, expect } from "vitest";
import {
  mapContractToCanonicalProduct,
  mapContractsToCanonicalProducts,
  type RawContractInput,
} from "../canonical-contract-read";

function makeContract(overrides: Partial<RawContractInput> = {}): RawContractInput {
  return {
    id: "truthful-1",
    contactId: "ct1",
    segment: "INV",
    type: "INV",
    partnerId: null,
    productId: null,
    partnerName: "Conseq",
    productName: "Conseq Invest",
    premiumAmount: "5000",
    premiumAnnual: null,
    contractNumber: "123456",
    startDate: "2024-01-15",
    anniversaryDate: null,
    note: null,
    visibleToClient: true,
    portfolioStatus: "active",
    sourceKind: "ai_review",
    portfolioAttributes: {},
    ...overrides,
  };
}

describe("portfolio non-empty truthfulness", () => {
  it("active visible contract always maps to a product", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({ visibleToClient: true, portfolioStatus: "active" }),
    );
    expect(product).toBeDefined();
    expect(product.id).toBe("truthful-1");
  });

  it("ended visible contract maps to a product", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({ portfolioStatus: "ended" }),
    );
    expect(product).toBeDefined();
    expect(product.portfolioStatus).toBe("ended");
  });

  it("AI Review sourced contract is treated identically to manual", () => {
    const aiProduct = mapContractToCanonicalProduct(
      makeContract({ sourceKind: "ai_review" }),
    );
    const manualProduct = mapContractToCanonicalProduct(
      makeContract({ sourceKind: "manual" }),
    );
    expect(aiProduct.segmentLabel).toBe(manualProduct.segmentLabel);
    expect(aiProduct.segmentDetail?.kind).toBe(manualProduct.segmentDetail?.kind);
  });

  it("contract with minimal data (only segment + partner) still maps", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({
        premiumAmount: null,
        premiumAnnual: null,
        contractNumber: null,
        startDate: null,
        productName: null,
        portfolioAttributes: null,
      }),
    );
    expect(product.id).toBe("truthful-1");
    expect(product.segmentDetail).not.toBeNull();
  });

  it("every supported segment produces a segmentDetail", () => {
    const segments = ["INV", "DIP", "DPS", "ZP", "AUTO_PR", "AUTO_HAV", "MAJ", "ODP", "HYPO", "UVER"];
    for (const seg of segments) {
      const product = mapContractToCanonicalProduct(makeContract({ segment: seg }));
      expect(product.segmentDetail, `segment ${seg} should produce detail`).not.toBeNull();
    }
  });

  it("batch mapping preserves all contracts — no filtering", () => {
    const contracts = [
      makeContract({ id: "a" }),
      makeContract({ id: "b" }),
      makeContract({ id: "c" }),
    ];
    const products = mapContractsToCanonicalProducts(contracts);
    expect(products).toHaveLength(3);
  });

  it("contract with only partnerName and segment still shows", () => {
    const product = mapContractToCanonicalProduct(
      makeContract({
        productName: null,
        premiumAmount: null,
        premiumAnnual: null,
        contractNumber: null,
        portfolioAttributes: null,
      }),
    );
    expect(product.partnerName).toBe("Conseq");
    expect(product.segment).toBe("INV");
  });
});
