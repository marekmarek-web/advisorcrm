/**
 * Komisionářská smlouva — end-to-end pipeline integration tests.
 *
 * Proves that the P1-K1 fix holds across the full V2 chain, NOT just the
 * override function in isolation. A regression in any of these steps breaks
 * the test:
 *
 *   classifier (LLM-misclassified)
 *     → applyRouterInputTextOverrides (Priority 4)
 *     → mapAiClassifierToClassificationResult (with overridden fields)
 *     → resolveAiReviewExtractionRoute (§3 investment)
 *     → investmentContractExtraction prompt key
 *
 * Covers three realistic misclassification scenarios observed in runtime:
 *   K01: LLM → compliance / consent_or_identification_document / declaration
 *   K02: LLM → life_insurance / contract / forte     (IŽP look-alike)
 *   K03: LLM → generic_financial_document (fallback bucket)
 *
 * Each scenario asserts ALL four stage outputs so any regression is obvious.
 */

import { describe, it, expect } from "vitest";
import type { AiClassifierOutput } from "@/lib/ai/ai-review-classifier";
import { applyRouterInputTextOverrides } from "@/lib/ai/document-classification-overrides";
import { mapAiClassifierToClassificationResult } from "@/lib/ai/ai-review-type-mapper";
import { resolveAiReviewExtractionRoute } from "@/lib/ai/ai-review-extraction-router";

// ── Text fixtures ────────────────────────────────────────────────────────────

const KOMISIONARSKA_PURE = `
Komisionářská smlouva o obstarávání obchodů s cennými papíry

Komisionář: Broker Partners a.s., IČ: 12345678
Komitent: Jan Novák, nar. 1.1.1980

Předmět smlouvy: komisionář se zavazuje pro komitenta na jeho účet a ve svém
jménu zařizovat koupi a prodej cenných papírů v rámci poskytování investičních
služeb dle zákona č. 256/2004 Sb.

Smlouva o poskytování investičních služeb.
Investiční mandát: diskreční obhospodařování portfolia cenných papírů.
`.trim().padEnd(500, " ");

const MANDATNI_PURE = `
Mandátní smlouva — obhospodařování majetku

Mandatář: XYZ Investments a.s.
Mandant: Jana Nováková, nar. 5.5.1985

Předmět: smlouva o obhospodařování majetku zákazníka, včetně investic do
cenných papírů. Mandatář poskytuje investiční služby dle zákona o podnikání
na kapitálovém trhu. Smlouva o poskytování investičních služeb.
`.trim().padEnd(500, " ");

function baseAi(partial: Partial<AiClassifierOutput>): AiClassifierOutput {
  return {
    documentType: "",
    productFamily: "",
    productSubtype: "",
    businessIntent: "",
    recommendedRoute: "",
    confidence: 0.6,
    warnings: [],
    reasons: [],
    documentTypeUncertain: false,
    supportedForDirectExtraction: true,
    ...partial,
  };
}

// ── Integration helper ───────────────────────────────────────────────────────

