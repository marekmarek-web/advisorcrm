import { describe, it, expect } from "vitest";
import { parseAiReviewClientMatchKind } from "../ai-review-client-match-parse";

describe("parseAiReviewClientMatchKind", () => {
  it("parses JSON match_kind", () => {
    expect(parseAiReviewClientMatchKind('{"match_kind":"ambiguous"}')).toBe("ambiguous");
    expect(parseAiReviewClientMatchKind('{"matchKind":"exact_match"}')).toBe("exact_match");
  });

  it("falls back to substring heuristics", () => {
    expect(parseAiReviewClientMatchKind("The outcome is ambiguous for advisors.")).toBe("ambiguous");
    expect(parseAiReviewClientMatchKind(null)).toBeNull();
  });
});
