import { describe, it, expect } from "vitest";
import type { PortfolioAttributes } from "db";
import {
  mergeIdentityPortfolioFieldsFromExtracted,
  mergePortfolioAttributesWithPhase1Scalars,
} from "../portfolio-phase1-attributes";

describe("PortfolioAttributes type (db schema)", () => {
  it("includes Phase 1 identity + fund resolution fields", () => {
    const attrs: PortfolioAttributes = {
      idCardNumber: "1",
      resolvedFundCategory: "equity",
      fvSourceType: "heuristic-fallback",
    };
    expect(attrs.fvSourceType).toBe("heuristic-fallback");
  });
});

describe("mergeIdentityPortfolioFieldsFromExtracted", () => {
  it("maps OP fields from extractedFields cells", () => {
    const extracted = {
      extractedFields: {
        idCardNumber: { value: "OP213038282", status: "extracted" },
        idCardIssuedBy: { value: "MěÚ Praha 4", status: "extracted" },
        idCardValidUntil: { value: "04.06.2031", status: "extracted" },
        idCardIssuedAt: { value: "15.01.2020", status: "extracted" },
      },
    };
    const out = mergeIdentityPortfolioFieldsFromExtracted(extracted);
    expect(out.idCardNumber).toBe("OP213038282");
    expect(out.idCardIssuedBy).toBe("MěÚ Praha 4");
    expect(out.idCardValidUntil).toBeDefined();
    expect(out.idCardIssuedAt).toBeDefined();
  });

  it("does not invent values when absent", () => {
    expect(mergeIdentityPortfolioFieldsFromExtracted({ extractedFields: {} })).toEqual({});
    expect(mergeIdentityPortfolioFieldsFromExtracted(null)).toEqual({});
  });
});

describe("mergePortfolioAttributesWithPhase1Scalars", () => {
  it("preserves previous identity when next is empty", () => {
    const prev = { idCardNumber: "123", resolvedFundId: "fund_a" };
    const next = { generalPractitioner: "MUDr. X" };
    const merged = mergePortfolioAttributesWithPhase1Scalars(prev, next);
    expect(merged.idCardNumber).toBe("123");
    expect(merged.resolvedFundId).toBe("fund_a");
    expect(merged.generalPractitioner).toBe("MUDr. X");
  });
});
