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
import { isMatchingAmbiguous, computeMatchVerdict } from "../client-matching";
import type { ClientMatchCandidate } from "../review-queue";

// Threshold: confidenceFromScore maps score >= 0.34 → high, >= 0.25 → medium
const HIGH_SCORE = 0.46; // personalId exact (definitive high)
const MEDIUM_SCORE = 0.28; // above medium threshold
const LOW_SCORE = 0.18; // below medium threshold

describe("client-matching", () => {
  describe("isMatchingAmbiguous (legacy)", () => {
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

  describe("computeMatchVerdict", () => {
    it("no_match when empty", () => {
      const r = computeMatchVerdict([]);
      expect(r.verdict).toBe("no_match");
      expect(r.autoResolvedClientId).toBeNull();
    });

    it("no_match when top candidate score < 0.25", () => {
      const candidates: ClientMatchCandidate[] = [
        { clientId: "a", score: LOW_SCORE, confidence: "low", reasons: [], matchedFields: {} },
      ];
      const r = computeMatchVerdict(candidates);
      expect(r.verdict).toBe("no_match");
    });

    it("existing_match for single high-confidence candidate (personalId exact)", () => {
      const candidates: ClientMatchCandidate[] = [
        { clientId: "a", score: HIGH_SCORE, confidence: "high", reasons: ["Shoda rodného čísla"], matchedFields: { personalId: true } },
      ];
      const r = computeMatchVerdict(candidates);
      expect(r.verdict).toBe("existing_match");
      expect(r.autoResolvedClientId).toBe("a");
    });

    it("existing_match when gap >= 0.10 between first and second", () => {
      const candidates: ClientMatchCandidate[] = [
        { clientId: "a", score: 0.46, confidence: "high", reasons: [], matchedFields: {} },
        { clientId: "b", score: 0.28, confidence: "medium", reasons: [], matchedFields: {} },
      ];
      const r = computeMatchVerdict(candidates);
      expect(r.verdict).toBe("existing_match");
      expect(r.autoResolvedClientId).toBe("a");
    });

    it("near_match when high-confidence top, gap 0.05-0.09", () => {
      const candidates: ClientMatchCandidate[] = [
        { clientId: "a", score: 0.46, confidence: "high", reasons: [], matchedFields: {} },
        { clientId: "b", score: 0.40, confidence: "high", reasons: [], matchedFields: {} },
      ];
      const r = computeMatchVerdict(candidates);
      expect(r.verdict).toBe("near_match");
      expect(r.autoResolvedClientId).toBeNull();
    });

    it("ambiguous_match when two high-confidence close (gap < 0.05)", () => {
      const candidates: ClientMatchCandidate[] = [
        { clientId: "a", score: 0.46, confidence: "high", reasons: [], matchedFields: {} },
        { clientId: "b", score: 0.44, confidence: "high", reasons: [], matchedFields: {} },
      ];
      const r = computeMatchVerdict(candidates);
      expect(r.verdict).toBe("ambiguous_match");
    });

    it("near_match for single medium-confidence candidate", () => {
      const candidates: ClientMatchCandidate[] = [
        { clientId: "a", score: MEDIUM_SCORE, confidence: "medium", reasons: [], matchedFields: {} },
      ];
      const r = computeMatchVerdict(candidates);
      expect(r.verdict).toBe("near_match");
    });

    it("ambiguous_match for multiple medium-confidence candidates", () => {
      const candidates: ClientMatchCandidate[] = [
        { clientId: "a", score: MEDIUM_SCORE, confidence: "medium", reasons: [], matchedFields: {} },
        { clientId: "b", score: MEDIUM_SCORE - 0.01, confidence: "medium", reasons: [], matchedFields: {} },
      ];
      const r = computeMatchVerdict(candidates);
      expect(r.verdict).toBe("ambiguous_match");
    });

    it("existing_match does NOT arise from two candidates when gap is large enough", () => {
      // personalId (0.46) vs name-only (0.18 → filtered out as < 0.25)
      const candidates: ClientMatchCandidate[] = [
        { clientId: "a", score: 0.46, confidence: "high", reasons: ["Shoda rodného čísla"], matchedFields: { personalId: true } },
        { clientId: "b", score: 0.18, confidence: "low", reasons: ["Shoda jména"], matchedFields: { fullName: true } },
      ];
      const r = computeMatchVerdict(candidates);
      // b is filtered out (< 0.25), so only 1 candidate remains → existing_match
      expect(r.verdict).toBe("existing_match");
      expect(r.autoResolvedClientId).toBe("a");
    });

    it("confidenceFromScore: personalId exact (0.46) → high confidence candidate gives existing_match", () => {
      const candidates: ClientMatchCandidate[] = [
        { clientId: "pid-client", score: 0.46, confidence: "high", reasons: [], matchedFields: { personalId: true } },
      ];
      const r = computeMatchVerdict(candidates);
      expect(r.verdict).toBe("existing_match");
    });
  });
});
