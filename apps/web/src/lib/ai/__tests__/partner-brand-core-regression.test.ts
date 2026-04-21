/**
 * Regression pro normalizaci partnerského jména před DB lookupem.
 *
 * Původní bug: `ilike(partners.name, "ČSOB Pojišťovna, a. s., člen holdingu ČSOB")`
 * nikdy nematchovalo `partners.name = "ČSOB Pojišťovna"` (ILIKE bez wildcards je
 * case-insensitive EXACT match). Fuzzy resolver nyní nejdřív normalizuje vstup
 * na "brand core" a teprve poté dělá `ILIKE %core%`.
 */

import { describe, expect, it } from "vitest";
import { __test__ } from "../apply-contract-review";

const { normalizePartnerBrandCore } = __test__;

describe("normalizePartnerBrandCore — insurer name → brand core", () => {
  it("ČSOB Pojišťovna s přívěskem holding", () => {
    expect(normalizePartnerBrandCore("ČSOB Pojišťovna, a. s., člen holdingu ČSOB")).toBe(
      "ČSOB Pojišťovna"
    );
  });

  it("ČSOB Pojišťovna krátký tvar bez mezer", () => {
    expect(normalizePartnerBrandCore("ČSOB Pojišťovna, a.s.")).toBe("ČSOB Pojišťovna");
  });

  it("Generali Česká pojišťovna a.s.", () => {
    expect(normalizePartnerBrandCore("Generali Česká pojišťovna a.s.")).toBe(
      "Generali Česká pojišťovna"
    );
  });

  it("UNIQA pojišťovna, a.s.", () => {
    expect(normalizePartnerBrandCore("UNIQA pojišťovna, a.s.")).toBe("UNIQA pojišťovna");
  });

  it("NN Životní pojišťovna beze změny", () => {
    expect(normalizePartnerBrandCore("NN Životní pojišťovna")).toBe("NN Životní pojišťovna");
  });

  it("odstraní prefix 'Pojistitel:'", () => {
    expect(normalizePartnerBrandCore("Pojistitel: ČSOB Pojišťovna, a.s.")).toBe(
      "ČSOB Pojišťovna"
    );
  });

  it("s.r.o. právní forma", () => {
    expect(normalizePartnerBrandCore("Atris s.r.o.")).toBe("Atris");
  });

  it("prázdný vstup", () => {
    expect(normalizePartnerBrandCore("")).toBe("");
    expect(normalizePartnerBrandCore("   ")).toBe("");
  });

  it("ořízne trailing čárku a vícenásobný whitespace", () => {
    expect(normalizePartnerBrandCore("  Allianz   pojišťovna ,  ")).toBe("Allianz pojišťovna");
  });
});
