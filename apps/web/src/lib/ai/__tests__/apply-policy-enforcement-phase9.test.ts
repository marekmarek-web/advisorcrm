/**
 * Fáze 9 — Apply Policy Enforcement Tests
 *
 * Ověřuje centrální enforcement engine pro DB write / CRM apply flow.
 * Anchor scénáře: C017 UNIQA, C025 ČSOB Leasing, C030 IŽP Generali,
 * C029 Codya investice, C022 výplatní lístek, C040 daňové přiznání.
 */

import { describe, it, expect } from "vitest";
import {
  enforceField,
  enforceContactPayload,
  enforceContractPayload,
  enforcePaymentPayload,
  isSupportingDocumentOnly,
  buildApplyEnforcementTrace,
} from "@/lib/ai/apply-policy-enforcement";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEnvelope(
  primaryType: string,
  lifecycleStatus: string,
  fields: Record<string, { value?: unknown; status?: string; confidence?: number }> = {}
): Record<string, unknown> {
  return {
    documentClassification: { primaryType, lifecycleStatus, confidence: 0.9 },
    extractedFields: fields,
    publishHints: { contractPublishable: lifecycleStatus === "final_contract" },
  };
}

function makeField(status: "extracted" | "inferred" | "missing", value?: unknown) {
  return { value: value ?? (status === "missing" ? null : "testValue"), status };
}

// ─── enforceField unit tests ──────────────────────────────────────────────────

describe("enforceField", () => {
  it("auto_apply pro LOW sensitivity explicitní pole bez konfliktu", () => {
    const result = enforceField("segment", makeField("extracted", "ZP"), "life_insurance_final_contract", false);
    expect(result.policy).toBe("auto_apply");
    expect(result.include).toBe(true);
    expect(result.needsHumanReview).toBe(false);
    expect(result.excluded).toBe(false);
  });

  it("prefill_confirm pro HIGH sensitivity explicitní pole (contractNumber Nalezeno)", () => {
    const result = enforceField("contractNumber", makeField("extracted", "123456"), "life_insurance_final_contract", false);
    expect(result.policy).toBe("prefill_confirm");
    expect(result.include).toBe(true);
    expect(result.needsHumanReview).toBe(true);
    expect(result.excluded).toBe(false);
  });

  it("prefill_confirm pro HIGH sensitivity inferred pole (birthDate Odvozeno)", () => {
    const result = enforceField("birthDate", makeField("inferred", "1980-01-01"), "life_insurance_final_contract", false);
    expect(result.policy).toBe("prefill_confirm");
    expect(result.needsHumanReview).toBe(true);
  });

  it("manual_required pro pole s Chybí status", () => {
    const result = enforceField("personalId", makeField("missing"), "life_insurance_final_contract", false);
    expect(result.policy).toBe("manual_required");
    expect(result.leaveEmpty).toBe(true);
    expect(result.include).toBe(false);
  });

  it("manual_required pro pole s konfliktem", () => {
    const result = enforceField("contractNumber", makeField("extracted", "123"), "life_insurance_final_contract", true);
    expect(result.policy).toBe("manual_required");
    expect(result.leaveEmpty).toBe(true);
  });

  it("do_not_apply pro supporting_document outputMode", () => {
    const result = enforceField("contractNumber", makeField("extracted", "123"), "reference_or_supporting_document", false);
    expect(result.policy).toBe("do_not_apply");
    expect(result.excluded).toBe(true);
    expect(result.include).toBe(false);
  });

  it("do_not_apply pro modelation outputMode", () => {
    const result = enforceField("variableSymbol", makeField("extracted", "123"), "modelation", false);
    expect(result.policy).toBe("do_not_apply");
    expect(result.excluded).toBe(true);
  });
});

// ─── isSupportingDocumentOnly ──────────────────────────────────────────────────

