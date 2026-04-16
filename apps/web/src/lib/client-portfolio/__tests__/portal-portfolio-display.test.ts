import { describe, expect, it } from "vitest";
import {
  dedupeSemicolonSeparatedPhrases,
  canonicalPortfolioDetailRows,
  canonicalPortfolioDetailRowsForClientPortfolioCard,
  resolvePortalProductDisplayLogo,
} from "../portal-portfolio-display";
import { mapContractToCanonicalProduct } from "../canonical-contract-read";

describe("portal-portfolio-display", () => {
  it("dedupeSemicolonSeparatedPhrases removes repeated segments in one line", () => {
    const a = "Smrt: 50 000 Kč; Invalidita: 5M; Smrt: 50 000 Kč; Invalidita: 5M";
    expect(dedupeSemicolonSeparatedPhrases(a)).toBe("Smrt: 50 000 Kč; Invalidita: 5M");
  });

  it("canonicalPortfolioDetailRows for ŽP includes contract, persons with RČ/OP, lékař", () => {
    const product = mapContractToCanonicalProduct({
      id: "c1",
      contactId: "k1",
      segment: "ZP",
      type: "ZP",
      partnerId: null,
      productId: null,
      partnerName: "UNIQA",
      productName: "Život & radost",
      premiumAmount: "1532",
      premiumAnnual: null,
      contractNumber: "8800279286",
      startDate: "2025-03-20",
      anniversaryDate: null,
      note: null,
      visibleToClient: true,
      portfolioStatus: "active",
      sourceKind: "ai_review",
      portfolioAttributes: {
        generalPractitioner: "MUDr. Test",
        idCardNumber: "OP111",
        persons: [{ role: "policyholder", name: "Jan Test", personalId: "850505/1234", idCardNumber: "OP222" }],
        risks: [{ label: "Smrt", amount: "50 000 Kč" }],
      },
    });
    const rows = canonicalPortfolioDetailRows(product);
    expect(rows.some((r) => r.label === "Číslo smlouvy" && r.value === "8800279286")).toBe(true);
    expect(rows.some((r) => r.label === "Praktický lékař" && r.value === "MUDr. Test")).toBe(true);
    expect(rows.some((r) => r.label === "Číslo dokladu (OP/pas)" && r.value === "OP111")).toBe(true);
    const personRow = rows.find((r) => r.label === "Osoba (Pojistník)");
    expect(personRow?.value).toContain("Jan Test");
    expect(personRow?.value).toContain("rodné číslo 850505/1234");
    expect(personRow?.value).toContain("č. dokladu: OP222");
  });

  it("canonicalPortfolioDetailRowsForClientPortfolioCard skryje krytí, OP, lékaře a typ produktu", () => {
    const product = mapContractToCanonicalProduct({
      id: "c1",
      contactId: "k1",
      segment: "ZP",
      type: "ZP",
      partnerId: null,
      productId: null,
      partnerName: "UNIQA",
      productName: "Život & radost",
      premiumAmount: "1532",
      premiumAnnual: null,
      contractNumber: "8800279286",
      startDate: "2025-03-20",
      anniversaryDate: null,
      note: null,
      visibleToClient: true,
      portfolioStatus: "active",
      sourceKind: "ai_review",
      portfolioAttributes: {
        generalPractitioner: "MUDr. Test",
        idCardNumber: "OP111",
        persons: [{ role: "policyholder", name: "Jan Test", personalId: "850505/1234", idCardNumber: "OP222" }],
        risks: [{ label: "Smrt", amount: "50 000 Kč" }],
      },
    });
    const rows = canonicalPortfolioDetailRowsForClientPortfolioCard(product);
    expect(rows.some((r) => r.label === "Pojistné krytí")).toBe(false);
    expect(rows.some((r) => r.label === "Praktický lékař")).toBe(false);
    expect(rows.some((r) => r.label === "Číslo dokladu (OP/pas)")).toBe(false);
    expect(rows.some((r) => r.label === "Typ produktu")).toBe(false);
    expect(rows.some((r) => r.label === "Číslo smlouvy")).toBe(true);
    expect(rows.some((r) => r.label.startsWith("Osoba ("))).toBe(true);
  });

  it("resolvePortalProductDisplayLogo maps ŽP partner to institution asset", () => {
    const product = mapContractToCanonicalProduct({
      id: "c1",
      contactId: "k1",
      segment: "ZP",
      type: "ZP",
      partnerId: null,
      productId: null,
      partnerName: "UNIQA pojišťovna, a.s.",
      productName: "Život & radost",
      premiumAmount: "1532",
      premiumAnnual: null,
      contractNumber: "8800279286",
      startDate: "2025-03-20",
      anniversaryDate: null,
      note: null,
      visibleToClient: true,
      portfolioStatus: "active",
      sourceKind: "ai_review",
      portfolioAttributes: {},
    });
    const logo = resolvePortalProductDisplayLogo(product);
    expect(logo?.src).toBe("/logos/uniqa.png");
    expect(logo?.alt).toContain("UNIQA");
  });

  it("resolvePortalProductDisplayLogo maps INV institution when fund library has no logo", () => {
    const product = mapContractToCanonicalProduct({
      id: "c2",
      contactId: "k1",
      segment: "INV",
      type: "INV",
      partnerId: null,
      productId: null,
      partnerName: "AMUNDI",
      productName: "AMUNDI PLATFORMA Pokyn k jednorázové investici",
      premiumAmount: null,
      premiumAnnual: "600000",
      contractNumber: null,
      startDate: null,
      anniversaryDate: null,
      note: null,
      visibleToClient: true,
      portfolioStatus: "in_records",
      sourceKind: "manual",
      portfolioAttributes: {
        resolvedFundId: null,
        resolvedFundCategory: null,
        fvSourceType: null,
      },
    });
    const logo = resolvePortalProductDisplayLogo(product);
    expect(logo?.src).toBe("/logos/amundi-logo.png");
    expect(logo?.alt).toContain("Amundi");
  });

  it("resolvePortalProductDisplayLogo prefers mapped institution over committed fund logo for INV", () => {
    const product = mapContractToCanonicalProduct({
      id: "c3",
      contactId: "k1",
      segment: "INV",
      type: "INV",
      partnerId: null,
      productId: null,
      partnerName: "AMUNDI",
      productName: "Jednorázová investice",
      premiumAmount: null,
      premiumAnnual: "600000",
      contractNumber: null,
      startDate: null,
      anniversaryDate: null,
      note: null,
      visibleToClient: true,
      portfolioStatus: "active",
      sourceKind: "manual",
      portfolioAttributes: {
        resolvedFundId: "ishares_core_msci_world",
        resolvedFundCategory: "equity",
        fvSourceType: "fund-library",
      },
    });
    const logo = resolvePortalProductDisplayLogo(product);
    expect(logo?.src).toBe("/logos/amundi-logo.png");
  });

  it("resolvePortalProductDisplayLogo ignores resolvedFundId for ŽP (žádné logo fondu)", () => {
    const product = mapContractToCanonicalProduct({
      id: "c4",
      contactId: "k1",
      segment: "ZP",
      type: "ZP",
      partnerId: null,
      productId: null,
      partnerName: "UNIQA pojišťovna, a.s.",
      productName: "Život & radost",
      premiumAmount: "1532",
      premiumAnnual: null,
      contractNumber: "8800279286",
      startDate: "2025-03-20",
      anniversaryDate: null,
      note: null,
      visibleToClient: true,
      portfolioStatus: "active",
      sourceKind: "ai_review",
      portfolioAttributes: {
        resolvedFundId: "ishares_core_msci_world",
      },
    });
    const logo = resolvePortalProductDisplayLogo(product);
    expect(logo?.src).toBe("/logos/uniqa.png");
  });
});
