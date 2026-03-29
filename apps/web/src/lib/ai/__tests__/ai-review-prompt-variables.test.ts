import { describe, it, expect } from "vitest";
import {
  buildAiReviewExtractionPromptVariables,
  capAiReviewPromptString,
  coerceNonEmptyAiReviewVariables,
  findMissingAiReviewPromptVariables,
} from "../ai-review-prompt-variables";

describe("findMissingAiReviewPromptVariables", () => {
  it("docClassifierV2 requires all six Prompt Builder keys", () => {
    expect(findMissingAiReviewPromptVariables("docClassifierV2", { filename: "x" }).length).toBeGreaterThan(0);
    expect(
      findMissingAiReviewPromptVariables("docClassifierV2", {
        filename: "a.pdf",
        page_count: "2",
        input_mode: "text_pdf",
        text_excerpt: "hello",
        adobe_signals: "none",
        source_channel: "ai_review",
      })
    ).toEqual([]);
  });

  it("returns empty when all extraction vars present", () => {
    const m = findMissingAiReviewPromptVariables("loanContractExtraction", {
      extracted_text: "x",
      classification_reasons: "[]",
      adobe_signals: "{}",
      filename: "a.pdf",
    });
    expect(m).toEqual([]);
  });

  it("flags empty or missing required keys for reviewDecision", () => {
    expect(findMissingAiReviewPromptVariables("reviewDecision", {})).toContain("normalized_document_type");
    expect(
      findMissingAiReviewPromptVariables("reviewDecision", {
        normalized_document_type: "t",
        extraction_payload: "{}",
        validation_warnings: "[]",
        section_confidence: "{}",
        input_mode: "text_pdf",
        preprocess_warnings: "   ",
      })
    ).toEqual(["preprocess_warnings"]);
  });
});

describe("buildAiReviewExtractionPromptVariables", () => {
  it("includes legacy document_text by default", () => {
    const v = buildAiReviewExtractionPromptVariables({
      documentText: "hello world",
      classificationReasons: ["a"],
      adobeSignals: "none",
      filename: "f.pdf",
    });
    expect(v.extracted_text).toContain("hello");
    expect(v.document_text).toBe(v.extracted_text);
    expect(v.classification_reasons).toBe(JSON.stringify(["a"]));
  });
});

describe("coerceNonEmptyAiReviewVariables", () => {
  it("fills missing extraction keys and camelCase mirrors", () => {
    const c = coerceNonEmptyAiReviewVariables("loanContractExtraction", {
      extracted_text: "  body  ",
    });
    expect(c.filename).toBe("unknown");
    expect(c.adobe_signals).toBe("none");
    expect(c.classification_reasons).toBe("[]");
    expect(c.extracted_text).toBe("  body  ");
    expect(c.extractedText).toBe("  body  ");
    expect(c.adobeSignals).toBe("none");
  });
});

describe("capAiReviewPromptString", () => {
  it("truncates beyond max", () => {
    const s = "x".repeat(100);
    const c = capAiReviewPromptString(s, 40);
    expect(c.length).toBeLessThan(s.length);
    expect(c).toContain("truncated");
  });
});
