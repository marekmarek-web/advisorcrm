import { describe, it, expect } from "vitest";
import {
  resolveFund,
  resolveFundFromPortfolioAttributes,
} from "@/lib/fund-library/fund-resolution";

describe("fund-resolution", () => {
  describe("resolveFund", () => {
    it("returns null for empty inputs", () => {
      const result = resolveFund(null, null, null);
      expect(result.resolvedFundId).toBeNull();
      expect(result.resolvedFundCategory).toBeNull();
      expect(result.fvSourceType).toBeNull();
    });

    it("matches fund by displayName (case-insensitive)", () => {
      const result = resolveFund("Investika Realitní Fond", null, null);
      expect(result.resolvedFundId).toBe("investika_realitni_fond");
      expect(result.fvSourceType).toBe("fund-library");
    });

    it("matches fund by partial name inclusion", () => {
      const result = resolveFund("iShares Core MSCI World", null, null);
      expect(result.resolvedFundId).toBe("ishares_core_msci_world");
      expect(result.fvSourceType).toBe("fund-library");
    });

    it("falls back to heuristic category for unknown equity fund", () => {
      const result = resolveFund("Amundi CR Akciový fond", null, null);
      expect(result.resolvedFundId).toBeNull();
      expect(result.resolvedFundCategory).toBe("equity");
      expect(result.fvSourceType).toBe("heuristic-fallback");
    });

    it("falls back to real_estate for nemovitostní fond", () => {
      const result = resolveFund("Nemovitostní OPF ABC", null, null);
      expect(result.resolvedFundId).toBeNull();
      expect(result.resolvedFundCategory).toBe("real_estate");
      expect(result.fvSourceType).toBe("heuristic-fallback");
    });

    it("classifies balanced from strategy when name is ambiguous", () => {
      const result = resolveFund("Můj fond", null, "Vyvážená strategie");
      expect(result.resolvedFundCategory).toBe("balanced");
      expect(result.fvSourceType).toBe("heuristic-fallback");
    });

    it("classifies generic dynamic strategy as equity-rate fallback (8 % p.a.)", () => {
      const result = resolveFund("Můj fond", null, "Dynamická strategie");
      expect(result.resolvedFundCategory).toBe("equity");
      expect(result.fvSourceType).toBe("heuristic-fallback");
    });

    it("classifies conservative fund", () => {
      const result = resolveFund("Konzervativní fond pojistovny XY", null, null);
      expect(result.resolvedFundCategory).toBe("conservative");
      expect(result.fvSourceType).toBe("heuristic-fallback");
    });

    it("classifies bond fund", () => {
      const result = resolveFund("Dluhopisový fond Conseq", null, null);
      expect(result.resolvedFundCategory).toBe("bond");
      expect(result.fvSourceType).toBe("heuristic-fallback");
    });

    it("returns null fvSourceType when nothing can be determined", () => {
      const result = resolveFund("Neznámý produkt 123", null, null);
      expect(result.fvSourceType).toBeNull();
    });
  });

  describe("resolveFundFromPortfolioAttributes", () => {
    it("resolves from investmentFunds array", () => {
      const attrs = {
        investmentFunds: [{ name: "Investika Realitní Fond", isin: undefined }],
        investmentStrategy: "Dynamický",
      };
      const result = resolveFundFromPortfolioAttributes(attrs);
      expect(result.resolvedFundId).toBe("investika_realitni_fond");
      expect(result.fvSourceType).toBe("fund-library");
    });

    it("falls back to strategy when no funds", () => {
      const attrs = {
        investmentStrategy: "Akciová",
      };
      const result = resolveFundFromPortfolioAttributes(attrs);
      expect(result.resolvedFundCategory).toBe("equity");
      expect(result.fvSourceType).toBe("heuristic-fallback");
    });

    it("returns null for empty attributes", () => {
      const result = resolveFundFromPortfolioAttributes({});
      expect(result.resolvedFundId).toBeNull();
      expect(result.fvSourceType).toBeNull();
    });
  });
});
