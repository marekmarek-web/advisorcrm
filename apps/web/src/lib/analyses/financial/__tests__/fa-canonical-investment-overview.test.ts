/**
 * Run: pnpm vitest run src/lib/analyses/financial/__tests__/fa-canonical-investment-overview.test.ts
 */
import { describe, it, expect } from "vitest";
import { buildFaCanonicalInvestmentOverviewRows } from "../fa-canonical-investment-overview";
import type { RawContractInput } from "@/lib/client-portfolio/canonical-contract-read";

function baseRow(over: Partial<RawContractInput>): RawContractInput {
  return {
    id: "c1",
    contactId: "k1",
    segment: "INV",
    type: "INV",
    partnerId: null,
    productId: null,
    partnerName: "Test Invest a.s.",
    productName: "Podílový účet",
    premiumAmount: "5000",
    premiumAnnual: null,
    contractNumber: "123",
    startDate: "2025-01-01",
    anniversaryDate: null,
    note: null,
    visibleToClient: true,
    portfolioStatus: "active",
    sourceKind: "ai_review",
    portfolioAttributes: {},
    ...over,
  };
}

describe("buildFaCanonicalInvestmentOverviewRows", () => {
  it("ignores non-investment segments", () => {
    const rows = buildFaCanonicalInvestmentOverviewRows([
      baseRow({ id: "a", segment: "ZP", type: "ZP" }),
    ]);
    expect(rows).toEqual([]);
  });

  it("includes INV/DIP/DPS and maps institution from partner", () => {
    const rows = buildFaCanonicalInvestmentOverviewRows([
      baseRow({
        id: "inv1",
        segment: "INV",
        portfolioAttributes: {
          investmentHorizon: "15 let",
          resolvedFundId: "ishares_core_msci_world",
          fvSourceType: "fund-library",
          investmentFunds: [{ name: "MSCI World UCITS" }],
        },
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].institution).toBe("Test Invest a.s.");
    expect(rows[0].fundOrStrategy).toContain("MSCI");
    expect(rows[0].contributionSummary).toMatch(/Pravidelně/);
    expect(rows[0].horizonLabel).toBe("15 let");
    expect(rows[0].futureValueFormatted).not.toBeNull();
    expect(rows[0].futureValueNotes.join(" ")).toMatch(/evidence|fond|kategorie|orientační|záruka/i);
  });

  it("still emits a row when FV cannot be computed (missing inputs)", () => {
    const rows = buildFaCanonicalInvestmentOverviewRows([
      baseRow({
        id: "inv2",
        premiumAmount: "0",
        premiumAnnual: null,
        portfolioAttributes: {
          investmentHorizon: null,
          fvSourceType: null,
        },
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].futureValueFormatted).toBeNull();
    expect(rows[0].futureValueNotes).toEqual([]);
  });
});
