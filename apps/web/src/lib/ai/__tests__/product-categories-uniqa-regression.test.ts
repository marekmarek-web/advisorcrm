import { describe, expect, it } from "vitest";
import { classifyProduct } from "../product-categories";

describe("product category classifier UNIQA regression", () => {
  it("classifies Život & radost as regular life insurance from combined signals", () => {
    const result = classifyProduct({
      providerName: "UNIQA pojišťovna, a.s.",
      productName: "Život & radost",
      segment: "life_insurance_proposal",
      paymentType: "regular",
    });

    expect(result.category).toBe("LIFE_INSURANCE_REGULAR");
    expect(result.subtypes).toContain("regular_payment");
    expect(result.needsHumanReview).toBe(false);
    expect(result.notes).not.toContain("Nepodařilo se odhadnout kategorii produktu z názvu ani ze segmentu.");
  });

  it("treats AI primary type life_insurance_proposal as a real classifier signal, not an unknown fallback", () => {
    const result = classifyProduct({
      providerName: "Libovolná pojišťovna",
      productName: "Flexi životní pojištění",
      segment: "life_insurance_proposal",
      paymentType: "regular",
    });

    expect(result.category).toBe("LIFE_INSURANCE_REGULAR");
    expect(result.needsHumanReview).toBe(false);
    expect(result.confidence).not.toBe("low");
    expect(result.notes).not.toContain("Nepodařilo se odhadnout kategorii produktu z názvu ani ze segmentu.");
  });

  it("classifies common AI document type hints across product segments", () => {
    expect(classifyProduct({ providerName: "Banka", productName: "Hypoteční úvěr", segment: "mortgage_contract" }).category).toBe("MORTGAGE");
    expect(classifyProduct({ providerName: "Leasing", productName: "Financování vozidla", segment: "leasing_contract" }).category).toBe("LEASING");
    expect(classifyProduct({ providerName: "Pojišťovna", productName: "Pojištění odpovědnosti", segment: "liability_insurance_contract" }).category).toBe("LIABILITY_INSURANCE");
  });
});
