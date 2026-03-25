import { describe, it, expect } from "vitest";
import {
  INSTITUTION_PROFILES,
  getInstitutionProfile,
  getInstitutionApplyRules,
  getInstitutionExtractionHints,
  detectInstitutionFromText,
  getAllInstitutions,
} from "../institution-rules";

describe("institution-rules", () => {
  describe("INSTITUTION_PROFILES", () => {
    it("has at least 5 institutions", () => {
      expect(INSTITUTION_PROFILES.length).toBeGreaterThanOrEqual(5);
    });

    it("all profiles have required fields", () => {
      for (const profile of INSTITUTION_PROFILES) {
        expect(profile.code).toBeTruthy();
        expect(profile.canonicalName).toBeTruthy();
        expect(profile.aliases).toBeInstanceOf(Array);
        expect(profile.documentMarkers).toBeInstanceOf(Array);
        expect(profile.paymentConventions).toBeDefined();
        expect(typeof profile.alwaysRequireHumanReview).toBe("boolean");
        expect(profile.country).toBeTruthy();
      }
    });

    it("contains Czech institutions", () => {
      const codes = INSTITUTION_PROFILES.map((p) => p.code);
      expect(codes).toContain("CPOJ");
      expect(codes).toContain("KOOP");
      expect(codes).toContain("ALLIANZ");
    });
  });

  describe("getInstitutionProfile", () => {
    it("finds by canonical name", () => {
      const profile = getInstitutionProfile("Česká pojišťovna");
      expect(profile).not.toBeNull();
      expect(profile?.code).toBe("CPOJ");
    });

    it("finds by alias (exact)", () => {
      const profile = getInstitutionProfile("Kooperativa");
      expect(profile).not.toBeNull();
      expect(profile?.code).toBe("KOOP");
    });

    it("finds by alias with different casing", () => {
      const profile = getInstitutionProfile("allianz");
      expect(profile).not.toBeNull();
      expect(profile?.code).toBe("ALLIANZ");
    });

    it("finds by diacritics-free name", () => {
      const profile = getInstitutionProfile("Ceska pojistovna");
      expect(profile).not.toBeNull();
      expect(profile?.code).toBe("CPOJ");
    });

    it("returns null for unknown institution", () => {
      const profile = getInstitutionProfile("Unknown Insurance Company XYZ");
      expect(profile).toBeNull();
    });

    it("finds MetLife", () => {
      const profile = getInstitutionProfile("MetLife");
      expect(profile).not.toBeNull();
      expect(profile?.code).toBe("METLIFE");
      expect(profile?.alwaysRequireHumanReview).toBe(true);
    });
  });

  describe("getInstitutionApplyRules", () => {
    it("returns strict rules for MetLife", () => {
      const rules = getInstitutionApplyRules("METLIFE");
      expect(rules.applyStrictness).toBe("strict");
      expect(rules.requireHumanReviewAlways).toBe(true);
      expect(rules.minExtractionConfidence).toBeGreaterThan(0.5);
    });

    it("returns default rules for unknown institution", () => {
      const rules = getInstitutionApplyRules("UNKNOWN");
      expect(rules.applyStrictness).toBe("medium");
      expect(rules.requireHumanReviewAlways).toBe(false);
      expect(rules.institutionCode).toBe("UNKNOWN");
    });

    it("returns default rules for standard institutions", () => {
      const rules = getInstitutionApplyRules("CPOJ");
      expect(rules.applyStrictness).toBe("medium");
    });
  });

  describe("getInstitutionExtractionHints", () => {
    it("returns hints for known institution", () => {
      const hints = getInstitutionExtractionHints("CPOJ");
      expect(hints.institutionCode).toBe("CPOJ");
    });

    it("returns hints for unknown institution", () => {
      const hints = getInstitutionExtractionHints("UNKNOWN");
      expect(hints.institutionCode).toBe("UNKNOWN");
    });
  });

  describe("detectInstitutionFromText", () => {
    it("detects Česká pojišťovna from document text", () => {
      const profile = detectInstitutionFromText("Smlouva o pojisteni uzavrana s Česká pojišťovna a.s.");
      expect(profile).not.toBeNull();
      expect(profile?.code).toBe("CPOJ");
    });

    it("detects Kooperativa from document text", () => {
      const profile = detectInstitutionFromText("Vydáno společností Kooperativa pojišťovna, a.s.");
      expect(profile).not.toBeNull();
      expect(profile?.code).toBe("KOOP");
    });

    it("detects by website marker", () => {
      const profile = detectInstitutionFromText("Kontaktujte nás na www.kooperativa.cz");
      expect(profile).not.toBeNull();
    });

    it("returns null when no institution is found", () => {
      const profile = detectInstitutionFromText("Random text without any institution names");
      expect(profile).toBeNull();
    });
  });

  describe("getAllInstitutions", () => {
    it("returns all institutions", () => {
      const all = getAllInstitutions();
      expect(all.length).toBe(INSTITUTION_PROFILES.length);
    });

    it("returns a copy", () => {
      const all = getAllInstitutions();
      all.push({} as any);
      expect(getAllInstitutions().length).toBe(INSTITUTION_PROFILES.length);
    });
  });
});
