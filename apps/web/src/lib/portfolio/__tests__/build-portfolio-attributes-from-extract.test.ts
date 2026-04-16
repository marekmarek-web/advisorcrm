import { describe, expect, it } from "vitest";
import {
  buildPortfolioAttributesFromExtracted,
  mergePortfolioAttributesForApply,
} from "../build-portfolio-attributes-from-extract";
import { canonicalPortfolioDetailRows } from "@/lib/client-portfolio/portal-portfolio-display";
import { mapContractToCanonicalProduct } from "@/lib/client-portfolio/canonical-contract-read";

describe("buildPortfolioAttributesFromExtracted — insuredRisks / AI canonical", () => {
  it("maps root insuredRisks with riskLabel and insuredAmount to portfolio_attributes.risks", () => {
    const attrs = buildPortfolioAttributesFromExtracted({
      documentClassification: { primaryType: "life_insurance_proposal" },
      insuredRisks: [
        { riskLabel: "Smrt", riskType: "death", insuredAmount: 1_500_000, linkedParticipantName: "Jan Novák" },
      ],
    });
    expect(attrs.risks).toHaveLength(1);
    const r = (attrs.risks as Array<{ label: string; amount?: string; personRef?: string }>)[0];
    expect(r.label).toBe("Smrt");
    expect(r.amount).toBe("1500000");
    expect(r.personRef).toBe("Jan Novák");
  });

  it("parses insuredRisks JSON string into risks", () => {
    const json = JSON.stringify([{ riskLabel: "Invalidita", insuredAmount: "1M Kč" }]);
    const attrs = buildPortfolioAttributesFromExtracted({
      documentClassification: { primaryType: "life_insurance_contract" },
      insuredRisks: json,
    });
    expect(attrs.risks).toHaveLength(1);
    expect((attrs.risks as Array<{ label: string }>)[0].label).toBe("Invalidita");
  });

  it("collapses the same risk repeated in insuredRisks, riders and coverages", () => {
    const row = { riskLabel: "Smrt", insuredAmount: "50000" };
    const attrs = buildPortfolioAttributesFromExtracted({
      documentClassification: { primaryType: "life_insurance_proposal" },
      insuredRisks: [{ ...row, linkedParticipantName: "Jan" }],
      riders: [{ ...row, linkedParticipantName: "Marie" }],
      coverages: [{ ...row, person: "Dítě" }],
    });
    expect(attrs.risks).toHaveLength(1);
  });

  it("feeds canonical product notes row Pojistné krytí end-to-end", () => {
    const attrs = buildPortfolioAttributesFromExtracted({
      documentClassification: { primaryType: "life_insurance_proposal" },
      insuredRisks: [{ riskLabel: "Smrt", insuredAmount: "3M Kč" }],
    });
    const product = mapContractToCanonicalProduct({
      id: "c1",
      contactId: "k1",
      segment: "ZP",
      type: "ZP",
      partnerId: null,
      productId: null,
      partnerName: "Test pojišťovna",
      productName: "Život & radost",
      premiumAmount: "1532",
      premiumAnnual: null,
      contractNumber: null,
      startDate: "2025-03-20",
      anniversaryDate: null,
      note: null,
      visibleToClient: true,
      portfolioStatus: "active",
      sourceKind: "ai_review",
      portfolioAttributes: attrs,
    });
    const rows = canonicalPortfolioDetailRows(product);
    const cov = rows.find((x) => x.label === "Pojistné krytí");
    expect(cov?.value).toContain("Smrt");
    expect(cov?.value).toContain("3M Kč");
  });
});

describe("mergePortfolioAttributesForApply — risks", () => {
  it("does not wipe existing risks when next apply sends empty risks array", () => {
    const prev = { risks: [{ label: "Smrt", amount: "1M" }] };
    const next = { risks: [] as Array<{ label: string; amount: string }> };
    const merged = mergePortfolioAttributesForApply(prev, next);
    expect(merged.risks).toEqual(prev.risks);
  });

  it("replaces risks when next has items", () => {
    const prev = { risks: [{ label: "Smrt", amount: "1M" }] };
    const next = { risks: [{ label: "Invalidita", amount: "2M" }] };
    const merged = mergePortfolioAttributesForApply(prev, next);
    expect(merged.risks).toEqual(next.risks);
  });
});
