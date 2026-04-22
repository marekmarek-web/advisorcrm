/**
 * Router-input classification overrides — regression tests.
 *
 * Coverage matrix (applyRouterInputTextOverrides):
 * R01: pure AML form → compliance/consent_or_identification_document/aml_kyc_form
 * R02: AML embedded in life insurance contract (≥2 insurance headers) → no override
 * R03: AML embedded in Komisionářská smlouva (≥2 investment markers) → no AML override,
 *      Priority 4 fires → investment/contract/investment_service_agreement
 * R04: pure leasing contract → leasing/contract/leasing_contract
 * R05: life insurance modelation with strong contract headers → docType flipped to contract
 * R06: pure Komisionářská scan → investment/contract/investment_service_agreement
 * R07: pure mandátní smlouva → investment/contract/investment_service_agreement
 * R08: pure obhospodařování smlouva → investment/contract/investment_service_agreement
 * R09: already investment/contract → no override (idempotent)
 * R10: DIP family with komisionářská keywords → no override (specific product wins)
 * R11: loan family with investment markers → no override
 * R12: non-life insurance family with investment markers → no override
 * R13: empty/short text → no override
 * R14: only 1 investment marker hit → no override (min-hits guard)
 * R15: LLM classified as consent_or_declaration (compliance family) → Priority 4 rescues
 * R16: LLM classified as life_insurance + 1 weak investment marker → no override
 *
 * Coverage matrix (applyRuleBasedClassificationOverride — V1 legacy):
 * V01: payment instruction rule fires
 * V02: komisionářská rule fires (kept for V1 backward compat)
 */

import { describe, it, expect } from "vitest";
import {
  applyRouterInputTextOverrides,
  applyRuleBasedClassificationOverride,
} from "@/lib/ai/document-classification-overrides";
import type { ClassificationResult } from "@/lib/ai/document-classification";

// ─── Text fixtures (raw Czech — overrides NFD-strip internally) ───────────────

const AML_TEXT = `
Formulář AML/FATCA
Identifikace klienta dle zákona č. 253/2008 Sb.
Prohlášení FATCA — daňová rezidence

Jméno: Jan Novák
Datum narození: 1.1.1980
Jste politicky exponovaná osoba? Ne
Původ peněžních prostředků: mzda / podnikatelská činnost
Legitimace zdroje prostředků: zaměstnání
`.trim().padEnd(300, " ");

const LIFE_INSURANCE_WITH_AML = `
Pojistná smlouva č. POL-12345
Pojistitel: Česká pojišťovna a.s.
Pojistník: Jan Novák, nar. 1.1.1980
Číslo pojistné smlouvy: POL-12345

Produkt: FORTE životní pojištění

Příloha AML/FATCA:
Identifikace klienta dle zákona č. 253/2008 Sb.
Prohlášení FATCA — daňová rezidence
Politicky exponovaná osoba: Ne
`.trim().padEnd(400, " ");

const KOMISIONARSKA_WITH_AML = `
Komisionářská smlouva č. KOM-99999
Smlouva o poskytování investičních služeb

Komisionář: Broker Partners a.s.
Klient: Jana Nováková, nar. 5.5.1985
Předmět smlouvy: obstarání koupě a prodeje cenných papírů

Příloha — FATCA a AML:
Prohlášení FATCA — daňová rezidence
Identifikace klienta dle zákona č. 253/2008 Sb.
Politicky exponovaná osoba: Ne
Původ peněžních prostředků: mzda, podnikání
`.trim().padEnd(400, " ");

const LEASING_TEXT = `
Leasingová smlouva č. LS-2024-001
ČSOB Leasing a.s.

Předmět leasingu: Škoda Octavia
Nájemce: Jan Novák
Pronajímatel: ČSOB Leasing a.s.
Financování vozidla: splátkový kalendář 48 měsíců
`.trim().padEnd(300, " ");

const LIFE_MODELATION_WITH_CONTRACT_HEADERS = `
Pojistná smlouva FLEXI č. 4444-CONTRACT
Pojistitel: Kooperativa pojišťovna a.s.
Číslo pojistné smlouvy: 4444-CONTRACT

Pojistník: Petr Svoboda
Produkt: FLEXI životní pojištění

(Modelace nabídky dokumentace)
`.trim().padEnd(300, " ");

const KOMISIONARSKA_PURE = `
Komisionářská smlouva č. KOM-10001

Komisionář: Broker Partners a.s.
Komitent (zájemce): Jan Novák
Předmět smlouvy: obstarání koupě a prodeje cenných papírů
Investiční služby: poskytování investičního poradenství k cenným papírům
`.trim().padEnd(300, " ");

