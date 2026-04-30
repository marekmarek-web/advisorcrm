import { describe, expect, it } from "vitest";
import type { ContractFormState } from "../contract-form-payload";
import {
  contractFormAnnualPillLabel,
  normalizeContractFormForSave,
} from "../contract-form-payload";

function form(overrides: Partial<ContractFormState>): ContractFormState {
  return {
    segment: "ODP_ZAM",
    partnerId: "",
    productId: "",
    partnerName: "ČSOB pojišťovna",
    productName: "Pojištění odpovědnosti zaměstnance",
    premiumAmount: "",
    premiumAnnual: "",
    contractNumber: "",
    startDate: "",
    anniversaryDate: "",
    note: "",
    paymentType: "regular",
    paymentFrequency: "monthly",
    entryFee: "",
    loanPrincipal: "",
    participantContribution: "",
    hasPpi: null,
    productCategory: null,
    ...overrides,
  };
}

describe("contract form payment frequency normalization", () => {
  it("annual insurance keeps annual premium and does not derive monthly premium", () => {
    const normalized = normalizeContractFormForSave(
      form({
        paymentFrequency: "annual",
        premiumAnnual: "4956",
        premiumAmount: "413",
      }),
    );

    expect(normalized.premiumAnnual).toBe("4956");
    expect(normalized.premiumAmount).toBeUndefined();
    expect(normalized.paymentFrequencyLabel).toBe("ročně");
    expect(contractFormAnnualPillLabel(form({ paymentFrequency: "annual", premiumAnnual: "4956" }))).toBeNull();
  });

  it("monthly insurance still derives annual premium", () => {
    const normalized = normalizeContractFormForSave(
      form({
        paymentFrequency: "monthly",
        premiumAmount: "413",
      }),
    );

    expect(normalized.premiumAmount).toBe("413");
    expect(normalized.premiumAnnual).toBe("4956.00");
  });
});
