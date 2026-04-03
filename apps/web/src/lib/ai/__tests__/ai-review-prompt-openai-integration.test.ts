import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/openai", () => ({
  createAiReviewResponseFromPrompt: vi.fn().mockResolvedValue({ ok: true, text: "{}" }),
}));

describe("AI Review Prompt Builder calls (mock OpenAI wrapper)", () => {
  const prevRd = process.env.OPENAI_PROMPT_AI_REVIEW_REVIEW_DECISION_ID;
  const prevCm = process.env.OPENAI_PROMPT_AI_REVIEW_CLIENT_MATCH_ID;
  const prevAdvisorSummary = process.env.OPENAI_PROMPT_AI_REVIEW_DOCUMENT_SUMMARY_FOR_ADVISOR_ID;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_PROMPT_AI_REVIEW_REVIEW_DECISION_ID = "pmpt_review_decision_test";
    process.env.OPENAI_PROMPT_AI_REVIEW_CLIENT_MATCH_ID = "pmpt_client_match_test";
    process.env.OPENAI_PROMPT_AI_REVIEW_DOCUMENT_SUMMARY_FOR_ADVISOR_ID = "pmpt_document_summary_advisor_test";
  });

  afterEach(() => {
    if (prevRd === undefined) delete process.env.OPENAI_PROMPT_AI_REVIEW_REVIEW_DECISION_ID;
    else process.env.OPENAI_PROMPT_AI_REVIEW_REVIEW_DECISION_ID = prevRd;
    if (prevCm === undefined) delete process.env.OPENAI_PROMPT_AI_REVIEW_CLIENT_MATCH_ID;
    else process.env.OPENAI_PROMPT_AI_REVIEW_CLIENT_MATCH_ID = prevCm;
    if (prevAdvisorSummary === undefined) delete process.env.OPENAI_PROMPT_AI_REVIEW_DOCUMENT_SUMMARY_FOR_ADVISOR_ID;
    else process.env.OPENAI_PROMPT_AI_REVIEW_DOCUMENT_SUMMARY_FOR_ADVISOR_ID = prevAdvisorSummary;
  });

  it("runAiReviewDecisionLlm passes reviewDecision variables aligned with registry", async () => {
    const openai = await import("@/lib/openai");
    const { runAiReviewDecisionLlm } = await import("../ai-review-llm-postprocess");
    await runAiReviewDecisionLlm({
      normalizedDocumentType: "insurance_contract",
      extractionPayloadJson: '{"x":1}',
      validationWarningsJson: "[]",
      sectionConfidenceSummaryJson: '{"overallConfidence":0.8}',
      inputMode: "text_pdf",
      preprocessWarningsJson: '["w"]',
    });
    expect(openai.createAiReviewResponseFromPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        promptKey: "reviewDecision",
        variables: expect.objectContaining({
          normalized_document_type: "insurance_contract",
          extraction_payload: '{"x":1}',
          validation_warnings: "[]",
          section_confidence: '{"overallConfidence":0.8}',
          section_confidence_summary: '{"overallConfidence":0.8}',
          input_mode: "text_pdf",
          preprocess_warnings: '["w"]',
        }),
      }),
      expect.objectContaining({ routing: expect.objectContaining({ category: "ai_review" }) })
    );
  });

  it("buildAiReviewExtractionPromptVariables satisfies extraction registry for a prompt key", async () => {
    const { buildAiReviewExtractionPromptVariables, findMissingAiReviewPromptVariables } = await import(
      "../ai-review-prompt-variables"
    );
    const vars = buildAiReviewExtractionPromptVariables({
      documentText: "text ".repeat(200),
      classificationReasons: ["r1"],
      adobeSignals: "{}",
      filename: "doc.pdf",
    });
    expect(findMissingAiReviewPromptVariables("loanContractExtraction", vars)).toEqual([]);
    expect(findMissingAiReviewPromptVariables("paymentInstructionsExtraction", vars)).toEqual([]);
  });

  it("runAiReviewClientMatchLlm passes clientMatch and legacy duplicate keys", async () => {
    const openai = await import("@/lib/openai");
    const { runAiReviewClientMatchLlm } = await import("../ai-review-llm-postprocess");
    await runAiReviewClientMatchLlm({
      extractionPartiesJson: '{"parties":{}}',
      dbCandidatesJson: '[{"clientId":"1"}]',
    });
    expect(openai.createAiReviewResponseFromPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        promptKey: "clientMatch",
        variables: expect.objectContaining({
          extracted_client_payload: '{"parties":{}}',
          existing_client_candidates: '[{"clientId":"1"}]',
          extraction_parties_json: '{"parties":{}}',
          db_candidates_json: '[{"clientId":"1"}]',
        }),
      }),
      expect.objectContaining({ routing: expect.objectContaining({ category: "ai_review" }) })
    );
  });

  it("runAdvisorDocumentSummaryForAdvisorLlm passes Prompt Builder variable keys", async () => {
    const openai = await import("@/lib/openai");
    const { runAdvisorDocumentSummaryForAdvisorLlm } = await import("../ai-review-llm-postprocess");
    await runAdvisorDocumentSummaryForAdvisorLlm({
      documentSummaryPayloadJson: '{"a":1}',
      reviewDecisionPayloadJson: '{"b":2}',
      clientMatchPayloadJson: '{"c":3}',
    });
    expect(openai.createAiReviewResponseFromPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        promptKey: "documentSummaryForAdvisor",
        variables: {
          document_summary_payload: '{"a":1}',
          review_decision_payload: '{"b":2}',
          client_match_payload: '{"c":3}',
        },
      }),
      expect.objectContaining({ routing: expect.objectContaining({ category: "ai_review" }) })
    );
  });

  it("runAdvisorDocumentSummaryForAdvisorLlm does not call OpenAI when prompt ID is unset", async () => {
    const openai = await import("@/lib/openai");
    vi.clearAllMocks();
    delete process.env.OPENAI_PROMPT_AI_REVIEW_DOCUMENT_SUMMARY_FOR_ADVISOR_ID;
    const { runAdvisorDocumentSummaryForAdvisorLlm } = await import("../ai-review-llm-postprocess");
    const res = await runAdvisorDocumentSummaryForAdvisorLlm({
      documentSummaryPayloadJson: "{}",
      reviewDecisionPayloadJson: "{}",
      clientMatchPayloadJson: "{}",
    });
    expect(res.ok).toBe(false);
    expect(openai.createAiReviewResponseFromPrompt).not.toHaveBeenCalled();
  });
});