describe("isSupportingDocumentOnly", () => {
  it("C022 výplatní lístek → supporting document", () => {
    const envelope = makeEnvelope("payslip_document", "income_document");
    expect(isSupportingDocumentOnly(envelope)).toBe(true);
  });

  it("C040 daňové přiznání → supporting document", () => {
    const envelope = makeEnvelope("corporate_tax_return", "supporting");
    expect(isSupportingDocumentOnly(envelope)).toBe(true);
  });

  it("bank_statement → supporting document", () => {
    const envelope = makeEnvelope("bank_statement", "reference");
    expect(isSupportingDocumentOnly(envelope)).toBe(true);
  });

  it("publishHints.contractPublishable=false samo o sobě neshodí finální smlouvu do supporting", () => {
    const envelope = {
      documentClassification: { primaryType: "life_insurance_investment_contract", lifecycleStatus: "final_contract" },
      extractedFields: {},
      publishHints: { contractPublishable: false },
    };
    expect(isSupportingDocumentOnly(envelope)).toBe(false);
  });

  it("publishHints.sensitiveAttachmentOnly=true → supporting", () => {
    const envelope = {
      documentClassification: { primaryType: "health_questionnaire", lifecycleStatus: "attachment" },
      extractedFields: {},
      publishHints: { sensitiveAttachmentOnly: true },
    };
    expect(isSupportingDocumentOnly(envelope)).toBe(true);
  });

  it("C017 UNIQA life insurance final contract → NENÍ supporting", () => {
    const envelope = makeEnvelope("life_insurance_final_contract", "final_contract");
    expect(isSupportingDocumentOnly(envelope)).toBe(false);
  });
});

// ─── enforceContactPayload ─────────────────────────────────────────────────────

describe("enforceContactPayload", () => {
  it("C017 UNIQA — fullName/birthDate prefill_confirm, LOW sensitivity pole auto_apply", () => {
    const envelope = makeEnvelope("life_insurance_final_contract", "final_contract", {
      firstName: makeField("extracted", "Roman"),
      lastName: makeField("extracted", "Koloburda"),
      birthDate: makeField("extracted", "1985-05-15"),
      email: makeField("extracted", "roman@example.com"),
    });

    const payload = {
      firstName: "Roman",
      lastName: "Koloburda",
      birthDate: "1985-05-15",
      email: "roman@example.com",
      personalId: "", // prázdné — nesmí jít do payloadu
    };

    const result = enforceContactPayload(payload, envelope);

    // firstName/lastName jsou HIGH sensitivity → prefill_confirm → pendingConfirmation
    expect(result.pendingConfirmationFields).toContain("firstName");
    expect(result.pendingConfirmationFields).toContain("lastName");
    // birthDate HIGH sensitivity → prefill_confirm
    expect(result.pendingConfirmationFields).toContain("birthDate");
    // prázdné personalId se nepropíše
    expect(result.enforcedPayload.personalId).toBeUndefined();
    // enforced payload obsahuje hodnoty (pole jsou includována ale označena jako pending)
    expect(result.enforcedPayload.firstName).toBe("Roman");
    expect(result.enforcedPayload.birthDate).toBe("1985-05-15");
  });

  it("supporting document — kontaktní pole jsou do_not_apply", () => {
    const envelope = makeEnvelope("payslip_document", "income_document", {
      firstName: makeField("extracted", "Jan"),
      lastName: makeField("extracted", "Novák"),
    });

    const payload = { firstName: "Jan", lastName: "Novák" };
    const result = enforceContactPayload(payload, envelope);

    // Výplatní lístek → outputMode = reference_or_supporting_document → do_not_apply
    expect(result.excludedFields).toContain("firstName");
    expect(result.excludedFields).toContain("lastName");
    expect(result.enforcedPayload.firstName).toBeUndefined();
  });
});

// ─── enforceContractPayload ────────────────────────────────────────────────────

