/**
 * FÁZE 18 — FINAL FREEZE GATE: Desktop + Mobile AI Review
 *
 * Jediná must-pass sada pro release/freeze rozhodnutí AI Review feature.
 * Reuse-first: importuje existující logic z Fází 8–17.
 *
 * Anchor scénáře:
 *   C017 — Roman Koloburda UNIQA (ŽP final contract)
 *   C025 — ČSOB Leasing PBI (leasing / financing)
 *   C030 — IŽP Generali (investiční životní pojištění)
 *   C029 — Investiční smlouva Codya (DIP/investice)
 *   C022 — Výplatní lístek (supporting doc)
 *   C040 — Daňové přiznání s.r.o. (supporting doc)
 *
 * Struktura:
 *   A) Desktop AI Review — evidence display, apply policy, supporting guard
 *   B) Desktop client detail — contact completeness, pending/manual/confirmed identity
 *   C) Desktop contract detail — pending contract/payment, scope isolation
 *   D) Mobile ContractsReviewScreen — evidence parity, apply result, pending confirm
 *   E) Mobile ClientProfileScreen — provenance parity, confirmed/auto_applied
 *   F) Provenance parity — confirmed vs auto_applied bez raw enum
 *   G) Pending confirm safety — manual/do_not_apply nesmí dostat CTA
 *   H) Supporting docs end-to-end guard
 */

import { describe, it, expect } from "vitest";

// ── Importy z existujících modulů (reuse-first) ──────────────────────────────
import {
  mapApiToExtractionDocument,
  hasMeaningfulReviewContent,
} from "@/lib/ai-review/mappers";
import {
  deriveFieldApplyPolicy,
  summarizeApplyPolicies,
} from "@/lib/ai-review/field-apply-policy";
import {
  resolveAiProvenanceKind,
  contractSourceKindLabel,
} from "@/lib/portal/ai-review-provenance";
import {
  enforceField,
  isSupportingDocumentOnly,
  buildApplyEnforcementTrace,
  enforceContactPayload,
  enforceContractPayload,
  enforcePaymentPayload,
} from "@/lib/ai/apply-policy-enforcement";
import {
  resolveIdentityCompleteness,
} from "@/app/portal/contacts/[id]/contact-identity-completeness-logic";
import {
  resolveContractPendingFields,
  hasPendingContractFields,
} from "@/app/dashboard/contacts/[id]/contract-pending-fields-logic";

// ── Fixture builders ─────────────────────────────────────────────────────────

function makeEnvelope(
  primaryType: string,
  lifecycleStatus: string,
  fields: Record<string, { value?: unknown; status?: string; confidence?: number }> = {},
  outputMode?: string,
): Record<string, unknown> {
  return {
    documentClassification: {
      primaryType,
      lifecycleStatus,
      confidence: 0.9,
      outputMode: outputMode ?? (lifecycleStatus === "final_contract" ? "life_insurance_final_contract" : "reference_or_supporting_document"),
    },
    extractedFields: fields,
    publishHints: {
      contractPublishable: lifecycleStatus === "final_contract",
      sensitiveAttachmentOnly: false,
    },
  };
}

function makeField(status: "extracted" | "inferred" | "missing", value?: unknown) {
  return { value: value ?? (status === "missing" ? null : "testValue"), status };
}

function makeApiDetail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "rev-test",
    fileName: "smlouva.pdf",
    processingStatus: "extracted",
    reviewStatus: "pending",
    confidence: 0.87,
    createdAt: "2026-04-07T10:00:00Z",
    updatedAt: "2026-04-07T10:01:00Z",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// A) DESKTOP AI REVIEW — evidence display, apply policy, supporting guard
// ═══════════════════════════════════════════════════════════════════════════════

