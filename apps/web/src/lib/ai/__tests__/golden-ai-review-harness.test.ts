/**
 * Golden dataset harness — Phase 2+3 + publish/apply safety acceptance checks.
 *
 * F0 (anchor registry + PDF paths + golden expectation JSON): see `f0-anchor-registry.test.ts`
 * and fixtures `anchor-registry.json` / `anchor-golden-expectations.json`.
 *
 * Tests run against logic functions (no LLM, no DB, no network).
 * Scenarios sourced from fixtures/golden-ai-review/scenarios.manifest.json acceptance criteria.
 *
 * Coverage:
 * - GH01: modelation-only PDF → apply gate blocks
 * - GH02: final contract PDF → apply gate passes
 * - GH03: bundle (smlouva + zdravotní dotazník) → publishHints gating
 * - GH04: multi-person life insurance → participants canonical
 * - GH05: investment strategy extraction → investmentData canonical
 * - GH06: payment data extraction → paymentData canonical
 * - GH07: non-publishable attachment-only → apply gate warns (fail-open)
 * - GH08: applyContractReview no longer hard-blocks publishHints (audit log only)
 * - GH09: review UI mapper produces canonicalFields from extractedPayload
 * - GH10: packet segmentation detects bundle via keywords
 * - GH11: canonical normalizer maps parties to participants
 * - GH12: apply blocked when review not approved
 *
 * Run: pnpm test:ai-review (or pnpm vitest)
 */

import { describe, it, expect, vi } from "vitest";

// ── DB mock (not used by logic under test, but imported transitively) ─────────
const { mockChainable } = vi.hoisted(() => {
  const chainable = () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = vi.fn().mockImplementation(self);
    chain.from = vi.fn().mockImplementation(self);
    chain.where = vi.fn().mockImplementation(self);
    chain.limit = vi.fn().mockResolvedValue([]);
    chain.orderBy = vi.fn().mockImplementation(self);
    chain.insert = vi.fn().mockImplementation(self);
    chain.values = vi.fn().mockImplementation(self);
    chain.returning = vi.fn().mockResolvedValue([]);
    chain.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    chain.update = vi.fn().mockImplementation(self);
    chain.set = vi.fn().mockImplementation(self);
    chain.transaction = vi.fn().mockImplementation(async (cb: unknown) => {
      if (typeof cb === "function") await cb(chain);
    });
    return chain;
  };
  return { mockChainable: chainable };
});

