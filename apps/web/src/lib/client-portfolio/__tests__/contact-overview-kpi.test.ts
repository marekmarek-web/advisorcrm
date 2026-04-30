/**
 * Regresní testy KPI „Měsíční investice“ / „Osobní AUM“ na detailu klienta (poradce).
 * Reprodukuje bug, kdy jednorázová investice 1 000 000 Kč se propisovala jako
 * „Měsíční investice 1 000 000 Kč“ a AUM zůstávalo 0 (–).
 */
import { describe, expect, it } from "vitest";
import type { ContractRow } from "@/app/actions/contracts";
import { computeContactOverviewKpiFromContracts } from "../contact-overview-kpi";

function row(overrides: Partial<ContractRow>): ContractRow {
  return {
    id: "c1",
    contactId: "contact1",
    segment: "INV",
    type: "INV",
    partnerId: null,
    productId: null,
    partnerName: "CODYA investiční společnost, a.s.",
    productName: "Penta Equity Fund SICAV, a.s., Penta Equity podfond – třída D",
    premiumAmount: null,
    premiumAnnual: null,
    contractNumber: null,
    startDate: null,
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
    createdAt: new Date("2026-04-21"),
    updatedAt: new Date("2026-04-21"),
    ...overrides,
  };
}

describe("ContactOverviewKpi — jednorázová investice se nezobrazuje jako měsíční", () => {
  it("1 000 000 Kč one_time INV: monthlyInvest=0, personalAum=1 000 000", () => {
    const rows: ContractRow[] = [
      row({
        segment: "INV",
        type: "INV",
        premiumAmount: "1000000",
        portfolioAttributes: { paymentType: "one_time" },
      }),
    ];
    const k = computeContactOverviewKpiFromContracts(rows);
    expect(k.monthlyInvest).toBe(0);
    expect(k.personalAum).toBe(1_000_000);
    expect(k.monthlyInsurance).toBe(0);
    expect(k.annualInsurance).toBe(0);
  });

  it("pravidelná INV 3 000 Kč/měs × 16 let s intendedInvestment=576 000: monthlyInvest=3 000, AUM=576 000", () => {
    const rows: ContractRow[] = [
      row({
        segment: "INV",
        type: "INV",
        premiumAmount: "3000",
        premiumAnnual: "36000",
        portfolioAttributes: {
          paymentType: "regular",
          intendedInvestment: "576000",
        },
      }),
    ];
    const k = computeContactOverviewKpiFromContracts(rows);
    expect(k.monthlyInvest).toBe(3_000);
    expect(k.personalAum).toBe(576_000);
  });

  it("pravidelná INV bez intendedInvestment: AUM fallback na roční ekvivalent (12× měs.)", () => {
    const rows: ContractRow[] = [
      row({
        segment: "INV",
        type: "INV",
        premiumAmount: "2000",
        premiumAnnual: null,
        portfolioAttributes: { paymentType: "regular" },
      }),
    ];
    const k = computeContactOverviewKpiFromContracts(rows);
    expect(k.monthlyInvest).toBe(2_000);
    expect(k.personalAum).toBe(24_000);
  });

  it("ŽP (pojištění): do AUM se NEpočítá, jde jen do měsíčního/ročního pojistného", () => {
    const rows: ContractRow[] = [
      row({
        segment: "ZP",
        type: "ZP",
        premiumAmount: "2442",
        premiumAnnual: "29304",
        portfolioAttributes: {},
      }),
    ];
    const k = computeContactOverviewKpiFromContracts(rows);
    expect(k.personalAum).toBe(0);
    expect(k.monthlyInvest).toBe(0);
    expect(k.monthlyInsurance).toBe(2_442);
    expect(k.annualInsurance).toBe(29_304);
  });

  it("roční pojištění se nepočítá do měsíčního pojistného", () => {
    const rows: ContractRow[] = [
      row({
        segment: "ODP_ZAM",
        type: "ODP_ZAM",
        premiumAmount: "413",
        premiumAnnual: "4956",
        portfolioAttributes: { paymentFrequencyLabel: "ročně" },
      }),
    ];
    const k = computeContactOverviewKpiFromContracts(rows);
    expect(k.monthlyInsurance).toBe(0);
    expect(k.annualInsurance).toBe(4_956);
  });

  it("mix: 1M one_time INV + 3 000 regular INV + 2 442 ŽP → AUM=1M+36k proxy, měs. invest=3 000", () => {
    const rows: ContractRow[] = [
      row({
        id: "c-onetime",
        segment: "INV",
        type: "INV",
        premiumAmount: "1000000",
        portfolioAttributes: { paymentType: "one_time" },
      }),
      row({
        id: "c-regular",
        segment: "INV",
        type: "INV",
        premiumAmount: "3000",
        portfolioAttributes: { paymentType: "regular" },
      }),
      row({
        id: "c-zp",
        segment: "ZP",
        type: "ZP",
        premiumAmount: "2442",
        premiumAnnual: "29304",
      }),
    ];
    const k = computeContactOverviewKpiFromContracts(rows);
    expect(k.personalAum).toBe(1_000_000 + 36_000);
    expect(k.monthlyInvest).toBe(3_000);
    expect(k.monthlyInsurance).toBe(2_442);
    expect(k.annualInsurance).toBe(29_304);
  });

  it("F4 double-guard: INV bez paymentType s premiumAmount=1M (lump-sum halucinace) → monthlyInvest=0", () => {
    // Legacy smlouva – paymentType nikdy nezapsáno, label indikuje jednorázovost
    // až po fallbacku v canonical-contract-read. Double-guard v contact-overview-kpi
    // musí zachránit i smlouvy, které nemají ani label.
    const rows: ContractRow[] = [
      row({
        segment: "INV",
        type: "INV",
        premiumAmount: "1000000",
        premiumAnnual: null,
        portfolioAttributes: {},
      }),
    ];
    const k = computeContactOverviewKpiFromContracts(rows);
    expect(k.monthlyInvest).toBe(0);
  });

  it("F4 double-guard: INV bez paymentType, ale premiumMonthly=3 000 (realistické) → započítává se", () => {
    const rows: ContractRow[] = [
      row({
        segment: "INV",
        type: "INV",
        premiumAmount: "3000",
        premiumAnnual: null,
        portfolioAttributes: {},
      }),
    ];
    const k = computeContactOverviewKpiFromContracts(rows);
    expect(k.monthlyInvest).toBe(3_000);
  });

  it("F4 double-guard: INV bez paymentType, s premiumAnnual (znamená regular) → nečinnost guardu, započítá se", () => {
    const rows: ContractRow[] = [
      row({
        segment: "INV",
        type: "INV",
        premiumAmount: "60000",
        premiumAnnual: "60000",
        portfolioAttributes: {},
      }),
    ];
    const k = computeContactOverviewKpiFromContracts(rows);
    expect(k.monthlyInvest).toBe(60_000);
  });

  it("non-advisor sourceKind (např. client) se nezapočítá", () => {
    const rows: ContractRow[] = [
      row({
        segment: "INV",
        type: "INV",
        premiumAmount: "500000",
        portfolioAttributes: { paymentType: "one_time" },
        sourceKind: "client",
      }),
    ];
    const k = computeContactOverviewKpiFromContracts(rows);
    expect(k.personalAum).toBe(0);
    expect(k.monthlyInvest).toBe(0);
  });
});