describe("A) Desktop AI Review — evidence display + apply policy", () => {
  it("A1: C017 UNIQA — mapApiToExtractionDocument produces groups with displayStatus/displaySource", () => {
    const detail = makeApiDetail({
      detectedDocumentType: "life_insurance",
      extractedPayload: makeEnvelope("life_insurance", "final_contract", {
        contractNumber: { value: "1234567890", status: "extracted", confidence: 0.95 },
        fullName: { value: "Roman Koloburda", status: "extracted", confidence: 0.92 },
        birthDate: { value: "1980-05-14", status: "inferred", confidence: 0.78 },
        insurer: { value: "UNIQA pojišťovna", status: "extracted", confidence: 0.98 },
      }, "life_insurance_final_contract"),
    });

    const doc = mapApiToExtractionDocument(detail, "");
    expect(doc.groups.length).toBeGreaterThan(0);
    const allFields = doc.groups.flatMap((g) => g.fields);

    // Každé pole musí mít label (ne raw klíč jako "contractNumber")
    const contractField = allFields.find((f) => f.id.includes("contractNumber"));
    expect(contractField).toBeDefined();
    expect(contractField!.label).not.toBe("contractNumber");
    expect(contractField!.label).toBe("Číslo smlouvy");

    // displayStatus musí být "Nalezeno" nebo "Odvozeno" — ne raw enum
    if (contractField!.displayStatus) {
      expect(["Nalezeno", "Odvozeno", "Chybí"]).toContain(contractField!.displayStatus);
    }

    // birthDate jako inferred → applyPolicy musí být prefill_confirm (ne auto_apply)
    const bdField = allFields.find((f) => f.id.includes("birthDate"));
    if (bdField) {
      expect(bdField.applyPolicy).not.toBe("auto_apply");
    }
  });

  it("A2: C022 výplatní lístek — supporting doc guard: žádné skupiny NEBO žádná auto_apply pole", () => {
    const detail = makeApiDetail({
      detectedDocumentType: "payslip",
      extractedPayload: makeEnvelope("payslip", "supporting_document", {
        employeeName: { value: "Jan Novák", status: "extracted", confidence: 0.9 },
        netWage: { value: "28000", status: "extracted", confidence: 0.88 },
        contractNumber: { value: "X123", status: "extracted", confidence: 0.7 },
      }, "reference_or_supporting_document"),
    });

    const doc = mapApiToExtractionDocument(detail, "");

    // Pokud má skupiny, contract-like pole nesmí mít auto_apply
    const contractField = doc.groups.flatMap((g) => g.fields).find((f) => f.id.includes("contractNumber"));
    if (contractField && contractField.applyPolicy) {
      expect(contractField.applyPolicy).not.toBe("auto_apply");
    }
  });

  it("A3: apply policy — do_not_apply pro supporting_document outputMode", () => {
    const decision = deriveFieldApplyPolicy("contractNumber", "Nalezeno", "reference_or_supporting_document");
    expect(decision.policy).toBe("do_not_apply");
    expect(decision.requiresConfirmation).toBe(false);
    expect(decision.label).toBe("Nepropíše se automaticky");
  });

  it("A4: apply policy — manual_required pro chybějící pole", () => {
    const decision = deriveFieldApplyPolicy("personalId", "Chybí", "life_insurance_final_contract");
    expect(decision.policy).toBe("manual_required");
    expect(decision.requiresConfirmation).toBe(true);
    expect(decision.label).toBe("Vyžaduje ruční doplnění");
  });

  it("A5: apply policy — prefill_confirm pro HIGH sensitivity Nalezeno pole", () => {
    const decision = deriveFieldApplyPolicy("contractNumber", "Nalezeno", "life_insurance_final_contract");
    expect(decision.policy).toBe("prefill_confirm");
    expect(decision.requiresConfirmation).toBe(true);
    expect(decision.label).toBe("Předvyplněno k potvrzení");
  });

  it("A6: apply policy — auto_apply pouze pro LOW sensitivity pole", () => {
    const decision = deriveFieldApplyPolicy("documentType", "Nalezeno", "life_insurance_final_contract");
    expect(decision.policy).toBe("auto_apply");
    expect(decision.requiresConfirmation).toBe(false);
    expect(decision.label).toBe("Propíše se automaticky");
  });

  it("A7: apply result summary — policyEnforcementTrace shape je správný", () => {
    const envelope = makeEnvelope("life_insurance", "final_contract", {
      fullName: makeField("extracted", "Roman Koloburda"),
      birthDate: makeField("inferred", "1980-05-14"),
      segment: makeField("extracted", "klient"),
      contractNumber: makeField("extracted", "1234567890"),
      insurer: makeField("extracted", "UNIQA"),
      iban: makeField("extracted", "CZ650800000000000000"),
      variableSymbol: makeField("extracted", "1234567890"),
      currency: makeField("extracted", "CZK"),
    }, "life_insurance_final_contract");

    // enforceContactPayload(contactPayload, extractedPayload)
    const contactResult = enforceContactPayload(
      { fullName: "Roman Koloburda", birthDate: "1980-05-14", segment: "klient" },
      envelope,
    );
    const contractResult = enforceContractPayload(
      { contractNumber: "1234567890", institutionName: "UNIQA" },
      envelope,
    );
    const paymentResult = enforcePaymentPayload(
      { iban: "CZ650800000000000000", variableSymbol: "1234567890", currency: "CZK" },
      envelope,
    );

    const trace = buildApplyEnforcementTrace(contactResult, contractResult, paymentResult, envelope);

    expect(typeof trace.summary.totalAutoApplied).toBe("number");
    expect(typeof trace.summary.totalPendingConfirmation).toBe("number");
    expect(typeof trace.summary.totalManualRequired).toBe("number");
    expect(typeof trace.summary.totalExcluded).toBe("number");
    expect(trace.supportingDocumentGuard).toBe(false);

    // HIGH sensitivity must NOT be in autoApplied (fullName, birthDate, contractNumber)
    expect(trace.contactEnforcement?.autoAppliedFields ?? []).not.toContain("fullName");
    expect(trace.contactEnforcement?.autoAppliedFields ?? []).not.toContain("birthDate");
    expect(trace.contractEnforcement?.autoAppliedFields ?? []).not.toContain("contractNumber");
  });

  it("A8: hasMeaningfulReviewContent — true pro extracted doc s poli", () => {
    const detail = makeApiDetail({
      extractedPayload: makeEnvelope("life_insurance", "final_contract", {
        contractNumber: makeField("extracted", "123"),
      }, "life_insurance_final_contract"),
    });
    const doc = mapApiToExtractionDocument(detail, "");
    expect(hasMeaningfulReviewContent(doc)).toBe(true);
  });

  it("A9: hasMeaningfulReviewContent — false pro bare uploaded stav", () => {
    const detail = makeApiDetail({
      processingStatus: "uploaded",
      extractedPayload: {},
    });
    const doc = mapApiToExtractionDocument(detail, "");
    expect(hasMeaningfulReviewContent(doc)).toBe(false);
  });

  it("A10: pending CTA visibility — isApplied=false pro pending reviewStatus", () => {
    const detail = makeApiDetail({ reviewStatus: "pending", processingStatus: "extracted" });
    const doc = mapApiToExtractionDocument(detail, "");
    expect(doc.isApplied).toBe(false);
    expect(doc.publishReadiness).toBe("partially_reviewed");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B) DESKTOP CLIENT DETAIL — contact completeness, pending/manual/confirmed
// ═══════════════════════════════════════════════════════════════════════════════

describe("B) Desktop client detail — contact completeness guard", () => {
  it("B1: C017 — birthDate pending_ai, personalId manual (kontaktní completeness guard)", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      { reviewId: "rev-c017", confirmedFields: [], autoAppliedFields: [], pendingFields: ["birthDate"] },
    );
    expect(result.find((r) => r.key === "birthDate")!.status).toBe("pending_ai");
    expect(result.find((r) => r.key === "personalId")!.status).toBe("manual");
  });

  it("B2: C030 IŽP Generali — oba identity pending → oba pending_ai", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      { reviewId: "rev-c030", confirmedFields: [], autoAppliedFields: [], pendingFields: ["birthDate", "personalId"] },
    );
    expect(result.find((r) => r.key === "birthDate")!.status).toBe("pending_ai");
    expect(result.find((r) => r.key === "personalId")!.status).toBe("pending_ai");
  });

  it("B3: C029 Codya — po confirmaci všechna pole confirmed → guard tichý", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: "1985-03-22", personalId: "850322/1234" },
      { reviewId: "rev-c029", confirmedFields: ["birthDate", "personalId"], autoAppliedFields: [], pendingFields: [] },
    );
    expect(result.every((r) => r.status === "ok")).toBe(true);
  });

  it("B4: C022/C040 supporting doc — pendingFields prázdné → žádné pending_ai CTA", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      { reviewId: "rev-c022", confirmedFields: [], autoAppliedFields: [], pendingFields: [] },
    );
    expect(result.every((r) => r.status === "manual")).toBe(true);
  });

  it("B5: po inline confirmu — potvrzené pole přejde z pending_ai do ok", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      { reviewId: "rev-001", confirmedFields: ["birthDate"], autoAppliedFields: [], pendingFields: ["personalId"] },
    );
    expect(result.find((r) => r.key === "birthDate")!.status).toBe("ok");
    expect(result.find((r) => r.key === "personalId")!.status).toBe("pending_ai");
  });

  it("B6: auto_applied pole → ok (zobrazí se jako confirmed provenance)", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      { reviewId: "rev-001", confirmedFields: [], autoAppliedFields: ["birthDate"], pendingFields: [] },
    );
    expect(result.find((r) => r.key === "birthDate")!.status).toBe("ok");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C) DESKTOP CONTRACT DETAIL — contract/payment scope, supporting guard
