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
import { buildAllDraftActions } from "../draft-actions";

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

describe("FUNDOO RYTMUS pravidelná investice — summary nesmí ukázat totál jako měsíční", () => {
  // Reprodukce reálného bugu: 3 000 Kč/měs × 12 × 16 let = 576 000 Kč (intendedInvestment).
  // Dřív summary ukázal „576 000 CZK (měsíčně)" místo „3 000 CZK (měsíčně)".
  it("vybere investmentPremium (3 000) místo intendedInvestment (576 000) v Platby řádku", () => {
    const env = minimalEnvelope("final_contract", "investment_subscription_document");
    env.extractedFields = {
      investmentPremium: { value: "3 000", status: "extracted", confidence: 0.92 },
      intendedInvestment: { value: "576 000", status: "extracted", confidence: 0.9 },
      paymentFrequency: { value: "měsíčně", status: "extracted", confidence: 0.95 },
      iban: { value: "CZ9727000000001387691786", status: "extracted", confidence: 0.92 },
      variableSymbol: { value: "7023398569", status: "extracted", confidence: 0.9 },
      currency: { value: "CZK", status: "extracted", confidence: 0.99 },
      institutionName: { value: "AMUNDI", status: "extracted", confidence: 0.9 },
      productName: { value: "AMUNDI PLATFORMA Pravidelné investování RYTMUS FUNDOO", status: "extracted", confidence: 0.9 },
    };
    const vm = buildAdvisorReviewViewModel({ envelope: env });
    expect(vm.payments).toMatch(/3\s?000.*měsíčně/);
    expect(vm.payments).not.toMatch(/576\s?000.*měsíčně/);
  });

  it("fallback na contributionAmount když investmentPremium chybí", () => {
    const env = minimalEnvelope("final_contract", "investment_subscription_document");
    env.extractedFields = {
      contributionAmount: { value: "3 000", status: "extracted", confidence: 0.9 },
      intendedInvestment: { value: "576 000", status: "extracted", confidence: 0.9 },
      paymentFrequency: { value: "měsíčně", status: "extracted", confidence: 0.95 },
      iban: { value: "CZ9727000000001387691786", status: "extracted", confidence: 0.9 },
      variableSymbol: { value: "7023398569", status: "extracted", confidence: 0.9 },
      currency: { value: "CZK", status: "extracted", confidence: 0.99 },
    };
    const cp = buildCanonicalPaymentPayload(env);
    expect(cp.amount).toMatch(/3\s?000/);
    expect(cp.amount).not.toMatch(/576\s?000/);
  });

  it("když reálná splátka zcela chybí, NESMÍ se intendedInvestment propsat jako měsíční částka", () => {
    const env = minimalEnvelope("final_contract", "investment_subscription_document");
    env.extractedFields = {
      intendedInvestment: { value: "576 000", status: "extracted", confidence: 0.9 },
      paymentFrequency: { value: "měsíčně", status: "extracted", confidence: 0.95 },
      iban: { value: "CZ9727000000001387691786", status: "extracted", confidence: 0.9 },
      variableSymbol: { value: "7023398569", status: "extracted", confidence: 0.9 },
      currency: { value: "CZK", status: "extracted", confidence: 0.99 },
    };
    const cp = buildCanonicalPaymentPayload(env);
    expect(cp.amount).not.toMatch(/576\s?000/);
  });

  it("jednorázová investice: intendedInvestment SMÍ být použit (to je skutečná jistina)", () => {
    const env = minimalEnvelope("final_contract", "investment_subscription_document");
    env.extractedFields = {
      intendedInvestment: { value: "1 000 000", status: "extracted", confidence: 0.95 },
      paymentFrequency: { value: "jednorázově", status: "extracted", confidence: 0.95 },
      iban: { value: "CZ9727000000001387691786", status: "extracted", confidence: 0.9 },
      variableSymbol: { value: "7023398569", status: "extracted", confidence: 0.9 },
      currency: { value: "CZK", status: "extracted", confidence: 0.99 },
    };
    const cp = buildCanonicalPaymentPayload(env);
    expect(cp.amount).toMatch(/1\s?000\s?000/);
  });
});

