import { describe, expect, it } from "vitest";
import { getFaFundDetailForReport, getFaFundPlanningRateDecimal, getFaFundLogoUrl } from "../fa-fund-bridge";
import { FUND_PLACEHOLDER_LOGO_PATH } from "../fund-report-asset-resolver";
import { reconcileFaInvestmentsWithSnapshot, buildFaInvestmentTemplate } from "../fa-investment-rows";
import { normalizePersistedInvestmentEntries } from "@/lib/analyses/financial/normalize-persisted-investment-entries";
import { getProductName } from "@/lib/analyses/financial/formatters";
import { mapLegacyFundKey, isRemovedLegacyFundKey } from "../legacy-fund-key-map";
import { getBaseFundFromProductKey } from "../helpers";
import type { FundLibrarySetupSnapshot } from "@/lib/fund-library/fund-library-setup-types";
import type { InvestmentEntry } from "@/lib/analyses/financial/types";

const EMPTY_SNAPSHOT: FundLibrarySetupSnapshot = {
  canEditTenantAllowlist: false,
  tenantAllowlist: { allowedBaseFundKeys: null },
  advisorPrefs: { order: [], enabled: {} },
  effectiveAllowedKeys: [],
  catalog: [],
};

describe("fund library release hardening — edge cases", () => {
  it("normalizePersistedInvestmentEntries: legacy ishares → canonical, alternative vyhodí", () => {
    const rows: InvestmentEntry[] = [
      {
        id: 1,
        productKey: "ishares",
        type: "monthly",
        amount: 100,
        years: 10,
        annualRate: 0.1,
        computed: { fv: 0 },
      },
      {
        id: 2,
        productKey: "alternative",
        type: "lump",
        amount: 1,
        years: 5,
        annualRate: 0.1,
        computed: { fv: 0 },
      },
    ];
    const out = normalizePersistedInvestmentEntries(rows);
    expect(out).toHaveLength(1);
    expect(out[0]?.productKey).toBe("ishares_core_msci_world");
  });

  it("reconcile: prázdný effectiveAllowedKeys → prázdné investice", () => {
    const current: InvestmentEntry[] = [
      {
        id: 1,
        productKey: "ishares_core_msci_world",
        type: "monthly",
        amount: 5000,
        years: 20,
        annualRate: 0.12,
        computed: { fv: 1 },
      },
    ];
    const out = reconcileFaInvestmentsWithSnapshot(current, EMPTY_SNAPSHOT, false);
    expect(out).toEqual([]);
  });

  it("buildFaInvestmentTemplate: prázdný snapshot → []", () => {
    expect(buildFaInvestmentTemplate(EMPTY_SNAPSHOT, false)).toEqual([]);
  });

  it("getFaFundPlanningRateDecimal: neznámý klíč → výchozí 7 %", () => {
    expect(getFaFundPlanningRateDecimal("totally_unknown_fund")).toBe(0.07);
  });

  it("getFaFundLogoUrl: prázdný vstup → generický placeholder (žádný broken img)", () => {
    expect(getFaFundLogoUrl("")).toBe(FUND_PLACEHOLDER_LOGO_PATH);
    expect(getFaFundLogoUrl("   ")).toBe(FUND_PLACEHOLDER_LOGO_PATH);
  });

  it("getFaFundDetailForReport: prázdný vstup → undefined", () => {
    expect(getFaFundDetailForReport("")).toBeUndefined();
  });

  it("getFaFundDetailForReport: kanonický fond bez chyby (null performance / assets v katalogu)", () => {
    const d = getFaFundDetailForReport("penta");
    expect(d).toBeDefined();
    expect(d?.name?.length).toBeGreaterThan(0);
    expect(d?.defaultRate).toBeGreaterThan(0);
  });

  it("QA: World ETF aliasy → iShares Core MSCI World (kanonický klíč)", () => {
    expect(mapLegacyFundKey("world_etf")).toBe("ishares_core_msci_world");
    expect(mapLegacyFundKey("World ETF")).toBe("ishares_core_msci_world");
    expect(mapLegacyFundKey("msci_world")).toBe("ishares_core_msci_world");
    expect(mapLegacyFundKey("ishares")).toBe("ishares_core_msci_world");
    expect(getBaseFundFromProductKey("world_etf")?.baseFundKey).toBe("ishares_core_msci_world");
    expect(getProductName("world_etf")).toContain("MSCI World");
  });

  it("QA: CREIF legacy + detail pro report", () => {
    expect(mapLegacyFundKey("creif")).toBe("creif");
    const d = getFaFundDetailForReport("creif");
    expect(d).toBeDefined();
    expect(d?.heroImage?.length).toBeGreaterThan(0);
    expect(d?.galleryImages?.length).toBe(3);
  });

  it("QA: odstraněné legacy klíče se nevracejí do katalogu", () => {
    for (const k of ["alternative", "AlgoImperial", "imperial", "algo_imperial"]) {
      expect(mapLegacyFundKey(k)).toBeNull();
      expect(isRemovedLegacyFundKey(k)).toBe(true);
      expect(getBaseFundFromProductKey(k)).toBeUndefined();
    }
    expect(getFaFundDetailForReport("alternative")).toBeUndefined();
    expect(getFaFundLogoUrl("alternative")).toBe(FUND_PLACEHOLDER_LOGO_PATH);
  });
});