// ═══════════════════════════════════════════════════════════════════════════════

describe("C) Desktop contract detail — contract/payment pending fields", () => {
  it("C1: null provenance → prázdné (žádné CTA)", () => {
    expect(resolveContractPendingFields(null)).toHaveLength(0);
    expect(hasPendingContractFields(null)).toBe(false);
  });

  it("C2: C022/C040 supportingDocumentGuard=true → žádné CTA i když pending fields existují", () => {
    const result = resolveContractPendingFields({
      reviewId: "rev-c022",
      pendingContractFields: ["contractNumber", "insurer"],
      manualRequiredContractFields: [],
      pendingPaymentFields: ["bankAccount"],
      manualRequiredPaymentFields: [],
      supportingDocumentGuard: true,
    });
    expect(result).toHaveLength(0);
    expect(hasPendingContractFields({
      reviewId: "rev-c022",
      pendingContractFields: ["contractNumber"],
      manualRequiredContractFields: [],
      pendingPaymentFields: [],
      manualRequiredPaymentFields: [],
      supportingDocumentGuard: true,
    })).toBe(false);
  });

  it("C3: C017 UNIQA — contractNumber pending → scope=contract, pending_ai", () => {
    const result = resolveContractPendingFields({
      reviewId: "rev-c017",
      pendingContractFields: ["contractNumber"],
      manualRequiredContractFields: [],
      pendingPaymentFields: [],
      manualRequiredPaymentFields: [],
      supportingDocumentGuard: false,
    });
    const f = result.find((r) => r.key === "contractNumber");
    expect(f?.status).toBe("pending_ai");
    expect(f?.scope).toBe("contract");
    expect(f?.label).toBe("Číslo smlouvy");
  });

  it("C4: C025 ČSOB Leasing — loanAmount/installmentAmount pending → pending_ai contract scope", () => {
    const result = resolveContractPendingFields({
      reviewId: "rev-c025",
      pendingContractFields: ["loanAmount", "installmentAmount"],
      manualRequiredContractFields: [],
      pendingPaymentFields: [],
      manualRequiredPaymentFields: [],
      supportingDocumentGuard: false,
    });
    expect(result.find((r) => r.key === "loanAmount")?.status).toBe("pending_ai");
    expect(result.find((r) => r.key === "installmentAmount")?.status).toBe("pending_ai");
  });

  it("C5: C030 IŽP Generali — payment vs contract scope se neplete", () => {
    const result = resolveContractPendingFields({
      reviewId: "rev-c030",
      pendingContractFields: ["contractNumber"],
      manualRequiredContractFields: [],
      pendingPaymentFields: ["bankAccount", "variableSymbol"],
      manualRequiredPaymentFields: [],
      supportingDocumentGuard: false,
    });
    const contractFields = result.filter((r) => r.scope === "contract");
    const paymentFields = result.filter((r) => r.scope === "payment");
    expect(contractFields.map((r) => r.key)).toEqual(["contractNumber"]);
    expect(paymentFields.map((r) => r.key).sort()).toEqual(["bankAccount", "variableSymbol"].sort());
  });

  it("C6: manual pole nedostane pending_ai status", () => {
    const result = resolveContractPendingFields({
      reviewId: "rev-001",
      pendingContractFields: [],
      manualRequiredContractFields: ["contractNumber"],
      pendingPaymentFields: [],
      manualRequiredPaymentFields: [],
      supportingDocumentGuard: false,
    });
    expect(result.find((r) => r.key === "contractNumber")?.status).toBe("manual");
  });

  it("C7: pole v obou pending i manual → zobrazí se jen jako pending_ai, bez duplikátu", () => {
    const result = resolveContractPendingFields({
      reviewId: "rev-001",
      pendingContractFields: ["contractNumber"],
      manualRequiredContractFields: ["contractNumber"],
      pendingPaymentFields: [],
      manualRequiredPaymentFields: [],
      supportingDocumentGuard: false,
    });
    const matches = result.filter((r) => r.key === "contractNumber");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.status).toBe("pending_ai");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D) MOBILE ContractsReviewScreen — evidence parity, apply result, pending confirm
// ═══════════════════════════════════════════════════════════════════════════════

describe("D) Mobile ContractsReviewScreen — parity s desktopem", () => {
  it("D1: mobile mapApiToExtractionDocument vrací stejné skupiny jako desktop (parity)", () => {
    const detail = makeApiDetail({
      detectedDocumentType: "life_insurance",
      extractedPayload: makeEnvelope("life_insurance", "final_contract", {
        contractNumber: { value: "1234567890", status: "extracted", confidence: 0.95 },
        fullName: { value: "Roman Koloburda", status: "extracted", confidence: 0.92 },
        insurer: { value: "UNIQA", status: "extracted", confidence: 0.98 },
        iban: { value: "CZ650800000000000000", status: "extracted", confidence: 0.91 },
      }, "life_insurance_final_contract"),
    });

    // Mobile i desktop používá stejný mapApiToExtractionDocument
    const doc = mapApiToExtractionDocument(detail, "");
    expect(doc.groups.length).toBeGreaterThan(0);

    const allFields = doc.groups.flatMap((g) => g.fields);
    // displayStatus / displaySource jsou přítomné (parity s desktopem)
    const fieldsWithDisplayStatus = allFields.filter((f) => f.displayStatus !== undefined);
    expect(fieldsWithDisplayStatus.length).toBeGreaterThan(0);

    // applyPolicy je přítomné pro poles s extractedFields envelope
    const fieldsWithPolicy = allFields.filter((f) => f.applyPolicy !== undefined);
    expect(fieldsWithPolicy.length).toBeGreaterThan(0);
  });

  it("D2: mobile evidence display — žádné raw enum v displayStatus", () => {
    const detail = makeApiDetail({
      extractedPayload: makeEnvelope("life_insurance", "final_contract", {
        contractNumber: { value: "123", status: "extracted", confidence: 0.9 },
        birthDate: { value: "1980-01-01", status: "inferred", confidence: 0.7 },
      }, "life_insurance_final_contract"),
    });

    const doc = mapApiToExtractionDocument(detail, "");
    for (const f of doc.groups.flatMap((g) => g.fields)) {
      if (f.displayStatus !== undefined) {
        // Musí být friendy label, ne internal enum
        expect(["Nalezeno", "Odvozeno", "Chybí"]).toContain(f.displayStatus);
      }
      if (f.applyPolicyLabel !== undefined) {
        // Žádné raw enum jako "auto_apply", "prefill_confirm"
        expect(f.applyPolicyLabel).not.toMatch(/^(auto_apply|prefill_confirm|manual_required|do_not_apply)$/);
      }
    }
  });

  it("D3: C022 mobile supporting doc — policyEnforcementTrace.supportingDocumentGuard=true → výsledek zpracování (ne CRM zápis)", () => {
    const supportingEnvelope = makeEnvelope("payslip", "supporting_document", {
      employeeName: makeField("extracted", "Jan Novák"),
      contractNumber: makeField("extracted", "X123"),
      bankAccount: makeField("extracted", "1234567890/0800"),
    }, "reference_or_supporting_document");

    const contactResult = enforceContactPayload(
      { employeeName: "Jan Novák" },
      supportingEnvelope,
    );
    const contractResult = enforceContractPayload(
      { contractNumber: "X123" },
      supportingEnvelope,
    );
    const paymentResult = enforcePaymentPayload(
      { bankAccount: "1234567890/0800" },
      supportingEnvelope,
    );
    const trace = buildApplyEnforcementTrace(contactResult, contractResult, paymentResult, supportingEnvelope);
    expect(trace.supportingDocumentGuard).toBe(true);
    // Všechna pole excluded
    expect(trace.summary.totalAutoApplied).toBe(0);
    expect(trace.summary.totalExcluded).toBeGreaterThan(0);
  });

  it("D4: mobile apply result — parity summary shape odpovídá kontraktu z types.ts", () => {
    const envelope = makeEnvelope("life_insurance", "final_contract", {
      fullName: makeField("extracted", "Roman Koloburda"),
      segment: makeField("extracted", "klient"),
      contractNumber: makeField("extracted", "1234567890"),
      insurer: makeField("extracted", "UNIQA"),
      iban: makeField("extracted", "CZ65..."),
      currency: makeField("extracted", "CZK"),
    }, "life_insurance_final_contract");

    const contactResult = enforceContactPayload(
      { fullName: "Roman Koloburda", segment: "klient" },
      envelope,
    );
    const contractResult = enforceContractPayload(
      { contractNumber: "1234567890", institutionName: "UNIQA" },
      envelope,
    );
    const paymentResult = enforcePaymentPayload(
      { iban: "CZ65...", currency: "CZK" },
      envelope,
    );

    const trace = buildApplyEnforcementTrace(contactResult, contractResult, paymentResult, envelope);

    // Shape musí odpovídat ApplyResultPayload.policyEnforcementTrace z types.ts
    expect(trace).toMatchObject({
      supportingDocumentGuard: false,
      summary: {
        totalAutoApplied: expect.any(Number),
        totalPendingConfirmation: expect.any(Number),
        totalManualRequired: expect.any(Number),
        totalExcluded: expect.any(Number),
      },
    });
  });

  it("D5: mobile pending confirm — pendingConfirmationFields neobsahuje manual_required pole", () => {
    const result = enforceField("personalId", makeField("missing"), "life_insurance_final_contract", false);
    expect(result.policy).toBe("manual_required");
    expect(result.include).toBe(false);
    expect(result.leaveEmpty).toBe(true);

    // manual_required pole nesmí být v pendingConfirmation
    const envelope = makeEnvelope("life_insurance", "final_contract", {
      personalId: makeField("missing"),
    }, "life_insurance_final_contract");
    const contactResult = enforceContactPayload(
      { personalId: "missing-value" },
      envelope,
    );
    expect(contactResult.pendingConfirmationFields).not.toContain("personalId");
    // personalId je HIGH sensitivity s missing cell → manual_required
    expect(contactResult.manualRequiredFields).toContain("personalId");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E) MOBILE ClientProfileScreen — provenance parity
// ═══════════════════════════════════════════════════════════════════════════════

describe("E) Mobile ClientProfileScreen — provenance parity", () => {
  it("E1: confirmed field → resolveAiProvenanceKind vrací 'confirmed'", () => {
    const kind = resolveAiProvenanceKind("ai_review", new Date("2026-04-07"));
    expect(kind).toBe("confirmed");
  });

  it("E2: auto_applied field → resolveAiProvenanceKind vrací 'auto_applied'", () => {
    const kind = resolveAiProvenanceKind("ai_review", null);
    expect(kind).toBe("auto_applied");
  });

  it("E3: non-ai_review sourceKind → resolveAiProvenanceKind vrací null", () => {
    expect(resolveAiProvenanceKind("manual", new Date())).toBeNull();
    expect(resolveAiProvenanceKind("document", null)).toBeNull();
    expect(resolveAiProvenanceKind(null, null)).toBeNull();
  });

  it("E4: contractSourceKindLabel vrací friendly label bez raw enum", () => {
    expect(contractSourceKindLabel("ai_review")).toBe("AI kontrola");
    expect(contractSourceKindLabel("manual")).toBe("Ručně");
    expect(contractSourceKindLabel("document")).toBe("Dokument");
    expect(contractSourceKindLabel("import")).toBe("Import");
  });

  it("E5: C017 identity completeness — pending_ai po AI review, manual bez provenance", () => {
    const withPending = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      { reviewId: "rev-c017", confirmedFields: [], autoAppliedFields: [], pendingFields: ["birthDate"] },
    );
    expect(withPending.find((r) => r.key === "birthDate")!.status).toBe("pending_ai");

    const withoutProvenance = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      null,
    );
    expect(withoutProvenance.every((r) => r.status === "manual")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F) PROVENANCE PARITY — confirmed vs auto_applied
// ═══════════════════════════════════════════════════════════════════════════════

describe("F) Provenance parity — confirmed vs auto_applied", () => {
  it("F1: confirmed provenance badge — confirmed kind, ne auto_applied", () => {
    const advisorConfirmedAt = new Date("2026-04-07T14:00:00Z");
    expect(resolveAiProvenanceKind("ai_review", advisorConfirmedAt)).toBe("confirmed");
  });

  it("F2: auto_applied bez confirmace — auto_applied kind", () => {
    expect(resolveAiProvenanceKind("ai_review", undefined)).toBe("auto_applied");
  });

  it("F3: mapApiToExtractionDocument — isApplied=true pro reviewStatus=applied", () => {
    const detail = makeApiDetail({ reviewStatus: "applied" });
    const doc = mapApiToExtractionDocument(detail, "");
    expect(doc.isApplied).toBe(true);
    expect(doc.publishReadiness).toBe("published");
  });

  it("F4: applyPolicyLabel bez raw enum — pro všechny policies friendly label", () => {
    const policies = [
      { field: "documentType", status: "Nalezeno" as const, mode: "life_insurance_final_contract" },
      { field: "contractNumber", status: "Nalezeno" as const, mode: "life_insurance_final_contract" },
      { field: "personalId", status: "Chybí" as const, mode: "life_insurance_final_contract" },
      { field: "contractNumber", status: "Nalezeno" as const, mode: "reference_or_supporting_document" },
    ];

    const RAW_POLICY_ENUMS = ["auto_apply", "prefill_confirm", "manual_required", "do_not_apply"];

    for (const { field, status, mode } of policies) {
      const decision = deriveFieldApplyPolicy(field, status, mode);
      expect(RAW_POLICY_ENUMS).not.toContain(decision.label);
    }
  });

  it("F5: summarizeApplyPolicies vrací správné počty", () => {
    const fields = [
      { applyPolicy: "auto_apply" as const },
      { applyPolicy: "auto_apply" as const },
      { applyPolicy: "prefill_confirm" as const },
      { applyPolicy: "manual_required" as const },
      { applyPolicy: "do_not_apply" as const },
      { applyPolicy: "do_not_apply" as const },
    ];
    const summary = summarizeApplyPolicies(fields);
    expect(summary.autoApply).toBe(2);
    expect(summary.prefillConfirm).toBe(1);
    expect(summary.manualRequired).toBe(1);
    expect(summary.doNotApply).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G) PENDING CONFIRM SAFETY
// ═══════════════════════════════════════════════════════════════════════════════

describe("G) Pending confirm safety", () => {
  it("G1: manual_required pole nedostane confirm CTA (nesmí být v pendingConfirmationFields)", () => {
    const envelope = makeEnvelope("life_insurance", "final_contract", {
      fullName: makeField("missing"),
      birthDate: makeField("missing"),
    }, "life_insurance_final_contract");
    const result = enforceContactPayload(
      { fullName: "placeholder", birthDate: "placeholder" },
      envelope,
    );
    expect(result.pendingConfirmationFields).not.toContain("fullName");
    expect(result.pendingConfirmationFields).not.toContain("birthDate");
    expect(result.manualRequiredFields).toContain("fullName");
    expect(result.manualRequiredFields).toContain("birthDate");
  });

  it("G2: do_not_apply pole (supporting doc) nedostane confirm CTA ani autoApply", () => {
    const supportingEnvelope = makeEnvelope("payslip", "supporting_document", {
      contractNumber: makeField("extracted", "X123"),
    }, "reference_or_supporting_document");
    const result = enforceContractPayload(
      { contractNumber: "X123" },
      supportingEnvelope,
    );
    expect(result.pendingConfirmationFields).not.toContain("contractNumber");
    expect(result.autoAppliedFields).not.toContain("contractNumber");
    expect(result.excludedFields).toContain("contractNumber");
  });

  it("G3: supporting doc guard — nesmí generovat pending_ai contact CTA", () => {
    const contactResult = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      { reviewId: "rev-c022", confirmedFields: [], autoAppliedFields: [], pendingFields: [] },
    );
    // S prázdnými pendingFields musí být vše manual, ne pending_ai
    expect(contactResult.every((r) => r.status === "manual")).toBe(true);
  });

  it("G4: idempotentní confirm — pole které je v confirmedFields zůstane ok (no double processing)", () => {
    const result = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      { reviewId: "rev-001", confirmedFields: ["birthDate", "birthDate"], autoAppliedFields: [], pendingFields: [] },
    );
    // Duplikát v confirmedFields nesmí způsobit error nebo špatný stav
    const bd = result.find((r) => r.key === "birthDate");
    expect(bd?.status).toBe("ok");
  });

  it("G5: refresh po confirmu — confirmované pole zmizí z pending, přejde do ok", () => {
    const before = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      { reviewId: "rev-001", confirmedFields: [], autoAppliedFields: [], pendingFields: ["birthDate", "personalId"] },
    );
    expect(before.find((r) => r.key === "birthDate")!.status).toBe("pending_ai");

    const after = resolveIdentityCompleteness(
      { birthDate: null, personalId: null },
      { reviewId: "rev-001", confirmedFields: ["birthDate"], autoAppliedFields: [], pendingFields: ["personalId"] },
    );
    expect(after.find((r) => r.key === "birthDate")!.status).toBe("ok");
    expect(after.find((r) => r.key === "personalId")!.status).toBe("pending_ai");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H) SUPPORTING DOCS END-TO-END GUARD
// ═══════════════════════════════════════════════════════════════════════════════

describe("H) Supporting docs end-to-end guard", () => {
  it("H1: C022 výplatní lístek — isSupportingDocumentOnly=true", () => {
    expect(isSupportingDocumentOnly(makeEnvelope("payslip", "supporting_document", {}, "reference_or_supporting_document"))).toBe(true);
  });

  it("H2: C040 daňové přiznání s.r.o. — isSupportingDocumentOnly=true", () => {
    expect(isSupportingDocumentOnly(makeEnvelope("tax_return", "supporting_document", {}, "reference_or_supporting_document"))).toBe(true);
  });

  it("H3: C017 UNIQA ŽP final contract — isSupportingDocumentOnly=false", () => {
    expect(isSupportingDocumentOnly(makeEnvelope("life_insurance", "final_contract", {}, "life_insurance_final_contract"))).toBe(false);
  });

  it("H4: C030 IŽP Generali — isSupportingDocumentOnly=false", () => {
    expect(isSupportingDocumentOnly(makeEnvelope("investment_life_insurance", "final_contract", {}, "life_insurance_final_contract"))).toBe(false);
  });

  it("H5: C025 ČSOB Leasing PBI — isSupportingDocumentOnly=false", () => {
    expect(isSupportingDocumentOnly(makeEnvelope("leasing_contract", "final_contract", {}, "leasing_contract_final"))).toBe(false);
  });

  it("H6: supporting doc guard — enforceContractPayload vrací prázdný (jen excluded)", () => {
    const supportingEnvelope = makeEnvelope("payslip", "supporting_document", {
      contractNumber: makeField("extracted", "X123"),
      insurer: makeField("extracted", "Kooperativa"),
      startDate: makeField("extracted", "2026-01-01"),
    }, "reference_or_supporting_document");
    const result = enforceContractPayload(
      { contractNumber: "X123", institutionName: "Kooperativa", startDate: "2026-01-01" },
      supportingEnvelope,
    );
    expect(result.autoAppliedFields).toHaveLength(0);
    expect(result.pendingConfirmationFields).toHaveLength(0);
    expect(result.excludedFields.length).toBeGreaterThan(0);
  });

  it("H7: supporting doc guard — enforcePaymentPayload vrací prázdný (jen excluded)", () => {
    const supportingEnvelope = makeEnvelope("payslip", "supporting_document", {
      bankAccount: makeField("extracted", "1234567890/0800"),
      variableSymbol: makeField("extracted", "999111"),
    }, "reference_or_supporting_document");
    const result = enforcePaymentPayload(
      { bankAccount: "1234567890/0800", variableSymbol: "999111" },
      supportingEnvelope,
    );
    expect(result.autoAppliedFields).toHaveLength(0);
    expect(result.pendingConfirmationFields).toHaveLength(0);
    expect(result.excludedFields.length).toBeGreaterThan(0);
  });

  it("H8: contract/payment/contact scopes se nepletou pro supporting doc", () => {
    const payrollEnvelope = makeEnvelope("payslip", "supporting_document", {
      employeeName: makeField("extracted", "Jan Novák"),
      netWage: makeField("extracted", "28000"),
      contractNumber: makeField("extracted", "X123"),
      bankAccount: makeField("extracted", "1234/0800"),
    }, "reference_or_supporting_document");

    const contactResult = enforceContactPayload({ employeeName: "Jan Novák" }, payrollEnvelope);
    const contractResult = enforceContractPayload({ contractNumber: "X123" }, payrollEnvelope);
    const paymentResult = enforcePaymentPayload({ bankAccount: "1234/0800" }, payrollEnvelope);
    const trace = buildApplyEnforcementTrace(contactResult, contractResult, paymentResult, payrollEnvelope);

    expect(trace.supportingDocumentGuard).toBe(true);
    expect(trace.summary.totalAutoApplied).toBe(0);
    expect(trace.summary.totalPendingConfirmation).toBe(0);
    // Všechna pole excluded
    expect(trace.summary.totalExcluded).toBeGreaterThan(0);
  });
});