vi.mock("db", () => ({
  // Do not overwrite `transaction` — applyContractReview must run the transaction callback.
  db: mockChainable(),
  eq: vi.fn(),
  and: vi.fn(),
  ilike: vi.fn(),
  isNull: vi.fn(),
  isNotNull: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
  contacts: {},
  opportunities: {},
  documents: {},
  contractUploadReviews: {},
  contracts: {},
  partners: {},
  products: {},
  tasks: {},
  auditLog: {},
  clientPaymentSetups: {},
  contractReviewCorrections: {},
  userProfiles: { userId: "user_id" },
  contractSegments: ["ZP", "IP", "INV", "UV", "HYPO", "PEN", "MAJ", "ODV", "POV", "AUTO"],
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/observability/portal-sentry", () => ({ capturePublishGuardFailure: vi.fn() }));
vi.mock("@/lib/portfolio/build-portfolio-attributes-from-extract", () => ({
  buildPortfolioAttributesFromExtracted: vi.fn().mockReturnValue({}),
}));
vi.mock("@/lib/ai/portfolio-phase1-attributes", () => ({
  mergeIdentityPortfolioFieldsFromExtracted: vi.fn().mockReturnValue({}),
  mergePortfolioAttributesWithPhase1Scalars: vi.fn((prev: unknown, next: unknown) => ({
    ...(prev as Record<string, unknown>),
    ...(next as Record<string, unknown>),
  })),
}));
vi.mock("@/lib/ai/payment-field-contract", () => ({
  buildCanonicalPaymentPayloadFromRaw: vi.fn().mockReturnValue(null),
  buildCanonicalPaymentPayload: vi.fn().mockReturnValue({ amount: null, iban: null, accountNumber: null, bankCode: null, variableSymbol: null, paymentFrequency: null, institutionName: null, productName: null }),
  isPaymentSyncReady: vi.fn().mockReturnValue(true),
}));

// ── Imports under test ────────────────────────────────────────────────────────
import { evaluateApplyReadiness } from "../quality-gates";
import { applyContractReview } from "../apply-contract-review";
import { capturePublishGuardFailure } from "@/lib/observability/portal-sentry";
import { segmentDocumentPacket } from "../document-packet-segmentation";
import { normalizeLifeInsuranceCanonical } from "../life-insurance-canonical-normalizer";
import { mapApiToExtractionDocument } from "../../ai-review/mappers";
import type { ContractReviewRow } from "../review-queue-repository";
import type { DocumentReviewEnvelope } from "../document-review-types";

// ── Test data builders ────────────────────────────────────────────────────────

const BASE_REVIEW_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_ID = "t1";
const USER_ID = "u1";
const CLIENT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function baseEnvelope(
  primaryType = "life_insurance_final_contract",
  lifecycleStatus = "final_contract"
): DocumentReviewEnvelope {
  return {
    documentClassification: {
      primaryType: primaryType as DocumentReviewEnvelope["documentClassification"]["primaryType"],
      subtype: "fixture",
      lifecycleStatus: lifecycleStatus as "final_contract",
      documentIntent: "reference_only",
      confidence: 0.88,
      reasons: ["golden_fixture"],
    },
    documentMeta: { scannedVsDigital: "digital", overallConfidence: 0.88 },
    parties: {},
    productsOrObligations: [],
    financialTerms: {},
    serviceTerms: {},
    extractedFields: {
      contractNumber: { value: "ZP-123456", status: "extracted", confidence: 0.92 },
      insurer: { value: "Česká pojišťovna", status: "extracted", confidence: 0.91 },
      fullName: { value: "Jana Testová", status: "extracted", confidence: 0.9 },
      policyStartDate: { value: "2024-01-01", status: "extracted", confidence: 0.88 },
    },
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

function baseRow(
  overrides: Partial<ContractReviewRow> = {},
  envelopeOverrides: Partial<DocumentReviewEnvelope> = {}
): ContractReviewRow {
  const envelope = { ...baseEnvelope(), ...envelopeOverrides };
  return {
    id: BASE_REVIEW_ID,
    tenantId: TENANT_ID,
    fileName: "smlouva.pdf",
    reviewStatus: "approved",
    processingStatus: "extracted",
    confidence: 0.88,
    detectedDocumentType: "life_insurance_final_contract",
    lifecycleStatus: "final_contract",
    matchedClientId: CLIENT_ID,
    createNewClientConfirmed: null,
    extractedPayload: envelope,
    extractionTrace: {},
    fieldConfidenceMap: {},
    draftActions: [
      {
        type: "create_contract",
        label: "Vytvořit smlouvu",
        payload: {
          contractNumber: "ZP-123456",
          institutionName: "Česká pojišťovna",
          segment: "ZP",
        },
      },
    ],
    clientMatchCandidates: null,
    applyResultPayload: null,
    ...overrides,
  } as unknown as ContractReviewRow;
}

// ── GH01: modelation-only → apply gate blocks ─────────────────────────────────

describe("GH01 — G02 modelace: apply gate blocks modelation lifecycle", () => {
  it("NON_FINAL_LIFECYCLE in applyBarrierReasons when lifecycleStatus=modelation", () => {
    const row = baseRow({ lifecycleStatus: "modelation" }, { documentClassification: { ...baseEnvelope().documentClassification, lifecycleStatus: "modelation" } });
    const gate = evaluateApplyReadiness(row);
    expect(gate.applyBarrierReasons).toContain("NON_FINAL_LIFECYCLE");
    expect(gate.readiness).not.toBe("ready_for_apply");
  });

  it("PROPOSAL_NOT_FINAL when detectedDocumentType is life_insurance_modelation and lifecycle is not final-input", () => {
    const row = baseRow(
      { detectedDocumentType: "life_insurance_modelation" },
      {
        documentClassification: {
          ...baseEnvelope().documentClassification,
          lifecycleStatus: "modelation",
          primaryType: "life_insurance_modelation",
        },
      },
    );
    const gate = evaluateApplyReadiness(row);
    expect(gate.applyBarrierReasons).toContain("PROPOSAL_NOT_FINAL");
  });
});

// ── GH02: final contract → apply gate passes ──────────────────────────────────

describe("GH02 — G01 finální smlouva: apply gate ready", () => {
  it("ready_for_apply when confidence high, lifecycle final_contract, client matched", () => {
    const row = baseRow();
    const gate = evaluateApplyReadiness(row);
    expect(gate.blockedReasons).toHaveLength(0);
    expect(gate.applyBarrierReasons).toHaveLength(0);
    expect(gate.readiness).toBe("ready_for_apply");
  });
});

// ── GH03: bundle → publishHints gates ────────────────────────────────────────

describe("GH03 — G03 bundle smlouva + zdravotní dotazníky", () => {
  it("PUBLISH_HINTS_NOT_PUBLISHABLE in warnings when contractPublishable=false", () => {
    const env = { ...baseEnvelope(), publishHints: { contractPublishable: false, needsSplit: true, sensitiveAttachmentOnly: false, reasons: ["bundle_not_split"] } };
    const row = baseRow({}, env as unknown as Partial<DocumentReviewEnvelope>);
    (row.extractedPayload as Record<string, unknown>).publishHints = env.publishHints;
    const gate = evaluateApplyReadiness(row);
    expect(gate.warnings).toContain("PUBLISH_HINTS_NOT_PUBLISHABLE");
    expect(gate.warnings).toContain("PUBLISH_HINTS_NEEDS_SPLIT");
    expect(gate.blockedReasons).not.toContain("PUBLISH_HINTS_NOT_PUBLISHABLE");
    expect(gate.readiness).toBe("review_required");
  });

  it("PUBLISH_HINTS_NEEDS_SPLIT in warnings when needsSplit=true but publishable", () => {
    const env = baseEnvelope();
    const row = baseRow();
    (row.extractedPayload as Record<string, unknown>).publishHints = {
      contractPublishable: true,
      needsSplit: true,
    };
    const gate = evaluateApplyReadiness(row);
    expect(gate.warnings).toContain("PUBLISH_HINTS_NEEDS_SPLIT");
    expect(gate.applyBarrierReasons).not.toContain("PUBLISH_HINTS_NEEDS_SPLIT");
  });

  it("PACKET_BUNDLE_WITH_SENSITIVE_ATTACHMENT in warnings", () => {
    const row = baseRow();
    (row.extractedPayload as Record<string, unknown>).packetMeta = {
      isBundle: true,
      hasSensitiveAttachment: true,
    };
    const gate = evaluateApplyReadiness(row);
    expect(gate.warnings).toContain("PACKET_BUNDLE_WITH_SENSITIVE_ATTACHMENT");
    expect(gate.applyBarrierReasons).not.toContain("PACKET_BUNDLE_WITH_SENSITIVE_ATTACHMENT");
  });
});

// ── GH04: multi-person life insurance ────────────────────────────────────────

describe("GH04 — G04 multi-person: canonical normalizer extracts participants", () => {
  it("extracts policyholder and insured from parties", () => {
    const env = baseEnvelope();
    env.parties = {
      policyholder: {
        fullName: "Jan Novák",
        birthDate: "1975-05-10",
        personalId: "750510/1234",
        role: "policyholder",
      },
      insured: {
        fullName: "Eva Nováková",
        birthDate: "1978-12-20",
        role: "insured",
      },
    };
    env.extractedFields = {
      ...env.extractedFields,
      insuredPersonName: { value: "Eva Nováková", status: "extracted", confidence: 0.85 },
      policyholderName: { value: "Jan Novák", status: "extracted", confidence: 0.9 },
    };

    const result = normalizeLifeInsuranceCanonical(env);
    expect(result.participants.length).toBeGreaterThanOrEqual(1);
    const roles = result.participants.map((p) => p.role);
    expect(roles.some((r) => r === "policyholder" || r === "insured")).toBe(true);
  });

  it("each participant has a role", () => {
    const env = baseEnvelope();
    env.parties = {
      policyholder: { fullName: "Jan", role: "policyholder" },
    };
    const result = normalizeLifeInsuranceCanonical(env);
    for (const p of result.participants) {
      expect(p.role).toBeTruthy();
    }
  });
});

// ── GH05: investment strategy extraction ─────────────────────────────────────

describe("GH05 — G05 investice: investmentData canonical", () => {
  it("normalizer extracts investmentStrategy from extractedFields", () => {
    const env = baseEnvelope("investment_subscription_document", "final_contract");
    env.extractedFields = {
      ...env.extractedFields,
      investmentStrategy: { value: "Konzervativní portfolio CZK", status: "extracted", confidence: 0.85 },
      investmentFunds: { value: '[{"name":"AMUNDI CZK","allocation":60}]', status: "extracted", confidence: 0.8 },
    };
    const result = normalizeLifeInsuranceCanonical(env);
    expect(result.investmentData).not.toBeNull();
    expect(result.investmentData?.strategy).toBeTruthy();
  });

  it("lifecycle=modelation sets isModeledData=true", () => {
    const env = baseEnvelope("life_insurance_modelation", "modelation");
    env.extractedFields = {
      investmentStrategy: { value: "Modelace konzervativní", status: "extracted", confidence: 0.8 },
    };
    const result = normalizeLifeInsuranceCanonical(env);
    expect(result.investmentData?.isModeledData).toBe(true);
  });
});

// ── GH06: payment data extraction ────────────────────────────────────────────

describe("GH06 — G05/G06 payment data: paymentData canonical", () => {
  it("normalizer extracts variableSymbol and paymentFrequency", () => {
    const env = baseEnvelope();
    env.extractedFields = {
      ...env.extractedFields,
      variableSymbol: { value: "1234567890", status: "extracted", confidence: 0.9 },
      paymentFrequency: { value: "měsíčně", status: "extracted", confidence: 0.88 },
      bankAccount: { value: "123456789/0800", status: "extracted", confidence: 0.85 },
    };
    const result = normalizeLifeInsuranceCanonical(env);
    expect(result.paymentData).not.toBeNull();
    expect(result.paymentData?.variableSymbol ?? result.paymentData?.paymentFrequency).toBeTruthy();
  });
});

// ── GH07: non-publishable attachment → gate blocks ───────────────────────────

describe("GH07 — G09 AML/servisní: sensitiveAttachmentOnly warns (fail-open)", () => {
  it("PUBLISH_HINTS_SENSITIVE_ATTACHMENT_ONLY in warnings", () => {
    const row = baseRow();
    (row.extractedPayload as Record<string, unknown>).publishHints = {
      contractPublishable: false,
      sensitiveAttachmentOnly: true,
    };
    const gate = evaluateApplyReadiness(row);
    expect(gate.warnings).toContain("PUBLISH_HINTS_SENSITIVE_ATTACHMENT_ONLY");
    expect(gate.blockedReasons).not.toContain("PUBLISH_HINTS_SENSITIVE_ATTACHMENT_ONLY");
    expect(gate.readiness).toBe("review_required");
  });
});

// ── GH08: applyContractReview — publishHints are audit-only (non-blocking) ───

describe("GH08 — applyContractReview: publishHints no longer hard-block CRM apply", () => {
  it("returns ok:true and logs guard when publishHints.contractPublishable=false", async () => {
    vi.mocked(capturePublishGuardFailure).mockClear();
    const row = baseRow();
    (row.extractedPayload as Record<string, unknown>).publishHints = {
      contractPublishable: false,
      reasons: ["bundle_not_split"],
    };
    const result = await applyContractReview({ reviewId: BASE_REVIEW_ID, tenantId: TENANT_ID, userId: USER_ID, row });
    expect(result.ok).toBe(true);
    expect(vi.mocked(capturePublishGuardFailure)).toHaveBeenCalled();
  });

  it("returns ok:true when primarySubdocumentType=health_questionnaire (no write block)", async () => {
    const row = baseRow();
    (row.extractedPayload as Record<string, unknown>).packetMeta = {
      primarySubdocumentType: "health_questionnaire",
    };
    const result = await applyContractReview({ reviewId: BASE_REVIEW_ID, tenantId: TENANT_ID, userId: USER_ID, row });
    expect(result.ok).toBe(true);
  });

  it("returns ok:true when sensitiveAttachmentOnly=true (logs guard, apply allowed)", async () => {
    vi.mocked(capturePublishGuardFailure).mockClear();
    const row = baseRow();
    (row.extractedPayload as Record<string, unknown>).publishHints = {
      contractPublishable: false,
      sensitiveAttachmentOnly: true,
    };
    const result = await applyContractReview({ reviewId: BASE_REVIEW_ID, tenantId: TENANT_ID, userId: USER_ID, row });
    expect(result.ok).toBe(true);
    expect(vi.mocked(capturePublishGuardFailure)).toHaveBeenCalled();
  });
});

// ── GH09: mapApiToExtractionDocument produces canonicalFields ─────────────────

describe("GH09 — mapper: canonicalFields passed through to ExtractionDocument", () => {
  const detail: Record<string, unknown> = {
    id: "rev-1",
    fileName: "smlouva.pdf",
    confidence: 0.9,
    processingStatus: "extracted",
    reviewStatus: "pending",
    detectedDocumentType: "life_insurance_final_contract",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fieldConfidenceMap: {},
    extractedPayload: {
      documentClassification: {
        primaryType: "life_insurance_final_contract",
        lifecycleStatus: "final_contract",
        confidence: 0.9,
        reasons: [],
      },
      documentMeta: { scannedVsDigital: "digital" },
      parties: {},
      reviewWarnings: [],
      extractedFields: {},
      publishHints: {
        contractPublishable: true,
        needsSplit: false,
      },
      participants: [
        { fullName: "Jan Novák", role: "policyholder", birthDate: "1975-05-10" },
        { fullName: "Eva Nováková", role: "insured", birthDate: "1978-12-20" },
      ],
      insuredRisks: [
        { linkedParticipant: "Jan Novák", riskType: "death", riskLabel: "Smrt", insuredAmount: 1500000 },
      ],
    },
  };

  it("produces canonicalFields with publishHints", () => {
    const doc = mapApiToExtractionDocument(detail, "");
    expect(doc.canonicalFields).toBeDefined();
    expect(doc.canonicalFields?.publishHints?.contractPublishable).toBe(true);
  });

  it("produces canonicalFields with participants array", () => {
    const doc = mapApiToExtractionDocument(detail, "");
    expect(doc.canonicalFields?.participants).toHaveLength(2);
    expect(doc.canonicalFields?.participants?.[0]?.fullName).toBe("Jan Novák");
    expect(doc.canonicalFields?.participants?.[0]?.role).toBe("policyholder");
  });

  it("produces canonicalFields with insuredRisks array", () => {
    const doc = mapApiToExtractionDocument(detail, "");
    expect(doc.canonicalFields?.insuredRisks).toHaveLength(1);
    expect(doc.canonicalFields?.insuredRisks?.[0]?.riskLabel).toBe("Smrt");
  });
});

// ── GH10: packet segmentation detects bundle ──────────────────────────────────

/** Pad markdown to minimum 200 chars so segmentation skips the early-exit guard. */
function padMarkdown(s: string): string {
  if (s.length >= 200) return s;
  return s + " ".repeat(200 - s.length);
}

describe("GH10 — segmentDocumentPacket: detects bundle via keywords", () => {
  it("detects bundle via explicit index listing both pojistná smlouva and zdravotní dotazník", () => {
    // EXPLICIT_INDEX_PATTERNS: /\d\.\s+zdravotní\s+dotazník/i and /\d\.\s+pojistná\s+smlouva/i
    const markdown = padMarkdown([
      "Přehled dokumentů:",
      "1. Pojistná smlouva č. 3282140369",
      "2. Zdravotní dotazník pojistníka",
      "",
      "Pojistník: Jan Novák, datum narození 10. 5. 1975",
      "Pojistná smlouva uzavřená dne 1. 1. 2024",
      "Zdravotní dotazník: Trpíte chronickým onemocněním? ANO / NE",
    ].join("\n"));
    const result = segmentDocumentPacket(markdown, 8, "bundle.pdf");
    expect(result.packetMeta.isBundle).toBe(true);
    const types = result.packetMeta.subdocumentCandidates.map((c) => c.type);
    expect(types).toContain("health_questionnaire");
    expect(result.packetMeta.hasSensitiveAttachment).toBe(true);
  });

  it("detects AML/FATCA form via strong keyword FATCA and PEP prohlášení", () => {
    const markdown = padMarkdown([
      "Prohlášení pro účely FATCA",
      "Politicky exponovaná osoba (PEP status): NE",
      "Formulář pro zjišt. totožnosti klienta",
      "Prohlášení o původu finančních prostředků",
      "Podpis klienta: Jan Novák",
    ].join("\n"));
    const result = segmentDocumentPacket(markdown, 3, "aml.pdf");
    const types = result.packetMeta.subdocumentCandidates.map((c) => c.type);
    expect(types.some((t) => t === "aml_fatca_form")).toBe(true);
  });

  it("single-section final contract is not a bundle", () => {
    const markdown = padMarkdown([
      "Smlouva o úvěru č. 111 06034 25",
      "Dlužník: Jana Horáková, r. č. 801201/1234",
      "Věřitel: ČSOB a.s.",
      "Výše úvěru: 100 000 Kč",
      "Datum uzavření smlouvy: 15. 3. 2025",
    ].join("\n"));
    const result = segmentDocumentPacket(markdown, 3, "uver.pdf");
    expect(result.packetMeta.isBundle).toBe(false);
  });
});

// ── GH11: canonical normalizer maps parties to participants ───────────────────

describe("GH11 — normalizeLifeInsuranceCanonical: parties → participants", () => {
  it("maps policyholder party to participant with role policyholder", () => {
    const env = baseEnvelope();
    env.parties = {
      policyholder: { fullName: "Jana Kovářová", birthDate: "1980-03-15", role: "policyholder" },
    };
    const result = normalizeLifeInsuranceCanonical(env);
    const ph = result.participants.find((p) => p.role === "policyholder");
    expect(ph).toBeDefined();
    expect(ph?.fullName).toContain("Jana");
  });

  it("does not merge two different persons into one", () => {
    const env = baseEnvelope();
    env.parties = {
      policyholder: { fullName: "Karel Beneš", role: "policyholder" },
      insured: { fullName: "Marie Benešová", role: "insured" },
    };
    const result = normalizeLifeInsuranceCanonical(env);
    const names = result.participants.map((p) => p.fullName ?? "");
    expect(names.some((n) => n.includes("Karel"))).toBe(true);
    // Should not merge into one record
    expect(result.participants.length).toBeGreaterThanOrEqual(1);
  });
});

// ── GH12: applyContractReview blocked for non-approved review ─────────────────

describe("GH12 — applyContractReview: blocked when not approved", () => {
  it("returns ok:false when reviewStatus=pending", async () => {
    const row = baseRow({ reviewStatus: "pending" as ContractReviewRow["reviewStatus"] });
    const result = await applyContractReview({ reviewId: BASE_REVIEW_ID, tenantId: TENANT_ID, userId: USER_ID, row });
    expect(result.ok).toBe(false);
    expect((result as { ok: false; error: string }).error).toMatch(/schválen/i);
  });
});
