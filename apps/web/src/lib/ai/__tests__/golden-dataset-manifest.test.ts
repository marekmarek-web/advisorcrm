import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const EXPECTED_CORPUS_COUNT = 27;

/** Repo root when vitest cwd is apps/web */
function manifestPath(): string {
  return path.join(process.cwd(), "..", "..", "fixtures", "golden-ai-review", "scenarios.manifest.json");
}

const ALLOWED_FAMILY_BUCKETS = new Set([
  "final_life_contract",
  "life_proposal",
  "life_modelation",
  "life_bundle_with_questionnaires",
  "investment_or_dip_or_dps",
  "consumer_loan",
  "mortgage_or_mortgage_proposal",
  "leasing",
  "service_or_aml_or_supporting_doc",
  "non_publishable_attachment_only",
]);

type Manifest = {
  version: number;
  scenarios: unknown[];
  corpusDocuments: Array<{
    id: string;
    familyBucket: string;
    referenceFile: string;
    gitTracked: boolean;
    expectedPrimaryType: string;
    publishable: boolean | string;
    isPacket: boolean;
    expectedEntities: string[];
    expectedExtractedFields: string[];
    expectedForbiddenActions: string[];
    expectedReviewFlags: string[];
    expectedAssistantRelevance: string;
    mapsToGoldenScenarioIds: string[];
    corpusNote?: string;
    aliasFileNames?: string[];
  }>;
};

describe("golden-dataset manifest (phase 1, corpus v3)", () => {
  it("parses v3 with 12 scenarios and full corpusDocuments", () => {
    const p = manifestPath();
    expect(existsSync(p)).toBe(true);
    const raw = JSON.parse(readFileSync(p, "utf8")) as Manifest;
    expect(raw.version).toBe(3);
    expect(Array.isArray(raw.scenarios)).toBe(true);
    expect(raw.scenarios.length).toBe(12);
    expect(Array.isArray(raw.corpusDocuments)).toBe(true);
    expect(raw.corpusDocuments.length).toBe(EXPECTED_CORPUS_COUNT);
  });

  it("every corpus document has required fields and valid familyBucket", () => {
    const p = manifestPath();
    const raw = JSON.parse(readFileSync(p, "utf8")) as Manifest;
    const seen = new Set<string>();
    for (const d of raw.corpusDocuments) {
      expect(d.id).toMatch(/^C\d{2,3}$/);
      expect(seen.has(d.id)).toBe(false);
      seen.add(d.id);
      expect(ALLOWED_FAMILY_BUCKETS.has(d.familyBucket)).toBe(true);
      expect(typeof d.referenceFile).toBe("string");
      expect(d.referenceFile.startsWith("Test AI/")).toBe(true);
      expect(typeof d.gitTracked).toBe("boolean");
      expect(typeof d.expectedPrimaryType).toBe("string");
      expect(d.expectedPrimaryType.length).toBeGreaterThan(0);
      expect(["boolean", "string"].includes(typeof d.publishable)).toBe(true);
      expect(typeof d.isPacket).toBe("boolean");
      expect(Array.isArray(d.expectedEntities)).toBe(true);
      expect(d.expectedEntities.length).toBeGreaterThan(0);
      expect(Array.isArray(d.expectedExtractedFields)).toBe(true);
      expect(d.expectedExtractedFields.length).toBeGreaterThan(0);
      expect(Array.isArray(d.expectedForbiddenActions)).toBe(true);
      expect(Array.isArray(d.expectedReviewFlags)).toBe(true);
      expect(typeof d.expectedAssistantRelevance).toBe("string");
      expect(d.expectedAssistantRelevance.length).toBeGreaterThan(0);
      expect(Array.isArray(d.mapsToGoldenScenarioIds)).toBe(true);
      for (const g of d.mapsToGoldenScenarioIds) {
        expect(g).toMatch(/^G\d{2}$/);
      }
      if (d.aliasFileNames) {
        expect(Array.isArray(d.aliasFileNames)).toBe(true);
        for (const a of d.aliasFileNames) {
          expect(a.startsWith("Test AI/")).toBe(true);
        }
      }
    }
    expect(seen.size).toBe(EXPECTED_CORPUS_COUNT);
  });
});
