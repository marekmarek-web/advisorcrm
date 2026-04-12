import { describe, expect, it } from "vitest";
import { parseContractWizardPrefillFromReviewData } from "../contact-wizard-prefill-from-ai-review";

describe("parseContractWizardPrefillFromReviewData", () => {
  it("maps create_contract draft action payload without setting partnerId/productId", () => {
    const out = parseContractWizardPrefillFromReviewData(null, [
      {
        type: "create_contract",
        payload: {
          segment: "ZP",
          institutionName: "Test Insurer",
          productName: "Životní pojistka",
          contractNumber: "123/2024",
          effectiveDate: "2024-01-15",
          premiumAmount: "1500",
        },
      },
    ]);
    expect(out.segment).toBe("ZP");
    expect(out.partnerName).toBe("Test Insurer");
    expect(out.productName).toBe("Životní pojistka");
    expect(out.contractNumber).toBe("123/2024");
    expect(out.startDate).toBeTruthy();
    expect(out.premiumAmount).toBe("1500");
    expect((out as { partnerId?: string }).partnerId).toBeUndefined();
    expect((out as { productId?: string }).productId).toBeUndefined();
  });

  it("fills from extractedFields when draft action is missing", () => {
    const out = parseContractWizardPrefillFromReviewData(
      {
        documentClassification: { primaryType: "nonlife_insurance_contract", subtype: "property" },
        extractedFields: {
          insurer: { value: "ACME" },
          productName: { value: "Majetek Plus" },
          contractNumber: { value: "X-1" },
        },
      },
      []
    );
    expect(out.partnerName).toBe("ACME");
    expect(out.productName).toBe("Majetek Plus");
    expect(out.contractNumber).toBe("X-1");
    expect(out.segment).toBe("MAJ");
  });
});
