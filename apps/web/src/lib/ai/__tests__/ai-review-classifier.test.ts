import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildDocClassifierPromptVariables, runAiReviewClassifier } from "../ai-review-classifier";

vi.mock("@/lib/openai", () => ({
  createAiReviewResponseFromPrompt: vi.fn(),
  createResponseWithFile: vi.fn(),
}));

const classifierJson = JSON.stringify({
  documentType: "contract",
  productFamily: "life_insurance",
  productSubtype: "risk_life_insurance",
  businessIntent: "standard",
  recommendedRoute: "extract",
  confidence: 0.9,
  warnings: [],
});

describe("buildDocClassifierPromptVariables", () => {
  it("fills all six Prompt Builder keys with defaults when metadata missing", () => {
    const excerpt = "a".repeat(600);
    const { variables, fallbacksApplied } = buildDocClassifierPromptVariables({
      documentTextExcerpt: excerpt,
    });
    expect(Object.keys(variables).sort()).toEqual(
      ["adobe_signals", "filename", "input_mode", "page_count", "source_channel", "text_excerpt"].sort()
    );
    expect(variables.filename).toBe("unknown");
    expect(variables.page_count).toBe("1");
    expect(variables.input_mode).toBe("unknown");
    expect(variables.source_channel).toBe("ai_review");
    expect(variables.adobe_signals).toBe("none");
    expect(variables.text_excerpt.length).toBeGreaterThan(0);
    expect(fallbacksApplied).toEqual(expect.arrayContaining(["filename", "page_count", "input_mode", "adobe_signals"]));
  });

  it("uses provided filename, pageCount, inputMode, adobeSignals when valid", () => {
    const excerpt = "b".repeat(600);
    const adobe = JSON.stringify({ adobePreprocessed: true, preprocessStatus: "ok" });
    const { variables, fallbacksApplied } = buildDocClassifierPromptVariables({
      documentTextExcerpt: excerpt,
      filename: " smlouva.pdf ",
      pageCount: 12,
      inputMode: "text_pdf",
      adobeSignals: adobe,
    });
    expect(variables.filename).toBe("smlouva.pdf");
    expect(variables.page_count).toBe("12");
    expect(variables.input_mode).toBe("text_pdf");
    expect(variables.adobe_signals).toBe(adobe);
    expect(variables.source_channel).toBe("ai_review");
    expect(fallbacksApplied).not.toContain("filename");
    expect(fallbacksApplied).not.toContain("page_count");
    expect(fallbacksApplied).not.toContain("input_mode");
    expect(fallbacksApplied).not.toContain("adobe_signals");
  });

  it("uses (no excerpt) when excerpt empty after selection", () => {
    const { variables, fallbacksApplied } = buildDocClassifierPromptVariables({
      documentTextExcerpt: "   ",
    });
    expect(variables.text_excerpt).toBe("(no excerpt)");
    expect(fallbacksApplied).toContain("text_excerpt");
  });
});

describe("runAiReviewClassifier prompt path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes six variables via createAiReviewResponseFromPrompt when prompt id set and excerpt long enough", async () => {
    const openai = await import("@/lib/openai");
    vi.mocked(openai.createAiReviewResponseFromPrompt).mockResolvedValueOnce({ ok: true, text: classifierJson });
    vi.mocked(openai.createResponseWithFile).mockRejectedValueOnce(new Error("should not call file path"));

    const excerpt = "c".repeat(500);
    const prevId = process.env.OPENAI_PROMPT_AI_REVIEW_DOC_CLASSIFIER_ID;
    process.env.OPENAI_PROMPT_AI_REVIEW_DOC_CLASSIFIER_ID = "pmpt_test_classifier";
    try {
      const res = await runAiReviewClassifier({
        fileUrl: "https://example.com/x.pdf",
        documentTextExcerpt: excerpt,
        filename: "doc.pdf",
        pageCount: 3,
        inputMode: "scanned_pdf",
        adobeSignals: '{"preprocessWarningCount":0}',
      });
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.data.documentType).toBe("contract");
    } finally {
      if (prevId === undefined) delete process.env.OPENAI_PROMPT_AI_REVIEW_DOC_CLASSIFIER_ID;
      else process.env.OPENAI_PROMPT_AI_REVIEW_DOC_CLASSIFIER_ID = prevId;
    }

    expect(openai.createAiReviewResponseFromPrompt).toHaveBeenCalledTimes(1);
    const call = vi.mocked(openai.createAiReviewResponseFromPrompt).mock.calls[0][0];
    expect(call.promptKey).toBe("docClassifierV2");
    expect(call.variables).toMatchObject({
      filename: "doc.pdf",
      page_count: "3",
      input_mode: "scanned_pdf",
      source_channel: "ai_review",
      adobe_signals: '{"preprocessWarningCount":0}',
    });
    expect(typeof call.variables.text_excerpt).toBe("string");
    expect(call.variables.text_excerpt.length).toBeGreaterThan(0);
    expect(Object.keys(call.variables).sort()).toEqual(
      ["adobe_signals", "filename", "input_mode", "page_count", "source_channel", "text_excerpt"].sort()
    );
    expect(openai.createResponseWithFile).not.toHaveBeenCalled();
  });
});
