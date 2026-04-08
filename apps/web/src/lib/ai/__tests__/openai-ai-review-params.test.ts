import { describe, it, expect } from "vitest";
import {
  buildAiReviewResponsesCreateExtras,
  isGpt5FamilyResponsesModel,
} from "../../openai-ai-review-params";

describe("isGpt5FamilyResponsesModel", () => {
  it("returns true for GPT-5 family slugs", () => {
    expect(isGpt5FamilyResponsesModel("gpt-5.4-mini")).toBe(true);
    expect(isGpt5FamilyResponsesModel("gpt-5-mini")).toBe(true);
    expect(isGpt5FamilyResponsesModel("Gpt-5.4-Mini")).toBe(true);
    expect(isGpt5FamilyResponsesModel("  gpt-5-nano  ")).toBe(true);
  });

  it("returns true when id contains gpt-5 (non-prefix)", () => {
    expect(isGpt5FamilyResponsesModel("azure/gpt-5-mini")).toBe(true);
  });

  it("returns false for GPT-4.x models", () => {
    expect(isGpt5FamilyResponsesModel("gpt-4o-mini")).toBe(false);
    expect(isGpt5FamilyResponsesModel("gpt-4.1-mini")).toBe(false);
    expect(isGpt5FamilyResponsesModel("gpt-4-turbo")).toBe(false);
  });
});

describe("buildAiReviewResponsesCreateExtras", () => {
  it("omits temperature for GPT-5; adds reasoning and max_output_tokens, no verbosity", () => {
    const ex = buildAiReviewResponsesCreateExtras("gpt-5.4-mini");
    expect(ex).not.toHaveProperty("temperature");
    expect(ex).not.toHaveProperty("text");
    expect(ex).toMatchObject({
      reasoning: { effort: "none" },
      max_output_tokens: 16_384,
    });
  });

  it("uses temperature only for GPT-4.x", () => {
    const ex4o = buildAiReviewResponsesCreateExtras("gpt-4o-mini");
    expect(ex4o).toEqual({ temperature: 0 });
    const ex41 = buildAiReviewResponsesCreateExtras("gpt-4.1-mini");
    expect(ex41).toEqual({ temperature: 0 });
  });

  it("respects maxOutputTokens for GPT-5 when positive finite", () => {
    const ex = buildAiReviewResponsesCreateExtras("gpt-5-mini", 4096);
    expect(ex.max_output_tokens).toBe(4096);
  });

  it("floors maxOutputTokens", () => {
    const ex = buildAiReviewResponsesCreateExtras("gpt-5-mini", 99.7);
    expect(ex.max_output_tokens).toBe(99);
  });

  it("ignores invalid maxOutputTokens and keeps default cap", () => {
    expect(
      (buildAiReviewResponsesCreateExtras("gpt-5-mini", 0) as { max_output_tokens: number })
        .max_output_tokens
    ).toBe(16_384);
    expect(
      (buildAiReviewResponsesCreateExtras("gpt-5-mini", -1) as { max_output_tokens: number })
        .max_output_tokens
    ).toBe(16_384);
    expect(
      (buildAiReviewResponsesCreateExtras("gpt-5-mini", NaN) as { max_output_tokens: number })
        .max_output_tokens
    ).toBe(16_384);
  });
});