const MANDATNI_PURE = `
Mandátní smlouva č. MAN-77777

Mandatář: Asset Management s.r.o.
Mandant: Jana Nováková
Předmět smlouvy: obhospodařování majetku klienta
Obhospodařování cenných papírů v rámci diskrečního mandátu
`.trim().padEnd(300, " ");

const OBHOSPODAROVANI_PURE = `
Smlouva o obhospodařování majetku č. OBH-88888

Správce: Conseq Investment Management a.s.
Klient: Petr Svoboda

Obhospodařování cenných papírů — diskreční strategie
Investiční služby dle zákona č. 256/2004 Sb.
`.trim().padEnd(300, " ");

const WEAK_KOMISIONARSKA_SINGLE_MARKER = `
Smlouva č. 123
Klient: Novák
Produkt: nějaký finanční produkt
Zmiňuje jednou investiční služby, ale nic víc.
`.trim().padEnd(300, " ");

const DIP_WITH_KOMISIONARSKA_KEYWORD = `
Smlouva o Dlouhodobém investičním produktu (DIP)
DIP účet č. 2024-111
Majitel DIP: Jan Novák

Zmínka: komisionářská smlouva je přílohou.
`.trim().padEnd(300, " ");

// ─── R01–R16: applyRouterInputTextOverrides ───────────────────────────────────