describe("Návrh pojistné smlouvy (proposal) — platební draft MUSÍ vzniknout", () => {
  // Reál reportovaný uživatelem: ČSOB Pojišťovna "NAŠE ODPOVĚDNOST",
  // č. 6200253364, 4 959 Kč ročně, VS 6200253364, účet 187078376/0300.
  // Bug: life_insurance_proposal.suggestedActionRules neměl create_payment_setup
  // → draft se nevygeneroval → po schválení se do client_payment_setups nic
  // nezapsalo. Po opravě musí být draft přítomen i u proposal lifecycle.
  it("life_insurance_proposal s VS + účtem + kódem banky + ročním pojistným generuje create_payment_setup draft", () => {
    const env = minimalEnvelope("proposal", "life_insurance_proposal");
    env.contentFlags = {
      ...env.contentFlags,
      // Úmyslně simulujeme, že model flag NENASTAVIL (reálný případ, který to
      // rozbil) — deterministický fix ve schema registry to musí zachytit.
      containsPaymentInstructions: false,
      isFinalContract: false,
      isProposalOnly: true,
    };
    env.extractedFields = {
      insurer: { value: "ČSOB Pojišťovna, a. s., člen holdingu ČSOB", status: "extracted", confidence: 0.95 },
      productName: { value: "NAŠE ODPOVĚDNOST", status: "extracted", confidence: 0.9 },
      proposalNumber: { value: "6200253364", status: "extracted", confidence: 0.95 },
      contractNumber: { value: "6200253364", status: "extracted", confidence: 0.95 },
      annualPremium: { value: "4 959", status: "extracted", confidence: 0.9 },
      paymentFrequency: { value: "ročně", status: "extracted", confidence: 0.95 },
      variableSymbol: { value: "6200253364", status: "extracted", confidence: 0.95 },
      recipientAccount: { value: "187078376", status: "extracted", confidence: 0.9 },
      bankCode: { value: "0300", status: "extracted", confidence: 0.95 },
      currency: { value: "CZK", status: "extracted", confidence: 0.99 },
    };
    const drafts = buildAllDraftActions(env);
    const payment = drafts.find((d) => d.type === "create_payment_setup");
    expect(payment, "create_payment_setup draft musí být součástí návrhu akcí u návrhu pojistné smlouvy").toBeDefined();
    expect(payment!.payload.variableSymbol).toBe("6200253364");
    expect(payment!.payload.bankCode).toBe("0300");
    expect(String(payment!.payload.regularAmount)).toMatch(/4\s?959/);
  });

  it("liability_insurance_offer s platebními údaji generuje create_payment_setup draft", () => {
    const env = minimalEnvelope("offer", "liability_insurance_offer");
    env.contentFlags = {
      ...env.contentFlags,
      containsPaymentInstructions: false,
      isFinalContract: false,
      isProposalOnly: true,
    };
    env.extractedFields = {
      insurer: { value: "ČSOB Pojišťovna", status: "extracted", confidence: 0.9 },
      offerType: { value: "odpovědnost", status: "extracted", confidence: 0.9 },
      productArea: { value: "liability", status: "extracted", confidence: 0.9 },
      annualPremium: { value: "4 959", status: "extracted", confidence: 0.9 },
      paymentFrequency: { value: "ročně", status: "extracted", confidence: 0.95 },
      variableSymbol: { value: "6200253364", status: "extracted", confidence: 0.95 },
      recipientAccount: { value: "187078376", status: "extracted", confidence: 0.9 },
      bankCode: { value: "0300", status: "extracted", confidence: 0.95 },
      currency: { value: "CZK", status: "extracted", confidence: 0.99 },
    };
    const drafts = buildAllDraftActions(env);
    const payment = drafts.find((d) => d.type === "create_payment_setup");
    expect(payment).toBeDefined();
    expect(payment!.payload.variableSymbol).toBe("6200253364");
  });

  it("safety-net fallback: i pro life_insurance_contract lifecycle=final_contract bez containsPaymentInstructions flag doplní draft, pokud jsou tvrdá pole přítomna", () => {
    // U některých typů schema create_payment_setup v pravidlech nemá (např.
    // life_insurance_contract) a model zároveň neoznačí contentFlag — fallback
    // v buildAllDraftActions tohle podchytí, protože lifecycle=final_contract
    // a payment payload je sync-ready.
    const env = minimalEnvelope("final_contract", "life_insurance_contract");
    env.contentFlags = {
      ...env.contentFlags,
      containsPaymentInstructions: false,
    };
    env.extractedFields = {
      insurer: { value: "Generali", status: "extracted", confidence: 0.9 },
      productName: { value: "Bel Mondo", status: "extracted", confidence: 0.9 },
      contractNumber: { value: "123", status: "extracted", confidence: 0.9 },
      totalMonthlyPremium: { value: "1 500", status: "extracted", confidence: 0.9 },
      paymentFrequency: { value: "měsíčně", status: "extracted", confidence: 0.95 },
      iban: { value: "CZ6508000000192000145399", status: "extracted", confidence: 0.9 },
      variableSymbol: { value: "123", status: "extracted", confidence: 0.9 },
      currency: { value: "CZK", status: "extracted", confidence: 0.99 },
    };
    const drafts = buildAllDraftActions(env);
    const payment = drafts.find((d) => d.type === "create_payment_setup");
    expect(payment, "Safety-net: lifecycle=final_contract s kompletními platebními údaji NESMÍ přijít o payment draft").toBeDefined();
  });

  it("modelace NESMÍ vygenerovat draft ani když má kompletní platební pole (apply flow by to stejně zablokoval, ale držíme vrstvenou obranu)", () => {
    const env = minimalEnvelope("modelation", "investment_modelation");
    env.contentFlags = {
      ...env.contentFlags,
      containsPaymentInstructions: true,
      paymentInformationalOnly: true,
    };
    env.extractedFields = {
      productName: { value: "Modelace", status: "extracted", confidence: 0.9 },
      totalMonthlyPremium: { value: "3 000", status: "extracted", confidence: 0.9 },
      paymentFrequency: { value: "měsíčně", status: "extracted", confidence: 0.95 },
      iban: { value: "CZ6508000000192000145399", status: "extracted", confidence: 0.9 },
      variableSymbol: { value: "123", status: "extracted", confidence: 0.9 },
      currency: { value: "CZK", status: "extracted", confidence: 0.99 },
    };
    const drafts = buildAllDraftActions(env);
    const payment = drafts.find((d) => d.type === "create_payment_setup");
    expect(payment, "Modelace nesmí generovat payment draft").toBeUndefined();
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
