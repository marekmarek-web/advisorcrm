import { describe, expect, it } from "vitest";
import { safeParseReviewEnvelope } from "../document-schema-registry";
import { validateExtractionByType } from "../extraction-schemas-by-type";
import { coerceReviewEnvelopeParsedJson } from "../envelope-parse-coerce";

function minimalEnvelopeJson(overrides: Record<string, unknown> = {}): string {
  const base = {
    documentClassification: {
      primaryType: "life_insurance_modelation",
      lifecycleStatus: "modelation",
      confidence: 0.85,
      reasons: [],
    },
    documentMeta: { scannedVsDigital: "digital" },
    parties: {},
    extractedFields: {
      insurer: { value: "Generali", status: "extracted", confidence: 0.9 },
      productName: { value: "Bel Mondo 20", status: "extracted", confidence: 0.9 },
      modelationId: { value: "MOD-001", status: "extracted", confidence: 0.85 },
    },
    ...overrides,
  };
  return JSON.stringify(base);
}

describe("coerceReviewEnvelopeParsedJson", () => {
  it("removes empty subtype in light mode", () => {
    const input = JSON.parse(minimalEnvelopeJson());
    (input.documentClassification as { subtype: string }).subtype = "";
    const out = coerceReviewEnvelopeParsedJson(input, { mode: "light" }) as {
      documentClassification: { subtype?: string };
    };
    expect(out.documentClassification.subtype).toBeUndefined();
  });

  it("maps Czech alias modelace to modelation", () => {
    const input = JSON.parse(minimalEnvelopeJson());
    (input.documentClassification as { lifecycleStatus: string }).lifecycleStatus = "modelace";
    const out = coerceReviewEnvelopeParsedJson(input, { mode: "light" }) as {
      documentClassification: { lifecycleStatus: string };
    };
    expect(out.documentClassification.lifecycleStatus).toBe("modelation");
  });

  it("resolves generic insurance_contract to nonlife when subtype signals povinné ručení", () => {
    const input = JSON.parse(minimalEnvelopeJson({
      documentClassification: {
        primaryType: "insurance_contract",
        lifecycleStatus: "final_contract",
        confidence: 0.91,
        reasons: ["motor_insurance"],
      },
      productFamily: "non_life_insurance",
      productSubtype: "povinne_ruceni",
      fileName: "Povinne_ruceni.pdf",
    }));
    const out = coerceReviewEnvelopeParsedJson(input, { mode: "light" }) as {
      documentClassification: { primaryType: string };
    };
    expect(out.documentClassification.primaryType).toBe("nonlife_insurance_contract");
  });
});

describe("safeParseReviewEnvelope with expectedPrimaryType", () => {
  it("fixes invalid primaryType using expectedPrimaryType", () => {
    const input = JSON.parse(minimalEnvelopeJson());
    (input.documentClassification as { primaryType: string }).primaryType = "invalid_llm_type";
    const raw = JSON.stringify(input);
    const r = safeParseReviewEnvelope(raw, { expectedPrimaryType: "life_insurance_modelation" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.documentClassification.primaryType).toBe("life_insurance_modelation");
    }
  });

  it("parses when subtype is empty string after coerce", () => {
    const input = JSON.parse(minimalEnvelopeJson());
    (input.documentClassification as { subtype: string }).subtype = "";
    const raw = JSON.stringify(input);
    const r = safeParseReviewEnvelope(raw, { expectedPrimaryType: "life_insurance_modelation" });
    expect(r.ok).toBe(true);
  });
});

describe("validateExtractionByType", () => {
  it("accepts modelation envelope after coerce and aligns primaryType", () => {
    const raw = minimalEnvelopeJson({
      documentClassification: {
        primaryType: "not_an_enum",
        subtype: "",
        lifecycleStatus: "illustration",
        confidence: 0.8,
        reasons: [],
      },
    });
    const v = validateExtractionByType(raw, "life_insurance_modelation");
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.data.documentClassification.primaryType).toBe("life_insurance_modelation");
      expect(Object.keys(v.data.extractedFields).length).toBeGreaterThan(0);
      expect(v.data.extractedFields.insurer?.value).toBe("Generali");
    }
  });
});
