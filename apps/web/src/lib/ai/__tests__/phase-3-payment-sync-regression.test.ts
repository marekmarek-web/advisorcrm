/**
 * Phase 3F regression: payment canonical contract, draft regeneration, advisor preview,
 * publish visibility bridge, dedicated payment instruction envelope.
 * Run: pnpm test:ai-review-phase3-regression
 */

import { describe, expect, it } from "vitest";
import type { DocumentReviewEnvelope } from "../document-review-types";
import {
  buildCanonicalPaymentPayload,
  buildCanonicalPaymentPayloadFromRaw,
  isPaymentSyncReady,
  hasPaymentTarget,
} from "../payment-field-contract";
import { resolvePaymentSetupClientVisibility } from "../payment-publish-bridge";
import { tryBuildPaymentSetupDraftFromRawPayload } from "../draft-actions";
import { buildPaymentInstructionEnvelope } from "../payment-instruction-extraction";
import { buildAdvisorReviewViewModel } from "../../ai-review/advisor-review-view-model";

function minimalEnvelope(
  lifecycle: DocumentReviewEnvelope["documentClassification"]["lifecycleStatus"],
  primary: DocumentReviewEnvelope["documentClassification"]["primaryType"] = "life_insurance_contract"
): DocumentReviewEnvelope {
  return {
    documentClassification: {
      primaryType: primary,
      subtype: "fixture",
      lifecycleStatus: lifecycle,
      documentIntent: "reference_only",
      confidence: 0.88,
      reasons: ["phase3_fixture"],
    },
    documentMeta: { scannedVsDigital: "digital", overallConfidence: 0.88 },
    parties: {},
    productsOrObligations: [],
    financialTerms: {},
    serviceTerms: {},
    extractedFields: {},
    evidence: [],
    candidateMatches: {
      matchedClients: [],
      matchedHouseholds: [],
      matchedDeals: [],
      matchedCompanies: [],
      matchedContracts: [],
      score: 0,
      reason: "no_match",
      ambiguityFlags: [],
    },
    sectionSensitivity: {},
    relationshipInference: {
      policyholderVsInsured: [],
      childInsured: [],
      intermediaryVsClient: [],
      employerVsEmployee: [],
      companyVsPerson: [],
      bankOrLenderVsBorrower: [],
    },
    reviewWarnings: [],
    suggestedActions: [],
    sensitivityProfile: "standard_personal_data",
    contentFlags: {
      isFinalContract: true,
      isProposalOnly: false,
      containsPaymentInstructions: false,
      containsClientData: false,
      containsAdvisorData: false,
      containsMultipleDocumentSections: false,
    },
  };
}

describe("Phase 3F — payment-publish-bridge visibility", () => {
  it("maps active → advisor_ready (post-approval CRM layer)", () => {
    expect(resolvePaymentSetupClientVisibility("active")).toBe("advisor_ready");
  });

  it("maps draft and review_required → draft_only (not client portal parity yet)", () => {
    expect(resolvePaymentSetupClientVisibility("draft")).toBe("draft_only");
    expect(resolvePaymentSetupClientVisibility("review_required")).toBe("draft_only");
  });

  it("maps archived → hidden", () => {
    expect(resolvePaymentSetupClientVisibility("archived")).toBe("hidden");
  });
});

