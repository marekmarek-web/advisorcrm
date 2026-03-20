import { describe, it, expect, vi } from "vitest";

vi.mock("db", () => ({
  db: {},
  tasks: {},
  contacts: {},
  contracts: {},
  opportunities: {},
  opportunityStages: {},
  contractUploadReviews: {},
  companies: {},
  companyPersonLinks: {},
  eq: () => ({}),
  and: () => ({}),
  or: () => ({}),
  isNull: () => ({}),
  sql: () => ({}),
  asc: () => ({}),
  desc: () => ({}),
}));
import { isMatchingAmbiguous } from "../client-matching";
import type { ClientMatchCandidate } from "../review-queue";

describe("client-matching", () => {
  describe("isMatchingAmbiguous", () => {
    it("returns true when multiple high confidence", () => {
      const candidates: ClientMatchCandidate[] = [
        { clientId: "a", score: 0.95, confidence: "high", reasons: [], matchedFields: {} },
        { clientId: "b", score: 0.9, confidence: "high", reasons: [], matchedFields: {} },
      ];
      expect(isMatchingAmbiguous(candidates)).toBe(true);
    });

    it("returns false when single high", () => {
      const candidates: ClientMatchCandidate[] = [
        { clientId: "a", score: 0.95, confidence: "high", reasons: [], matchedFields: {} },
      ];
      expect(isMatchingAmbiguous(candidates)).toBe(false);
    });

    it("returns true when two similar scores", () => {
      const candidates: ClientMatchCandidate[] = [
        { clientId: "a", score: 0.75, confidence: "medium", reasons: [], matchedFields: {} },
        { clientId: "b", score: 0.72, confidence: "medium", reasons: [], matchedFields: {} },
      ];
      expect(isMatchingAmbiguous(candidates)).toBe(true);
    });

    it("returns false when scores differ enough", () => {
      const candidates: ClientMatchCandidate[] = [
        { clientId: "a", score: 0.9, confidence: "high", reasons: [], matchedFields: {} },
        { clientId: "b", score: 0.5, confidence: "medium", reasons: [], matchedFields: {} },
      ];
      expect(isMatchingAmbiguous(candidates)).toBe(false);
    });

    it("returns false for empty array", () => {
      expect(isMatchingAmbiguous([])).toBe(false);
    });
  });
});
