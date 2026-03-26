import { describe, it, expect } from "vitest";
import { resolveAiReviewExtractionRoute } from "../ai-review-extraction-router";

function withEnv(updates: Record<string, string | undefined>, fn: () => void) {
  const keys = Object.keys(updates);
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    const v = updates[k];
    if (v === undefined || v === "") delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k]!;
    }
  }
}

const base = {
  documentType: "contract",
  productFamily: "life_insurance",
  productSubtype: "risk_life_insurance",
  businessIntent: "standard",
  recommendedRoute: "extract",
  confidence: 0.9,
};

describe("resolveAiReviewExtractionRoute", () => {
  it("§8 always routes payment_instructions to payment extraction regardless of family", () => {
    const r = resolveAiReviewExtractionRoute({
      ...base,
      documentType: "payment_instructions",
      productFamily: "mortgage",
      productSubtype: "mortgage_loan",
    });
    expect(r).toMatchObject({
      outcome: "extract",
      promptKey: "paymentInstructionsExtraction",
      reasonCodes: ["payment_invariant"],
    });
  });

  it("routes life insurance contract to insurance contract extraction", () => {
    const r = resolveAiReviewExtractionRoute(base);
    expect(r).toMatchObject({
      outcome: "extract",
      promptKey: "insuranceContractExtraction",
      reasonCodes: ["life_contract"],
    });
  });

  it("manual_review when confidence is below AI_REVIEW_CLASSIFIER_CONFIDENCE_MIN", () => {
    withEnv({ AI_REVIEW_CLASSIFIER_CONFIDENCE_MIN: "0.9" }, () => {
      const r = resolveAiReviewExtractionRoute({ ...base, confidence: 0.2 });
      expect(r).toEqual({ outcome: "manual_review", reasonCodes: ["low_classifier_confidence"] });
    });
  });

  it("manual_review on triple unknown", () => {
    const r = resolveAiReviewExtractionRoute({
      ...base,
      documentType: "unknown",
      productFamily: "unknown",
      productSubtype: "unknown",
    });
    expect(r).toEqual({ outcome: "manual_review", reasonCodes: ["triple_unknown"] });
  });

  it("review_required when document type uncertain with known family", () => {
    const r = resolveAiReviewExtractionRoute({
      ...base,
      documentType: "unknown",
      documentTypeUncertain: true,
    });
    expect(r).toEqual({
      outcome: "review_required",
      reasonCodes: ["document_type_uncertain_with_known_family"],
    });
  });

  it("non-life car amendment below amendment threshold → review_required", () => {
    withEnv({ AI_REVIEW_AMENDMENT_CONFIDENCE_MIN: "0.8" }, () => {
      const r = resolveAiReviewExtractionRoute({
        ...base,
        documentType: "amendment",
        productFamily: "non_life_insurance",
        productSubtype: "car_insurance",
        confidence: 0.5,
      });
      expect(r).toEqual({
        outcome: "review_required",
        reasonCodes: ["nonlife_car_amendment_low_confidence"],
      });
    });
  });

  it("termination without prompt env → manual_review", () => {
    withEnv({ OPENAI_PROMPT_AI_REVIEW_TERMINATION_DOCUMENT_ID: undefined }, () => {
      const r = resolveAiReviewExtractionRoute({
        ...base,
        documentType: "termination_document",
        productFamily: "unknown",
        productSubtype: "unknown",
      });
      expect(r).toEqual({ outcome: "manual_review", reasonCodes: ["prompt_missing_termination"] });
    });
  });

  it("termination with prompt env → extract", () => {
    withEnv({ OPENAI_PROMPT_AI_REVIEW_TERMINATION_DOCUMENT_ID: "pmpt_test" }, () => {
      const r = resolveAiReviewExtractionRoute({
        ...base,
        documentType: "termination_document",
        productFamily: "unknown",
        productSubtype: "unknown",
      });
      expect(r).toMatchObject({
        outcome: "extract",
        promptKey: "terminationDocumentExtraction",
      });
    });
  });

  it("investment proposal uses dedicated prompt when env is set", () => {
    withEnv({ OPENAI_PROMPT_AI_REVIEW_INVESTMENT_PROPOSAL_ID: "pmpt_inv" }, () => {
      const r = resolveAiReviewExtractionRoute({
        ...base,
        documentType: "proposal",
        productFamily: "investment",
        productSubtype: "unknown",
      });
      expect(r).toMatchObject({
        outcome: "extract",
        promptKey: "investmentProposal",
        reasonCodes: ["investment_proposal_dedicated"],
      });
    });
  });

  it("mortgage contract falls back to loan extraction when mortgage prompt missing", () => {
    withEnv({ OPENAI_PROMPT_AI_REVIEW_MORTGAGE_EXTRACTION_ID: undefined }, () => {
      const r = resolveAiReviewExtractionRoute({
        ...base,
        documentType: "contract",
        productFamily: "mortgage",
        productSubtype: "mortgage_loan",
      });
      expect(r).toMatchObject({
        outcome: "extract",
        promptKey: "loanContractExtraction",
        reasonCodes: ["mortgage_via_loan"],
      });
    });
  });
});