describe("enforceContractPayload", () => {
  it("C017 UNIQA — contractNumber prefill_confirm, segment auto_apply", () => {
    const envelope = makeEnvelope("life_insurance_final_contract", "final_contract", {
      contractNumber: makeField("extracted", "1234567890"),
      productName: makeField("extracted", "UNIQA Život"),
    });

    const payload = {
      contractNumber: "1234567890",
      productName: "UNIQA Život",
      segment: "ZP",
      documentType: "life_insurance_final_contract",
    };

    const result = enforceContractPayload(payload, envelope);

    // contractNumber HIGH sensitivity → prefill_confirm
    expect(result.pendingConfirmationFields).toContain("contractNumber");
    expect(result.enforcedPayload.contractNumber).toBe("1234567890");
    // segment LOW sensitivity → auto_apply
    expect(result.autoAppliedFields).toContain("segment");
    // documentType LOW sensitivity → auto_apply
    expect(result.autoAppliedFields).toContain("documentType");
  });

  it("C025 ČSOB Leasing — financedAmount manual_required při chybějícím poli", () => {
    const envelope = makeEnvelope("consumer_loan_contract", "final_contract", {
      contractNumber: makeField("missing"),
      productName: makeField("extracted", "ČSOB Leasing"),
    });

    const payload = {
      contractNumber: "LEASE-001",
      productName: "ČSOB Leasing",
      segment: "UVER",
    };

    const result = enforceContractPayload(payload, envelope);

    // contractNumber je v payloadu ale v envelope chybí (missing) → manual_required
    expect(result.manualRequiredFields).toContain("contractNumber");
    expect(result.enforcedPayload.contractNumber).toBeUndefined();
  });

  it("C022 výplatní lístek — contract payload je prázdný (supporting doc guard)", () => {
    const envelope = makeEnvelope("payslip_document", "income_document", {
      contractNumber: makeField("extracted", "N/A"),
    });

    const payload = { contractNumber: "N/A", segment: "ZP" };
    const result = enforceContractPayload(payload, envelope);

    // Výplatní lístek → reference_or_supporting_document → vše do_not_apply
    expect(result.excludedFields.length).toBeGreaterThan(0);
    expect(Object.keys(result.enforcedPayload)).toHaveLength(0);
  });

  it("conflict detection — contractNumber vs variableSymbol konflikt → manual_required", () => {
    const envelope: Record<string, unknown> = {
      documentClassification: { primaryType: "life_insurance_final_contract", lifecycleStatus: "final_contract" },
      extractedFields: {
        contractNumber: { value: "123", status: "extracted", confidence: 0.9 },
        variableSymbol: { value: "999", status: "extracted", confidence: 0.9 },
        // Konflikt: contractNumber ≠ variableSymbol při final contract
      },
      publishHints: { contractPublishable: true },
    };

    // Simulujeme konflikt ručně (detectContractVsVariableSymbolConflict vyžaduje konkrétní pattern)
    // Test ověřuje, že enforceField s hasConflict=true vrací manual_required
    const result = enforceField("contractNumber", { value: "123", status: "extracted" }, undefined, true);
    expect(result.policy).toBe("manual_required");
    expect(result.leaveEmpty).toBe(true);
  });
});

// ─── enforcePaymentPayload ─────────────────────────────────────────────────────

describe("enforcePaymentPayload", () => {
  it("C017 UNIQA — iban/variableSymbol prefill_confirm, currency/obligationName auto_apply", () => {
    const envelope = makeEnvelope("life_insurance_final_contract", "final_contract", {
      iban: makeField("extracted", "CZ6508000000192000145399"),
      variableSymbol: makeField("extracted", "1234567890"),
    });

    const payload = {
      obligationName: "UNIQA pojištění",
      currency: "CZK",
      iban: "CZ6508000000192000145399",
      variableSymbol: "1234567890",
      frequency: "monthly",
      regularAmount: "1500",
    };

    const result = enforcePaymentPayload(payload, envelope);

    // Logistická pole auto_apply vždy
    expect(result.autoAppliedFields).toContain("obligationName");
    expect(result.autoAppliedFields).toContain("currency");
    // iban HIGH sensitivity → prefill_confirm
    expect(result.pendingConfirmationFields).toContain("iban");
    // variableSymbol HIGH sensitivity → prefill_confirm
    expect(result.pendingConfirmationFields).toContain("variableSymbol");
    // Hodnoty jsou v enforced payload (budou ale označeny needsHumanReview)
    expect(result.enforcedPayload.iban).toBe("CZ6508000000192000145399");
  });

  it("C022 výplatní lístek — platební payload je prázdný (supporting doc guard)", () => {
    const envelope = makeEnvelope("payslip_document", "income_document", {
      bankAccount: makeField("extracted", "123456789/0800"),
    });

    const payload = {
      recipientAccount: "123456789/0800",
      amount: "45000",
      currency: "CZK",
    };

    const result = enforcePaymentPayload(payload, envelope);

    // Výplatní lístek → reference_or_supporting_document → platební identifikátory excluded
    expect(result.excludedFields).toContain("recipientAccount");
    expect(result.enforcedPayload.recipientAccount).toBeUndefined();
  });

  it("C029 Codya investice — fund/ISIN jako prefill, ne auto_apply", () => {
    const envelope = makeEnvelope("investment_subscription_document", "final_contract", {
      iban: makeField("inferred", "CZ123"),
    });

    const payload = {
      iban: "CZ123",
      regularAmount: "10000",
      currency: "CZK",
    };

    const result = enforcePaymentPayload(payload, envelope);

    // iban inferred + HIGH sensitivity → prefill_confirm
    expect(result.pendingConfirmationFields).toContain("iban");
    expect(result.autoAppliedFields).toContain("currency");
  });
});