describe("applyRouterInputTextOverrides", () => {
  it("R01: pure AML form → compliance/consent_or_identification_document override", () => {
    const result = applyRouterInputTextOverrides(
      "unknown",
      "unknown",
      "unknown",
      AML_TEXT,
    );
    expect(result.overrideApplied).toBe(true);
    expect(result.productFamily).toBe("compliance");
    expect(result.documentType).toBe("consent_or_identification_document");
    expect(result.productSubtype).toBe("aml_kyc_form");
    expect(result.overrideReasons).toContain("aml_compliance_override");
  });

  it("R02: AML inside life insurance contract (≥2 insurance headers) → no override", () => {
    const result = applyRouterInputTextOverrides(
      "life_insurance",
      "contract",
      "flexi",
      LIFE_INSURANCE_WITH_AML,
    );
    expect(result.overrideApplied).toBe(false);
    expect(result.productFamily).toBe("life_insurance");
    expect(result.documentType).toBe("contract");
  });

  it("R03: AML inside Komisionářská smlouva → no AML override, Priority 4 promotes to investment_service_agreement", () => {
    const result = applyRouterInputTextOverrides(
      "compliance",
      "consent_or_identification_document",
      "aml_kyc_form",
      KOMISIONARSKA_WITH_AML,
    );
    expect(result.overrideApplied).toBe(true);
    expect(result.productFamily).toBe("investment");
    expect(result.documentType).toBe("contract");
    expect(result.productSubtype).toBe("investment_service_agreement");
    expect(result.overrideReasons).toContain("investment_service_agreement_override");
  });

  it("R04: pure leasing contract → leasing/contract override", () => {
    const result = applyRouterInputTextOverrides(
      "unknown",
      "contract",
      "unknown",
      LEASING_TEXT,
    );
    expect(result.overrideApplied).toBe(true);
    expect(result.productFamily).toBe("leasing");
    expect(result.documentType).toBe("contract");
    expect(result.productSubtype).toBe("leasing_contract");
    expect(result.overrideReasons).toContain("leasing_override");
  });

  it("R05: life insurance modelation + strong contract headers → docType flipped to contract", () => {
    const result = applyRouterInputTextOverrides(
      "life_insurance",
      "modelation",
      "flexi",
      LIFE_MODELATION_WITH_CONTRACT_HEADERS,
    );
    expect(result.overrideApplied).toBe(true);
    expect(result.productFamily).toBe("life_insurance");
    expect(result.documentType).toBe("contract");
    expect(result.overrideReasons).toContain("life_contract_modelation_correction");
  });

  it("R06: pure Komisionářská scan (LLM said consent_or_declaration) → investment_service_agreement", () => {
    const result = applyRouterInputTextOverrides(
      "compliance",
      "consent_or_identification_document",
      "unknown",
      KOMISIONARSKA_PURE,
    );
    expect(result.overrideApplied).toBe(true);
    expect(result.productFamily).toBe("investment");
    expect(result.documentType).toBe("contract");
    expect(result.productSubtype).toBe("investment_service_agreement");
    expect(result.overrideReasons).toContain("investment_service_agreement_override");
  });

  it("R07: pure mandátní smlouva → investment_service_agreement", () => {
    const result = applyRouterInputTextOverrides(
      "life_insurance",
      "contract",
      "unknown",
      MANDATNI_PURE,
    );
    expect(result.overrideApplied).toBe(true);
    expect(result.productFamily).toBe("investment");
    expect(result.documentType).toBe("contract");
    expect(result.productSubtype).toBe("investment_service_agreement");
  });

  it("R08: pure obhospodařování smlouva → investment_service_agreement", () => {
    const result = applyRouterInputTextOverrides(
      "generic_financial_product",
      "contract",
      "unknown",
      OBHOSPODAROVANI_PURE,
    );
    expect(result.overrideApplied).toBe(true);
    expect(result.productFamily).toBe("investment");
    expect(result.documentType).toBe("contract");
    expect(result.productSubtype).toBe("investment_service_agreement");
  });

  it("R09: already investment/contract → no override (idempotent)", () => {
    const result = applyRouterInputTextOverrides(
      "investment",
      "contract",
      "investment_service_agreement",
      KOMISIONARSKA_PURE,
    );
    expect(result.overrideApplied).toBe(false);
    expect(result.productFamily).toBe("investment");
    expect(result.documentType).toBe("contract");
  });

  it("R10: DIP family with komisionářská keyword → no override (specific product wins)", () => {
    const result = applyRouterInputTextOverrides(
      "dip",
      "contract",
      "unknown",
      DIP_WITH_KOMISIONARSKA_KEYWORD,
    );
    expect(result.overrideApplied).toBe(false);
    expect(result.productFamily).toBe("dip");
  });

  it("R11: loan family → no investment override (specific product wins)", () => {
    const result = applyRouterInputTextOverrides(
      "loan",
      "contract",
      "consumer_loan",
      KOMISIONARSKA_PURE,
    );
    expect(result.overrideApplied).toBe(false);
    expect(result.productFamily).toBe("loan");
  });

  it("R12: non-life insurance family → no investment override", () => {
    const result = applyRouterInputTextOverrides(
      "non_life_insurance",
      "contract",
      "household",
      KOMISIONARSKA_PURE,
    );
    expect(result.overrideApplied).toBe(false);
    expect(result.productFamily).toBe("non_life_insurance");
  });

  it("R13: empty/short text → no override", () => {
    const r1 = applyRouterInputTextOverrides("unknown", "unknown", "unknown", "");
    expect(r1.overrideApplied).toBe(false);
    const r2 = applyRouterInputTextOverrides("unknown", "unknown", "unknown", "short");
    expect(r2.overrideApplied).toBe(false);
  });

  it("R14: only 1 weak investment marker → no override (min-hits guard)", () => {
    const result = applyRouterInputTextOverrides(
      "life_insurance",
      "contract",
      "flexi",
      WEAK_KOMISIONARSKA_SINGLE_MARKER,
    );
    expect(result.overrideApplied).toBe(false);
  });

  it("R15: LLM classified as consent_or_declaration → Priority 4 rescues Komisionářská", () => {
    const result = applyRouterInputTextOverrides(
      "compliance",
      "consent_or_identification_document",
      "declaration",
      KOMISIONARSKA_PURE,
    );
    expect(result.overrideApplied).toBe(true);
    expect(result.productFamily).toBe("investment");
    expect(result.productSubtype).toBe("investment_service_agreement");
  });

  it("R16: life_insurance + 1 weak marker → no override (must stay life_insurance)", () => {
    const LIFE_WITH_WEAK_MARKER = `
      Pojistná smlouva FORTE č. 333
      Pojistitel: Allianz
      Pojistník: Jan Novák
      Číslo pojistné smlouvy: 333

      Produkt: životní pojištění
      Zmínka: jednou investiční služby.
    `.trim().padEnd(300, " ");
    const result = applyRouterInputTextOverrides(
      "life_insurance",
      "contract",
      "forte",
      LIFE_WITH_WEAK_MARKER,
    );
    expect(result.overrideApplied).toBe(false);
    expect(result.productFamily).toBe("life_insurance");
  });
});

// ─── V01–V02: applyRuleBasedClassificationOverride (V1 legacy) ────────────────

describe("applyRuleBasedClassificationOverride (legacy V1 path)", () => {
  const baseClassification: ClassificationResult = {
    primaryType: "generic_financial_document",
    subtype: "unknown",
    lifecycleStatus: "unknown",
    documentIntent: "reference_only",
    confidence: 0.5,
    reasons: [],
  };

  it("V01: payment instruction rule fires", () => {
    const result = applyRuleBasedClassificationOverride(
      baseClassification,
      "Platební instrukce\nIBAN: CZ6508000000192000145399\nVariabilní symbol: VS 123456\n",
    );
    expect(result.overrideApplied).toBe(true);
    expect(result.classification.primaryType).toBe("payment_instruction");
  });

  it("V02: komisionářská rule fires (V1 backward compat)", () => {
    const result = applyRuleBasedClassificationOverride(
      baseClassification,
      KOMISIONARSKA_PURE,
    );
    expect(result.overrideApplied).toBe(true);
    expect(result.classification.primaryType).toBe("investment_service_agreement");
    expect(result.classificationOverrideReason).toBe(
      "investment_service_agreement_komisionarska",
    );
  });
});
