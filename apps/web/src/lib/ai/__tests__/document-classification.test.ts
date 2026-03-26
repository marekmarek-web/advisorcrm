import { describe, it, expect, vi } from "vitest";
import { classifyContractDocument, parseClassificationResponse, CONTRACT_DOCUMENT_TYPES } from "../document-classification";

vi.mock("@/lib/openai", () => ({
  createResponseWithFile: vi.fn(),
}));

describe("document-classification", () => {
  describe("parseClassificationResponse", () => {
    it("parses valid JSON with known document type", () => {
      const raw = JSON.stringify({
        primaryType: "life_insurance_contract",
        subtype: "generali_bel_mondo",
        lifecycleStatus: "final_contract",
        confidence: 0.9,
        reasons: ["Pojistná smlouva", "Premium field"],
      });
      const result = parseClassificationResponse(raw);
      expect(result.primaryType).toBe("life_insurance_contract");
      expect(result.subtype).toBe("generali_bel_mondo");
      expect(result.confidence).toBe(0.9);
      expect(result.reasons).toHaveLength(2);
    });

    it("returns unknown when documentType is invalid", () => {
      const raw = JSON.stringify({
        primaryType: "invalid_type",
        confidence: 0.5,
        reasons: [],
      });
      const result = parseClassificationResponse(raw);
      expect(result.primaryType).toBe("unsupported_or_unknown");
      expect(result.confidence).toBe(0);
      expect(result.reasons[0]).toMatch(/Chyba parsování|Parse error/i);
    });

    it("extracts JSON from markdown-wrapped response", () => {
      const raw = `Here is the result:\n\`\`\`json\n${JSON.stringify({
        primaryType: "consumer_loan_contract",
        lifecycleStatus: "final_contract",
        confidence: 0.85,
        reasons: ["Úvěr"],
      })}\n\`\`\``;
      const result = parseClassificationResponse(raw);
      expect(result.primaryType).toBe("consumer_loan_contract");
      expect(result.confidence).toBe(0.85);
    });

    it("accepts all CONTRACT_DOCUMENT_TYPES", () => {
      for (const docType of CONTRACT_DOCUMENT_TYPES) {
        const raw = JSON.stringify({ primaryType: docType, confidence: 0.8, reasons: [] });
        const result = parseClassificationResponse(raw);
        expect(result.primaryType).toBe(docType);
      }
    });

    it("accepts JSON without reasons (slim classifier)", () => {
      const raw = JSON.stringify({
        primaryType: "life_insurance_proposal",
        subtype: "unknown",
        confidence: 0.77,
      });
      const result = parseClassificationResponse(raw);
      expect(result.primaryType).toBe("life_insurance_proposal");
      expect(result.reasons).toEqual([]);
    });
  });

  describe("classifyContractDocument", () => {
    it("returns parsed result when createResponseWithFile returns valid JSON", async () => {
      const openai = await import("@/lib/openai");
      vi.mocked(openai.createResponseWithFile).mockResolvedValueOnce(
        JSON.stringify({
          primaryType: "bank_statement",
          lifecycleStatus: "statement",
          confidence: 0.75,
          reasons: ["Platební doklad"],
        })
      );
      const result = await classifyContractDocument("https://example.com/file.pdf");
      expect(result.primaryType).toBe("bank_statement");
      expect(result.confidence).toBe(0.75);
      expect(openai.createResponseWithFile).toHaveBeenCalledWith(
        "https://example.com/file.pdf",
        expect.any(String),
        { routing: { category: "ai_review" } }
      );
    });
  });
});
