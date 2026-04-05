import { describe, expect, it } from "vitest";
import { getFaFundDetailForReport, getFaFundPlanningRateDecimal, getFaFundLogoUrl } from "../fa-fund-bridge";
import { reconcileFaInvestmentsWithSnapshot, buildFaInvestmentTemplate } from "../fa-investment-rows";
import { normalizePersistedInvestmentEntries } from "@/lib/analyses/financial/saveLoad";
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

  it("getFaFundLogoUrl: prázdný vstup → undefined", () => {
    expect(getFaFundLogoUrl("")).toBeUndefined();
    expect(getFaFundLogoUrl("   ")).toBeUndefined();
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
});
