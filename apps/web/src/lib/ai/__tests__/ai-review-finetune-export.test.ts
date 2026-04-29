import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  anonymizeAiReviewFineTunePayload,
  anonymizeAiReviewFineTuneText,
  assertFineTuneJsonlRowsSafe,
  buildAiReviewFineTuneDatasetFromEvalCases,
} from "../ai-review-finetune-export";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AI Review fine-tune export", () => {
  it("anonymizes direct PII while preserving product and financial facts", () => {
    const text = "Klient Jan Novák, e-mail jan@example.com, telefon +420 777 888 999, RČ 010101/1234, adresa Ulice 12, Praha. Produkt UNIQA Život, pojistné 2 442 Kč.";
    const anonymized = anonymizeAiReviewFineTuneText(text);

    expect(anonymized).toContain("CLIENT_1");
    expect(anonymized).toContain("EMAIL_1");
    expect(anonymized).toContain("PHONE_1");
    expect(anonymized).toContain("BIRTH_ID_1");
    expect(anonymized).toContain("ADDRESS_1");
    expect(anonymized).toContain("UNIQA Život");
    expect(anonymized).toContain("2 442 Kč");
    expect(anonymized).not.toContain("jan@example.com");
    expect(anonymized).not.toContain("010101/1234");
  });

  it("validates exported JSONL rows against raw PII and assistant JSON shape", () => {
    expect(() => assertFineTuneJsonlRowsSafe([{
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "EMAIL_1" },
        { role: "assistant", content: "{\"ok\":true}" },
      ],
      metadata: {
        tenantScope: "tenant",
        institution: "UNIQA",
        product: "Životní pojištění",
        documentType: "life_insurance_contract",
        sourceEvalCaseId: "eval-1",
        piiScrubbed: true,
      },
    }])).not.toThrow();

    expect(() => assertFineTuneJsonlRowsSafe([{
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "jan@example.com" },
        { role: "assistant", content: "{\"ok\":true}" },
      ],
      metadata: {
        tenantScope: "tenant",
        institution: null,
        product: null,
        documentType: null,
        sourceEvalCaseId: "eval-2",
        piiScrubbed: true,
      },
    }])).toThrow(/raw PII/);
  });

  it("builds train and validation JSONL rows only from scrubbed eval cases with accepted corrections", async () => {
    const evalCases = Array.from({ length: 5 }, (_, index) => ({
        id: `eval-${index}`,
        sourceCorrectionIds: [`correction-${index}`],
        anonymizedInputRef: `CLIENT_${index + 1} UNIQA Život pojistné 2 442 Kč`,
        institutionName: "UNIQA",
        productName: "Životní pojištění",
        documentType: "life_insurance_contract",
        expectedOutputJson: anonymizeAiReviewFineTunePayload({
          policyHolder: { fullName: "Jan Novák" },
          premium: { totalMonthlyPremium: 2442 },
        }),
        criticalFields: ["policyHolder.fullName", "premium.totalMonthlyPremium"],
        piiScrubbed: true,
      }));

    const dataset = buildAiReviewFineTuneDatasetFromEvalCases({
      evalCases,
      acceptedCorrectionIds: new Set(Array.from({ length: 5 }, (_, index) => `correction-${index}`)),
    });

    expect(dataset.rows).toHaveLength(5);
    expect(dataset.split.validation).toHaveLength(1);
    expect(dataset.split.train).toHaveLength(4);
    expect(dataset.summary).toMatchObject({
      train: 4,
      validation: 1,
      holdout: 0,
      skippedRecords: [],
    });
    expect(dataset.rows[0].messages[0]?.content).toContain("Return only schema-valid JSON");
    expect(() => JSON.parse(dataset.rows[0].messages[2]?.content ?? "")).not.toThrow();
  });
});
