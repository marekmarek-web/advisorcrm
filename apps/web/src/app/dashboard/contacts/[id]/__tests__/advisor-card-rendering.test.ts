/**
 * Advisor product cards — rendering / wiring tests.
 *
 * Tests the logic layer (canonical read + FV + detail rows) that drives
 * CanonicalProductAdvisorOverviewCard. Validates segment-specific surface,
 * FV states, life insurance separation, truthful empty states.
 *
 * Run: pnpm vitest run src/app/dashboard/contacts/\[id\]/__tests__/advisor-card-rendering.test.ts
 */
import { describe, it, expect } from "vitest";
import type { ContractRow } from "@/app/actions/contracts";
import {
  mapContractToCanonicalProduct,
  type RawContractInput,
} from "@/lib/client-portfolio/canonical-contract-read";
import {
  isFvEligibleSegment,
  canonicalPortfolioDetailRows,
} from "@/lib/client-portfolio/portal-portfolio-display";
import { computeSharedFutureValue } from "@/lib/fund-library/shared-future-value";
import { advisorPrimaryAmountPresentation } from "../advisor-product-overview-format";

function makeContract(overrides: Partial<ContractRow> = {}): ContractRow {
  return {
    id: "card-test-1",
    contactId: "ct1",
    segment: "INV",
    type: "INV",
    partnerId: null,
    productId: null,
    partnerName: "Conseq",
    productName: "Conseq Invest",
    premiumAmount: "5000",
    premiumAnnual: null,
    contractNumber: "INV-2024-001",
    startDate: "2024-01-15",
    anniversaryDate: null,
    note: null,
    visibleToClient: true,
    portfolioStatus: "active",
    sourceKind: "manual",
    sourceDocumentId: null,
    sourceContractReviewId: null,
    advisorConfirmedAt: null,
    confirmedByUserId: null,
    portfolioAttributes: {},
    extractionConfidence: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRaw(overrides: Partial<RawContractInput> = {}): RawContractInput {
  return {
    id: "card-test-1",
    contactId: "ct1",
    segment: "INV",
    type: "INV",
    partnerId: null,
    productId: null,
    partnerName: "Conseq",
    productName: "Conseq Invest",
    premiumAmount: "5000",
    premiumAnnual: null,
    contractNumber: "INV-2024-001",
    startDate: "2024-01-15",
    anniversaryDate: null,
    note: null,
    visibleToClient: true,
    portfolioStatus: "active",
    sourceKind: "manual",
    portfolioAttributes: {},
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// A. Segment-specific rendering smoke
// ──────────────────────────────────────────────────────────────────────────────

describe("A. Segment-specific advisor card rendering", () => {
  it("investment product: segmentDetail.kind is investment", () => {
    const p = mapContractToCanonicalProduct(makeRaw({ segment: "INV" }));
    expect(p.segmentDetail?.kind).toBe("investment");
  });

  it("DIP product: segmentDetail.kind is investment", () => {
    const p = mapContractToCanonicalProduct(makeRaw({ segment: "DIP" }));
    expect(p.segmentDetail?.kind).toBe("investment");
  });

  it("DPS product: segmentDetail.kind is pension", () => {
    const p = mapContractToCanonicalProduct(makeRaw({ segment: "DPS" }));
    expect(p.segmentDetail?.kind).toBe("pension");
  });

  it("ZP product: segmentDetail.kind is life_insurance, NOT investment", () => {
    const p = mapContractToCanonicalProduct(makeRaw({ segment: "ZP" }));
    expect(p.segmentDetail?.kind).toBe("life_insurance");
    expect(p.segmentDetail?.kind).not.toBe("investment");
  });

  it("AUTO_PR product: segmentDetail.kind is vehicle", () => {
    const p = mapContractToCanonicalProduct(makeRaw({ segment: "AUTO_PR" }));
    expect(p.segmentDetail?.kind).toBe("vehicle");
  });

  it("MAJ product: segmentDetail.kind is property", () => {
    const p = mapContractToCanonicalProduct(makeRaw({ segment: "MAJ" }));
    expect(p.segmentDetail?.kind).toBe("property");
  });

  it("HYPO product: segmentDetail.kind is loan", () => {
    const p = mapContractToCanonicalProduct(makeRaw({ segment: "HYPO" }));
    expect(p.segmentDetail?.kind).toBe("loan");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// B. FV advisor surface wiring
// ──────────────────────────────────────────────────────────────────────────────

describe("B. FV in advisor cards", () => {
  it("investment with full data → FV complete, non-null value", () => {
    const p = mapContractToCanonicalProduct(
      makeRaw({
        segment: "INV",
        premiumAmount: "5000",
        portfolioAttributes: {
          fvSourceType: "heuristic-fallback",
          resolvedFundCategory: "equity",
          investmentHorizon: "20 let",
        },
      }),
    );
    expect(isFvEligibleSegment(p.segment)).toBe(true);
    const fv = computeSharedFutureValue({
      fvSourceType: p.fvReadiness.fvSourceType,
      resolvedFundId: p.fvReadiness.resolvedFundId,
      resolvedFundCategory: p.fvReadiness.resolvedFundCategory,
      investmentHorizon: p.fvReadiness.investmentHorizon,
      monthlyContribution: p.premiumMonthly,
      annualContribution: p.premiumAnnual,
    });
    expect(fv.projectionState).toBe("complete");
    expect(fv.projectedFutureValue).not.toBeNull();
    expect(fv.projectedFutureValue! > 0).toBe(true);
  });

  it("investment missing horizon → FV partial, null value", () => {
    const p = mapContractToCanonicalProduct(
      makeRaw({
        segment: "INV",
        premiumAmount: "5000",
        portfolioAttributes: {
          fvSourceType: "heuristic-fallback",
          resolvedFundCategory: "equity",
        },
      }),
    );
    const fv = computeSharedFutureValue({
      fvSourceType: p.fvReadiness.fvSourceType,
      resolvedFundId: p.fvReadiness.resolvedFundId,
      resolvedFundCategory: p.fvReadiness.resolvedFundCategory,
      investmentHorizon: p.fvReadiness.investmentHorizon,
      monthlyContribution: p.premiumMonthly,
      annualContribution: p.premiumAnnual,
    });
    expect(fv.projectionState).toBe("partial");
    expect(fv.projectedFutureValue).toBeNull();
  });

  it("investment with no FV source → FV unavailable", () => {
    const p = mapContractToCanonicalProduct(
      makeRaw({
        segment: "INV",
        premiumAmount: "5000",
        portfolioAttributes: {},
      }),
    );
    const fv = computeSharedFutureValue({
      fvSourceType: p.fvReadiness.fvSourceType,
      resolvedFundId: p.fvReadiness.resolvedFundId,
      resolvedFundCategory: p.fvReadiness.resolvedFundCategory,
      investmentHorizon: p.fvReadiness.investmentHorizon,
      monthlyContribution: p.premiumMonthly,
      annualContribution: p.premiumAnnual,
    });
    expect(fv.projectionState).toBe("unavailable");
    expect(fv.projectedFutureValue).toBeNull();
  });

  it("ZP is not FV eligible — block should not render for life insurance", () => {
    expect(isFvEligibleSegment("ZP")).toBe(false);
  });

  it("HYPO is not FV eligible", () => {
    expect(isFvEligibleSegment("HYPO")).toBe(false);
  });

  it("DPS with full data → FV complete", () => {
    const p = mapContractToCanonicalProduct(
      makeRaw({
        segment: "DPS",
        premiumAmount: "2000",
        portfolioAttributes: {
          fvSourceType: "heuristic-fallback",
          resolvedFundCategory: "dps_dynamic",
          investmentHorizon: "15 let",
        },
      }),
    );
    expect(isFvEligibleSegment("DPS")).toBe(true);
    const fv = computeSharedFutureValue({
      fvSourceType: p.fvReadiness.fvSourceType,
      resolvedFundId: p.fvReadiness.resolvedFundId,
      resolvedFundCategory: p.fvReadiness.resolvedFundCategory,
      investmentHorizon: p.fvReadiness.investmentHorizon,
      monthlyContribution: p.premiumMonthly,
      annualContribution: p.premiumAnnual,
    });
    expect(fv.projectionState).toBe("complete");
    expect(fv.projectedFutureValue! > 0).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// C. Life insurance advisor surface
// ──────────────────────────────────────────────────────────────────────────────

describe("C. Life insurance advisor card surface", () => {
  it("ZP product exposes insurer from partnerName", () => {
    const p = mapContractToCanonicalProduct(
      makeRaw({ segment: "ZP", partnerName: "Allianz" }),
    );
    const d = p.segmentDetail;
    expect(d?.kind).toBe("life_insurance");
    if (d?.kind === "life_insurance") {
      expect(d.insurer).toBe("Allianz");
    }
  });

  it("ZP product exposes monthlyPremium when premiumAmount is set", () => {
    const p = mapContractToCanonicalProduct(
      makeRaw({ segment: "ZP", premiumAmount: "1200", partnerName: "Allianz" }),
    );
    const d = p.segmentDetail;
    if (d?.kind === "life_insurance") {
      expect(d.monthlyPremium).toBe(1200);
    }
  });

  it("ZP product does not generate investment detail rows", () => {
    const p = mapContractToCanonicalProduct(
      makeRaw({
        segment: "ZP",
        partnerName: "Allianz",
        premiumAmount: "1500",
        portfolioAttributes: {
          persons: [{ role: "policyholder", name: "Jan" }],
          risks: [{ label: "Smrt", amount: "3M Kč" }],
        },
      }),
    );
    const rows = canonicalPortfolioDetailRows(p);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("Pojišťovna");
    expect(labels).toContain("Měsíční pojistné");
    expect(labels).not.toContain("Fond / třída");
    expect(labels).not.toContain("Investiční horizont");
    expect(labels).not.toContain("Příspěvek");
  });

  it("ZP product exposes risks and persons arrays", () => {
    const p = mapContractToCanonicalProduct(
      makeRaw({
        segment: "ZP",
        portfolioAttributes: {
          persons: [{ role: "insured", name: "Jana" }, { role: "child", name: "Tomáš" }],
          risks: [{ label: "Smrt", amount: "2M Kč" }, { label: "Invalidita", amount: "1M Kč" }],
        },
      }),
    );
    const d = p.segmentDetail;
    if (d?.kind === "life_insurance") {
      expect(d.persons).toHaveLength(2);
      expect(d.risks).toHaveLength(2);
    }
  });

  it("ZP product with startDate and anniversaryDate exposes them in segmentDetail", () => {
    const p = mapContractToCanonicalProduct(
      makeRaw({
        segment: "ZP",
        startDate: "2020-01-01",
        anniversaryDate: "2040-01-01",
      }),
    );
    const d = p.segmentDetail;
    if (d?.kind === "life_insurance") {
      expect(d.startDate).toBe("2020-01-01");
      expect(d.endDate).toBe("2040-01-01");
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// D. Vehicle and property advisor surface
// ──────────────────────────────────────────────────────────────────────────────

describe("D. Vehicle and property advisor card", () => {
  it("AUTO_PR exposes vehicleRegistration from portfolioAttributes", () => {
    const p = mapContractToCanonicalProduct(
      makeRaw({
        segment: "AUTO_PR",
        partnerName: "Kooperativa",
        portfolioAttributes: { vehicleRegistration: "1AB 2345" },
      }),
    );
    const d = p.segmentDetail;
    if (d?.kind === "vehicle") {
      expect(d.vehicleRegistration).toBe("1AB 2345");
      expect(d.subtype).toBe("POV");
    }
  });

  it("AUTO_HAV subtype is HAV", () => {
    const p = mapContractToCanonicalProduct(
      makeRaw({ segment: "AUTO_HAV" }),
    );
    const d = p.segmentDetail;
    if (d?.kind === "vehicle") {
      expect(d.subtype).toBe("HAV");
    }
  });

  it("MAJ exposes propertyAddress and sumInsured", () => {
    const p = mapContractToCanonicalProduct(
      makeRaw({
        segment: "MAJ",
        portfolioAttributes: {
          propertyAddress: "Hlavní 1, Praha",
          sumInsured: "5 000 000 Kč",
        },
      }),
    );
    const d = p.segmentDetail;
    if (d?.kind === "property") {
      expect(d.propertyAddress).toBe("Hlavní 1, Praha");
      expect(d.sumInsured).toBe("5 000 000 Kč");
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// E. Primary amount presentation on advisor card
// ──────────────────────────────────────────────────────────────────────────────

describe("E. Advisor card primary amount", () => {
  it("INV: label is Platba, value from premiumAmount", () => {
    const c = makeContract({ segment: "INV", premiumAmount: "5000" });
    const p = mapContractToCanonicalProduct(c);
    const { label, value } = advisorPrimaryAmountPresentation(p, c);
    expect(label).toBe("Platba");
    expect(value).toContain("5");
  });

  it("ZP: label is Pojistné", () => {
    const c = makeContract({ segment: "ZP", premiumAmount: "1200", type: "ZP" });
    const p = mapContractToCanonicalProduct(c);
    const { label } = advisorPrimaryAmountPresentation(p, c);
    expect(label).toBe("Pojistné");
  });

  it("HYPO: label is Jistina when loan principal available", () => {
    const c = makeContract({
      segment: "HYPO",
      type: "HYPO",
      portfolioAttributes: { loanPrincipal: "4 850 000 Kč" },
    });
    const p = mapContractToCanonicalProduct(c);
    const { label, value } = advisorPrimaryAmountPresentation(p, c);
    expect(label).toBe("Jistina");
    expect(value).toBe("4 850 000 Kč");
  });

  it("DPS: label is Příspěvek účastníka when participantContribution available", () => {
    const c = makeContract({
      segment: "DPS",
      type: "DPS",
      portfolioAttributes: { participantContribution: "2 000 Kč" },
    });
    const p = mapContractToCanonicalProduct(c);
    const { label, value } = advisorPrimaryAmountPresentation(p, c);
    expect(label).toBe("Příspěvek účastníka");
    expect(value).toBe("2 000 Kč");
  });

  it("null premium → shows Dle smlouvy, not fake zero", () => {
    const c = makeContract({ segment: "ZP", type: "ZP", premiumAmount: null, premiumAnnual: null });
    const p = mapContractToCanonicalProduct(c);
    const { value } = advisorPrimaryAmountPresentation(p, c);
    expect(value).toBe("Dle smlouvy");
    expect(value).not.toBe("0 Kč");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// F. Empty / partial state truthfulness
// ──────────────────────────────────────────────────────────────────────────────

describe("F. Truthful empty and partial states", () => {
  it("canonical artifact with only partner+segment still maps (card must not be blank)", () => {
    const p = mapContractToCanonicalProduct(
      makeRaw({
        premiumAmount: null,
        premiumAnnual: null,
        contractNumber: null,
        productName: null,
        portfolioAttributes: null,
      }),
    );
    expect(p.id).toBe("card-test-1");
    expect(p.segmentDetail).not.toBeNull();
    expect(p.partnerName).toBe("Conseq");
  });

  it("investment with null portfolioAttributes does not hallucinate fund name", () => {
    const p = mapContractToCanonicalProduct(
      makeRaw({ segment: "INV", portfolioAttributes: null }),
    );
    const d = p.segmentDetail;
    if (d?.kind === "investment") {
      expect(d.fundName).toBeNull();
      expect(d.investmentStrategy).toBeNull();
    }
  });

  it("ZP with no risks array renders empty risks, no crash", () => {
    const p = mapContractToCanonicalProduct(
      makeRaw({ segment: "ZP", portfolioAttributes: {} }),
    );
    const d = p.segmentDetail;
    if (d?.kind === "life_insurance") {
      expect(d.risks).toHaveLength(0);
      expect(d.persons).toHaveLength(0);
    }
  });

  it("ZP null premium does not appear in detail rows as zero", () => {
    const p = mapContractToCanonicalProduct(
      makeRaw({ segment: "ZP", premiumAmount: null, premiumAnnual: null }),
    );
    const rows = canonicalPortfolioDetailRows(p);
    const premiumRow = rows.find((r) => r.label === "Měsíční pojistné");
    expect(premiumRow).toBeUndefined();
  });
});
