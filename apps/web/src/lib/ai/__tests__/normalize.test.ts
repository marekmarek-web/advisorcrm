import { describe, it, expect } from "vitest";
import {
  normalizeWhitespace,
  normalizeLower,
  normalizeForCompare,
  normalizePhone,
  normalizeEmail,
  normalizePersonalId,
  normalizeCompanyId,
  normalizeName,
  normalizeAddress,
  normalizeDate,
} from "../normalize";

describe("normalize", () => {
  describe("normalizeWhitespace", () => {
    it("trims and collapses spaces", () => {
      expect(normalizeWhitespace("  a  b  c  ")).toBe("a b c");
      expect(normalizeWhitespace("")).toBe("");
      expect(normalizeWhitespace(null)).toBe("");
    });
  });

  describe("normalizeLower", () => {
    it("lowercases and trims", () => {
      expect(normalizeLower("  ABC  ")).toBe("abc");
    });
  });

  describe("normalizeForCompare", () => {
    it("removes diacritics and lowercases", () => {
      expect(normalizeForCompare("Příliš Žluťoučký")).toBe("prilis zlutoucky");
      expect(normalizeForCompare("  Čech  ")).toBe("cech");
    });
  });

  describe("normalizePhone", () => {
    it("keeps digits only, strips +420", () => {
      expect(normalizePhone("+420 123 456 789")).toBe("123456789");
      expect(normalizePhone("123 456 789")).toBe("123456789");
      expect(normalizePhone("")).toBe("");
    });
  });

  describe("normalizeEmail", () => {
    it("lowercases and trims", () => {
      expect(normalizeEmail("  User@Example.COM  ")).toBe("user@example.com");
    });
  });

  describe("normalizePersonalId", () => {
    it("digits only", () => {
      expect(normalizePersonalId("123 456 789")).toBe("123456789");
      expect(normalizePersonalId("123/456/789")).toBe("123456789");
    });
  });

  describe("normalizeCompanyId", () => {
    it("digits only, max 8", () => {
      expect(normalizeCompanyId("12345678")).toBe("12345678");
      expect(normalizeCompanyId("123 45 678")).toBe("12345678");
      expect(normalizeCompanyId("12345678901")).toBe("12345678");
    });
  });

  describe("normalizeName", () => {
    it("normalizes for compare", () => {
      expect(normalizeName("  Jan Novák  ")).toBe("jan novak");
    });
  });

  describe("normalizeAddress", () => {
    it("normalizes for compare", () => {
      expect(normalizeAddress("  Ulice 123, Praha  ")).toBe("ulice 123, praha");
    });
  });

  describe("normalizeDate", () => {
    it("returns YYYY-MM-DD when valid", () => {
      expect(normalizeDate("1990-01-15")).toBe("1990-01-15");
      expect(normalizeDate("19900115")).toBe("1990-01-15");
      expect(normalizeDate("")).toBe("");
    });
  });
});