function runPipeline(ai: AiClassifierOutput, text: string) {
  const override = applyRouterInputTextOverrides(
    ai.productFamily,
    ai.documentType,
    ai.productSubtype,
    text,
  );

  const effectiveAi: AiClassifierOutput = override.overrideApplied
    ? {
        ...ai,
        documentType: override.documentType,
        productFamily: override.productFamily,
        productSubtype: override.productSubtype,
      }
    : ai;

  const classification = mapAiClassifierToClassificationResult(effectiveAi);

  const router = resolveAiReviewExtractionRoute({
    documentType: effectiveAi.documentType,
    productFamily: effectiveAi.productFamily,
    productSubtype: effectiveAi.productSubtype,
    businessIntent: effectiveAi.businessIntent,
    recommendedRoute: effectiveAi.recommendedRoute,
    confidence: effectiveAi.confidence,
    documentTypeUncertain: effectiveAi.documentTypeUncertain === true,
  });

  return { override, classification, router, effectiveAi };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Komisionářská — V2 pipeline integration (Priority 4 end-to-end)", () => {
  it("K01: LLM mis-classifies as compliance/consent → rescues to investment_service_agreement → investmentContractExtraction", () => {
    const { override, classification, router } = runPipeline(
      baseAi({
        productFamily: "compliance",
        documentType: "consent_or_identification_document",
        productSubtype: "declaration",
        confidence: 0.55,
      }),
      KOMISIONARSKA_PURE,
    );

    expect(override.overrideApplied).toBe(true);
    expect(override.productFamily).toBe("investment");
    expect(override.documentType).toBe("contract");
    expect(override.productSubtype).toBe("investment_service_agreement");

    expect(classification.primaryType).toBe("investment_service_agreement");

    expect(router.outcome).toBe("extract");
    if (router.outcome === "extract") {
      expect(router.promptKey).toBe("investmentContractExtraction");
      expect(router.reasonCodes).toContain("investment_contract");
    }
  });

  it("K02: LLM mis-classifies as life_insurance/contract/forte → Priority 4 rescues mandátní smlouva", () => {
    const { override, classification, router } = runPipeline(
      baseAi({
        productFamily: "life_insurance",
        documentType: "contract",
        productSubtype: "forte",
        confidence: 0.62,
      }),
      MANDATNI_PURE,
    );

    expect(override.overrideApplied).toBe(true);
    expect(override.productFamily).toBe("investment");
    expect(override.documentType).toBe("contract");

    expect(classification.primaryType).toBe("investment_service_agreement");

    expect(router.outcome).toBe("extract");
    if (router.outcome === "extract") {
      expect(router.promptKey).toBe("investmentContractExtraction");
    }
  });

  it("K03: LLM fallbacks to generic_financial_document → Priority 4 lifts into investmentContractExtraction", () => {
    const { override, classification, router } = runPipeline(
      baseAi({
        productFamily: "unknown",
        documentType: "unknown",
        productSubtype: "unknown",
        confidence: 0.45,
      }),
      KOMISIONARSKA_PURE,
    );

    expect(override.overrideApplied).toBe(true);
    expect(override.productFamily).toBe("investment");
    expect(override.documentType).toBe("contract");

    expect(classification.primaryType).toBe("investment_service_agreement");

    expect(router.outcome).toBe("extract");
    if (router.outcome === "extract") {
      expect(router.promptKey).toBe("investmentContractExtraction");
    }
  });

  it("K04: non-Komisionářská text → no override, classifier output respected (no false-positives)", () => {
    const LIFE_INSURANCE_TEXT = `
      Pojistná smlouva č. POL-777
      Pojistitel: Kooperativa pojišťovna, a.s.
      Pojistník: Jan Novák
      Pojištěný: Jan Novák

      Produkt: FORTE životní pojištění, varianta RISK.
      Pojistná částka: 1 000 000 Kč. Běžné pojistné: 500 Kč měsíčně.
    `.trim().padEnd(400, " ");

    const { override, router } = runPipeline(
      baseAi({
        productFamily: "life_insurance",
        documentType: "contract",
        productSubtype: "risk_life_insurance",
        confidence: 0.72,
      }),
      LIFE_INSURANCE_TEXT,
    );

    expect(override.overrideApplied).toBe(false);
    expect(router.outcome).toBe("extract");
    if (router.outcome === "extract") {
      expect(router.promptKey).toBe("insuranceContractExtraction");
    }
  });

  it("K05: already correctly classified investment/contract → override idempotent, router routes correctly", () => {
    const { override, router } = runPipeline(
      baseAi({
        productFamily: "investment",
        documentType: "contract",
        productSubtype: "investment_service_agreement",
        confidence: 0.82,
      }),
      KOMISIONARSKA_PURE,
    );

    // Guard blocks re-override on already-correct classification
    expect(override.overrideApplied).toBe(false);
    expect(router.outcome).toBe("extract");
    if (router.outcome === "extract") {
      expect(router.promptKey).toBe("investmentContractExtraction");
    }
  });

  it("K06: DIP/DPS/PP guards hold — Komisionářská keywords inside DIP contract should NOT be routed to investmentContractExtraction", () => {
    const DIP_WITH_WEAK_KOMISIONARSKA = `
      Smlouva o Dlouhodobém investičním produktu (DIP)
      DIP účet č. 2024-001
      Majitel účtu DIP: Jan Novák

      V rámci DIP lze využít investiční služby (obhospodařování) dle zákona.
    `.trim().padEnd(300, " ");

    const { override, router } = runPipeline(
      baseAi({
        productFamily: "dip",
        documentType: "contract",
        productSubtype: "unknown",
        confidence: 0.78,
      }),
      DIP_WITH_WEAK_KOMISIONARSKA,
    );

    expect(override.overrideApplied).toBe(false);
    expect(router.outcome).toBe("extract");
    if (router.outcome === "extract") {
      expect(router.promptKey).toBe("dipExtraction");
    }
  });
});
