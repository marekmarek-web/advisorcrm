import { describe, expect, it } from "vitest";
import { BASE_FUNDS } from "../base-funds";
import {
  fundHasFullyCommittedVisualPack,
  fundUsesBrandLogoPath,
} from "../fund-report-asset-resolver";
import { BASE_FUND_KEYS, type BaseFundKey } from "../legacy-fund-key-map";
import { FA_INVESTMENT_TYPES_BY_KEY } from "../fa-investment-rows";
import { getFaFundDetailForReport } from "../fa-fund-bridge";

describe("fund catalog integrity (Batch A–D integration)", () => {
  it("BASE_FUNDS má unikátní baseFundKey", () => {
    const keys = BASE_FUNDS.map((f) => f.baseFundKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("každý BASE_FUND_KEYS je v katalogu", () => {
    const set = new Set(BASE_FUNDS.map((f) => f.baseFundKey));
    for (const k of BASE_FUND_KEYS) {
      expect(set.has(k), `Chybí v BASE_FUNDS: ${k}`).toBe(true);
    }
  });

  it("FA_INVESTMENT_TYPES_BY_KEY pokrývá všechny BaseFundKey", () => {
    for (const k of BASE_FUND_KEYS) {
      const modes = FA_INVESTMENT_TYPES_BY_KEY[k as BaseFundKey];
      expect(modes?.length ?? 0, `FA_INVESTMENT_TYPES_BY_KEY[${k}]`).toBeGreaterThan(0);
    }
  });

  it("žádný duplicitní displayName+provider jako proxy kolize (volitelná kontrola)", () => {
    const seen = new Map<string, string>();
    for (const f of BASE_FUNDS) {
      const label = `${f.displayName.trim().toLowerCase()}|${f.provider.trim().toLowerCase()}`;
      const existing = seen.get(label);
      expect(existing, `Možná duplicita názvu: ${label} (${existing} vs ${f.baseFundKey})`).toBeUndefined();
      seen.set(label, f.baseFundKey);
    }
  });

  it("každý fond má logo, hero a přesně 3 položky galerie (normalizované cesty)", () => {
    for (const f of BASE_FUNDS) {
      const a = f.assets;
      expect(a.logoPath?.trim().length ?? 0, f.baseFundKey).toBeGreaterThan(0);
      expect(a.heroPath?.trim().length ?? 0, f.baseFundKey).toBeGreaterThan(0);
      expect(a.galleryPaths?.length, f.baseFundKey).toBe(3);
      for (const g of a.galleryPaths ?? []) {
        expect(g?.startsWith("/"), `${f.baseFundKey} gallery ${g}`).toBe(true);
      }
    }
  });

  it("HTML/PDF detail: kanonický klíč má hero + 3× galerie (merge z katalogu)", () => {
    for (const f of BASE_FUNDS) {
      const d = getFaFundDetailForReport(f.baseFundKey);
      expect(d, f.baseFundKey).toBeDefined();
      expect(d?.heroImage?.trim().length ?? 0, f.baseFundKey).toBeGreaterThan(0);
      expect(d?.galleryImages?.length, f.baseFundKey).toBe(3);
    }
  });

  it("legacy productKey bez katalogu: getFaFundDetailForReport doplní hero + galerii (fallback)", () => {
    const d = getFaFundDetailForReport("ishares");
    expect(d).toBeDefined();
    expect(d?.heroImage?.trim().length ?? 0).toBeGreaterThan(0);
    expect(d?.galleryImages?.length).toBe(3);
  });

  it("aktuálně žádný fond nemá plně „brand“ vizuály (logo+hero+galerie mimo placeholder) — až po commitu assetů", () => {
    const full = BASE_FUNDS.filter((f) => fundHasFullyCommittedVisualPack(f.assets));
    expect(full.length, `Kompletní pack: ${full.map((x) => x.baseFundKey).join(", ")}`).toBe(0);
  });

  it("Batch B/C: brand logo v repu, hero/galerie zatím placeholdery", () => {
    const keysWithBrandLogo = BASE_FUNDS.filter((f) => fundUsesBrandLogoPath(f.assets.logoPath)).map(
      (f) => f.baseFundKey,
    );
    expect(keysWithBrandLogo.length).toBe(8);
  });
});