describe("Phase 3F — canonical payment + sync readiness", () => {
  it("dedupes mistaken double bank suffix on domestic account (2727/2700/2700 → 2727/2700)", () => {
    const env = minimalEnvelope("final_contract");
    env.extractedFields = {
      regularAmount: { value: "900", status: "extracted", confidence: 0.9 },
      bankAccount: { value: "2727/2700/2700", status: "extracted", confidence: 0.88 },
      bankCode: { value: "2700", status: "extracted", confidence: 0.88 },
      currency: { value: "CZK", status: "extracted", confidence: 0.99 },
    };
    const cp = buildCanonicalPaymentPayload(env);
    expect(cp.accountNumber).toBe("2727/2700");
    expect(cp.bankCode).toBe("2700");
    const vm = buildAdvisorReviewViewModel({ envelope: env });
    expect(vm.paymentSyncPreview?.summary).not.toMatch(/2700\/2700\/2700/);
    expect(vm.paymentSyncPreview?.summary).toMatch(/2727\/2700/);
  });

  it("final contract with IBAN + amount + VS is sync-ready", () => {
    const env = minimalEnvelope("final_contract");
    env.extractedFields = {
      regularAmount: { value: "1500", status: "extracted", confidence: 0.9 },
      iban: { value: "CZ6508000000192000145399", status: "extracted", confidence: 0.92 },
      variableSymbol: { value: "888777", status: "extracted", confidence: 0.9 },
      currency: { value: "CZK", status: "extracted", confidence: 0.99 },
      paymentFrequency: { value: "měsíčně", status: "extracted", confidence: 0.85 },
      insurer: { value: "Test pojistovna", status: "extracted", confidence: 0.8 },
    };
    const cp = buildCanonicalPaymentPayload(env);
    expect(isPaymentSyncReady(cp)).toBe(true);
    expect(hasPaymentTarget(cp)).toBe(true);
  });

  it("domestic account + bank code counts as payment target", () => {
    const env = minimalEnvelope("final_contract");
    env.extractedFields = {
      regularAmount: { value: "900", status: "extracted", confidence: 0.9 },
      bankAccount: { value: "123456789", status: "extracted", confidence: 0.88 },
      bankCode: { value: "0800", status: "extracted", confidence: 0.88 },
      variableSymbol: { value: "111", status: "extracted", confidence: 0.9 },
      currency: { value: "CZK", status: "extracted", confidence: 0.99 },
    };
    expect(isPaymentSyncReady(buildCanonicalPaymentPayload(env))).toBe(true);
  });
});

describe("Phase 3F — draft regeneration from corrected raw payload (simulated advisor edit)", () => {
  it("reflects edited IBAN and VS in create_payment_setup payload", () => {
    const raw: Record<string, unknown> = {
      extractedFields: {
        regularAmount: { value: "2000" },
        iban: { value: "CZ1111111111111111111111" },
        variableSymbol: { value: "1111111111" },
        currency: { value: "CZK" },
        paymentFrequency: { value: "měsíčně" },
      },
    };
    const draft0 = tryBuildPaymentSetupDraftFromRawPayload(raw);
    expect(draft0?.type).toBe("create_payment_setup");
    expect((draft0?.payload as Record<string, string>).iban).toBe("CZ1111111111111111111111");

    (raw.extractedFields as Record<string, { value: string }>).iban = { value: "CZ9999999999999999999999" };
    (raw.extractedFields as Record<string, { value: string }>).variableSymbol = { value: "9876543210" };

    const draft1 = tryBuildPaymentSetupDraftFromRawPayload(raw);
    expect((draft1?.payload as Record<string, string>).iban).toBe("CZ9999999999999999999999");
    expect((draft1?.payload as Record<string, string>).variableSymbol).toBe("9876543210");
  });

  it("returns null when no payment slice in payload", () => {
    const raw: Record<string, unknown> = {
      extractedFields: {
        contractNumber: { value: "X-1" },
      },
    };
    expect(tryBuildPaymentSetupDraftFromRawPayload(raw)).toBeNull();
  });
});