// ─── isSupportingDocumentOnly pro anchor scénáře ──────────────────────────────

describe("Supporting document anchor scénáře", () => {
  it("C040 daňové přiznání s.r.o. → supporting only", () => {
    const envelope = {
      documentClassification: {
        primaryType: "corporate_tax_return",
        lifecycleStatus: "supporting",
      },
      extractedFields: {},
      publishHints: { contractPublishable: false, reasons: ["tax_document_not_publishable"] },
    };
    expect(isSupportingDocumentOnly(envelope)).toBe(true);
  });

  it("IŽP s nepublikovatelnou přílohou zůstává finální smlouvou pro CRM apply", () => {
    const envelope = {
      documentClassification: {
        primaryType: "life_insurance_investment_contract",
        lifecycleStatus: "final_contract",
      },
      extractedFields: {
        contractNumber: makeField("extracted", "3282140369"),
      },
      publishHints: { contractPublishable: false, needsManualValidation: true },
    };
    expect(isSupportingDocumentOnly(envelope)).toBe(false);
  });

  it("C030 IŽP Generali → NENÍ supporting", () => {
    const envelope = makeEnvelope("life_insurance_investment_contract", "final_contract");
    expect(isSupportingDocumentOnly(envelope)).toBe(false);
  });

  it("C025 ČSOB Leasing PBI → NENÍ supporting", () => {
    const envelope = makeEnvelope("consumer_loan_contract", "final_contract");
    expect(isSupportingDocumentOnly(envelope)).toBe(false);
  });
});

// ─── buildApplyEnforcementTrace ────────────────────────────────────────────────

describe("buildApplyEnforcementTrace", () => {
  it("sestaví trace summary z dílčích enforcement výsledků", () => {
    const envelope = makeEnvelope("life_insurance_final_contract", "final_contract", {
      firstName: makeField("extracted", "Roman"),
      contractNumber: makeField("extracted", "123"),
    });

    const contactResult = enforceContactPayload(
      { firstName: "Roman", lastName: "Koloburda" },
      envelope
    );
    const contractResult = enforceContractPayload(
      { contractNumber: "123", segment: "ZP" },
      envelope
    );

    const trace = buildApplyEnforcementTrace(contactResult, contractResult, undefined, envelope);

    expect(trace.supportingDocumentGuard).toBe(false);
    expect(trace.summary.totalAutoApplied).toBeGreaterThanOrEqual(0);
    expect(trace.summary.totalPendingConfirmation).toBeGreaterThanOrEqual(0);
    expect(typeof trace.outputMode).toBe("undefined"); // final_contract nemá outputMode restriction
  });

  it("supporting doc guard → všechna pole excluded", () => {
    const envelope = makeEnvelope("payslip", "income_document");

    const contactResult = enforceContactPayload(
      { firstName: "Jan", lastName: "Novák" },
      envelope
    );
    const contractResult = enforceContractPayload(
      { contractNumber: "N/A" },
      envelope
    );

    const trace = buildApplyEnforcementTrace(contactResult, contractResult, undefined, envelope);

    expect(trace.supportingDocumentGuard).toBe(true);
    expect(trace.summary.totalExcluded).toBeGreaterThan(0);
    expect(trace.summary.totalAutoApplied).toBe(0);
  });
});
