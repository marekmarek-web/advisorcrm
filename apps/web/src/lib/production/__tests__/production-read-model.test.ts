import { describe, expect, it } from "vitest";
import {
  aggregateProductionContracts,
  mapProductionContract,
  type ProductionContractSource,
} from "../production-read-model";

function source(overrides: Partial<ProductionContractSource>): ProductionContractSource {
  return {
    id: "contract-1",
    contactId: "contact-1",
    segment: "INV",
    segmentLabel: "Investice",
    group: "investment",
    partnerName: "Penta",
    productName: "Codya",
    contractNumber: "C-1",
    startDate: "30.04.2026",
    productionDate: "30.04.2026",
    premiumAmount: null,
    premiumAnnual: null,
    portfolioAttributes: {},
    bjUnits: null,
    bjCalculation: null,
    ...overrides,
  };
}

describe("production read model", () => {
  it("investment principal is not production when a rule is missing", () => {
    const row = mapProductionContract(
      source({
        premiumAmount: "1000000",
        bjUnits: null,
        bjCalculation: {
          formula: "investment_amount",
          amountCzk: 0,
          coefficient: null,
          divisor: null,
          matchedRule: {
            productCategory: "INVESTMENT_AUM_FOLLOWUP",
            partnerPattern: null,
            subtype: null,
            tenantScope: "global",
          },
          notes: ["Pro kategorii INVESTMENT_AUM_FOLLOWUP nebylo nalezeno žádné BJ pravidlo."],
          computedAt: "2026-04-30T00:00:00.000Z",
        },
      }),
    );

    expect(row.clientAmount).toBe(1_000_000);
    expect(row.clientAmountType).toBe("investment_principal");
    expect(row.productionBj).toBeNull();
    expect(row.calculationStatus).toBe("missing_rule");
    expect(row.productionWarnings).toContain("Chybí produkční pravidlo v katalogu");

    const summary = aggregateProductionContracts([row]);
    expect(summary.totalClientAmount).toBe(1_000_000);
    expect(summary.totalProductionBj).toBe(0);
  });

  it("investment with entry fee rule uses the fee, not the principal", () => {
    const row = mapProductionContract(
      source({
        premiumAmount: "1000000",
        portfolioAttributes: { entryFee: "1000" },
        bjUnits: "4",
        bjCalculation: {
          formula: "entry_fee",
          amountCzk: 1000,
          coefficient: 0.004,
          divisor: null,
          matchedRule: {
            productCategory: "INVESTMENT_ENTRY_FEE",
            partnerPattern: "^codya",
            subtype: null,
            tenantScope: "global",
          },
          notes: [],
          computedAt: "2026-04-30T00:00:00.000Z",
        },
      }),
    );

    expect(row.clientAmount).toBe(1000);
    expect(row.clientAmountType).toBe("entry_fee");
    expect(row.productionBj).toBe(4);
    expect(row.productionCalculationTrace.rate).toBe(0.004);
  });

  it("investment with subsidized commission uses the catalog rate", () => {
    const row = mapProductionContract(
      source({
        portfolioAttributes: { targetAmount: "1000000" },
        bjUnits: "160",
        bjCalculation: {
          formula: "investment_amount",
          amountCzk: 1_000_000,
          coefficient: 0.00016,
          divisor: null,
          matchedRule: {
            productCategory: "INVESTMENT_SINGLE_WITH_ENTRY_FEE",
            partnerPattern: "^atris",
            subtype: null,
            tenantScope: "global",
          },
          notes: [],
          computedAt: "2026-04-30T00:00:00.000Z",
        },
      }),
    );

    expect(row.clientAmount).toBe(1_000_000);
    expect(row.productionBj).toBe(160);
    expect(row.productionCalculationTrace.normalizedInputValue).toBe(1_000_000);
    expect(row.productionCalculationTrace.resultBj).toBe(160);
  });

  it("life insurance monthly premium keeps annualized value in trace", () => {
    const row = mapProductionContract(
      source({
        segment: "ZP",
        segmentLabel: "Životní pojištění",
        group: "insurance",
        partnerName: "UNIQA",
        premiumAmount: "2442",
        premiumAnnual: "29304",
        bjUnits: "241.758",
        bjCalculation: {
          formula: "annual_premium",
          amountCzk: 29304,
          coefficient: 0.00825,
          divisor: null,
          matchedRule: {
            productCategory: "LIFE_INSURANCE_REGULAR",
            partnerPattern: "^uniqa",
            subtype: null,
            tenantScope: "global",
          },
          notes: [],
          computedAt: "2026-04-30T00:00:00.000Z",
        },
      }),
    );

    expect(row.clientAmount).toBe(2442);
    expect(row.clientAmountType).toBe("monthly_premium");
    expect(row.productionBasis).toBe("monthly_premium_to_annual");
    expect(row.productionCalculationTrace.annualizedValue).toBe(29304);
  });

  it("property/liability monthly premium is not production unless catalog calculation exists", () => {
    const row = mapProductionContract(
      source({
        segment: "ODP",
        segmentLabel: "Odpovědnost",
        group: "insurance",
        partnerName: "ČSOB",
        premiumAmount: "413",
        premiumAnnual: "4956",
        bjUnits: "9.912",
        bjCalculation: {
          formula: "annual_premium",
          amountCzk: 4956,
          coefficient: 0.002,
          divisor: null,
          matchedRule: {
            productCategory: "LIABILITY_INSURANCE",
            partnerPattern: null,
            subtype: null,
            tenantScope: "global",
          },
          notes: [],
          computedAt: "2026-04-30T00:00:00.000Z",
        },
      }),
    );

    expect(row.clientAmount).toBe(413);
    expect(row.productionBj).toBe(9.912);
  });

  it("target-style aggregation uses production BJ, not client amount", () => {
    const row = mapProductionContract(
      source({
        premiumAmount: "1000000",
        bjUnits: "10000",
        bjCalculation: {
          formula: "investment_amount",
          amountCzk: 1_000_000,
          coefficient: 0.01,
          divisor: null,
          matchedRule: {
            productCategory: "INVESTMENT_SINGLE_WITH_ENTRY_FEE",
            partnerPattern: null,
            subtype: null,
            tenantScope: "tenant",
          },
          notes: [],
          computedAt: "2026-04-30T00:00:00.000Z",
        },
      }),
    );

    const summary = aggregateProductionContracts([row]);
    const targetBj = 100_000;
    const progress = Math.round((summary.totalProductionBj / targetBj) * 100);

    expect(summary.totalClientAmount).toBe(1_000_000);
    expect(summary.totalProductionBj).toBe(10_000);
    expect(progress).toBe(10);
    expect(summary.rows[0]?.productionBj).toBe(10_000);
  });
});