describe("Phase 3F — advisor paymentSyncPreview (buildAdvisorReviewViewModel)", () => {
  it("modelation skips payment DB sync in preview", () => {
    const env = minimalEnvelope("modelation");
    env.extractedFields = {
      regularAmount: { value: "500", status: "extracted", confidence: 0.8 },
      iban: { value: "CZ6508000000192000145399", status: "extracted", confidence: 0.8 },
      variableSymbol: { value: "1", status: "extracted", confidence: 0.8 },
    };
    const vm = buildAdvisorReviewViewModel({ envelope: env });
    expect(vm.paymentSyncPreview?.status).toBe("skipped_modelation");
  });

  it("will_sync when amount + target + required symbols present", () => {
    const env = minimalEnvelope("final_contract");
    env.extractedFields = {
      regularAmount: { value: "1200", status: "extracted", confidence: 0.9 },
      iban: { value: "CZ6508000000192000145399", status: "extracted", confidence: 0.92 },
      variableSymbol: { value: "1234567890", status: "extracted", confidence: 0.9 },
      currency: { value: "CZK", status: "extracted", confidence: 0.99 },
      paymentFrequency: { value: "měsíčně", status: "extracted", confidence: 0.85 },
      insurer: { value: "ACME", status: "extracted", confidence: 0.8 },
      productName: { value: "ŽP", status: "extracted", confidence: 0.82 },
    };
    const vm = buildAdvisorReviewViewModel({ envelope: env });
    expect(vm.paymentSyncPreview?.status).toBe("will_sync");
    expect(vm.paymentSyncPreview?.summary).toMatch(/1200/);
  });

  it("paymentSyncPreview zobrazí datum první platby jako DD.MM.YYYY (ne ISO)", () => {
    const env = minimalEnvelope("final_contract");
    env.extractedFields = {
      regularAmount: { value: "1200", status: "extracted", confidence: 0.9 },
      iban: { value: "CZ6508000000192000145399", status: "extracted", confidence: 0.92 },
      variableSymbol: { value: "1234567890", status: "extracted", confidence: 0.9 },
      currency: { value: "CZK", status: "extracted", confidence: 0.99 },
      paymentFrequency: { value: "měsíčně", status: "extracted", confidence: 0.85 },
      insurer: { value: "ACME", status: "extracted", confidence: 0.8 },
      productName: { value: "ŽP", status: "extracted", confidence: 0.82 },
      firstPaymentDate: { value: "2026-02-01", status: "extracted", confidence: 0.9 },
    };
    const vm = buildAdvisorReviewViewModel({ envelope: env });
    expect(vm.paymentSyncPreview?.status).toBe("will_sync");
    const fp = vm.paymentSyncPreview?.presentFields.find((f) => f.label === "Datum první platby");
    expect(fp?.value).toBe("01.02.2026");
  });

  it("will_draft when IBAN present but amount missing", () => {
    const env = minimalEnvelope("final_contract");
    env.extractedFields = {
      iban: { value: "CZ6508000000192000145399", status: "extracted", confidence: 0.9 },
      variableSymbol: { value: "1", status: "extracted", confidence: 0.9 },
    };
    const vm = buildAdvisorReviewViewModel({ envelope: env });
    expect(vm.paymentSyncPreview?.status).toBe("will_draft");
  });
});

describe("Phase 3F — dedicated payment instruction envelope", () => {
  it("produces sync-ready canonical payload", () => {
    const env = buildPaymentInstructionEnvelope({
      extraction: {
        institutionName: "Kooperativa",
        productName: "Splatka",
        amount: "3 500,50",
        currency: "CZK",
        paymentFrequency: "měsíčně",
        iban: "CZ6508000000192000145399",
        variableSymbol: "9876543210",
        confidence: 0.91,
      },
      primaryType: "payment_instruction",
    });
    const cp = buildCanonicalPaymentPayload(env);
    expect(isPaymentSyncReady(cp)).toBe(true);
    const vm = buildAdvisorReviewViewModel({ envelope: env });
    expect(vm.paymentSyncPreview?.status).toBe("will_sync");
  });
});

describe("Phase 3F — buildCanonicalPaymentPayloadFromRaw parity", () => {
  it("matches envelope-derived canonical for same extractedFields", () => {
    const env = minimalEnvelope("final_contract");
    env.extractedFields = {
      premiumAmount: { value: "800", status: "extracted", confidence: 0.9 },
      iban: { value: "CZ6508000000192000145399", status: "extracted", confidence: 0.9 },
      variableSymbol: { value: "VS1", status: "extracted", confidence: 0.9 },
    };
    const fromEnv = buildCanonicalPaymentPayload(env);
    const fromRaw = buildCanonicalPaymentPayloadFromRaw({
      extractedFields: env.extractedFields as Record<string, { value: unknown }>,
    });
    expect(fromRaw).not.toBeNull();
    expect(fromRaw!.amount).toBe(fromEnv.amount);
    expect(fromRaw!.iban).toBe(fromEnv.iban);
    expect(fromRaw!.variableSymbol).toBe(fromEnv.variableSymbol);
  });
});
