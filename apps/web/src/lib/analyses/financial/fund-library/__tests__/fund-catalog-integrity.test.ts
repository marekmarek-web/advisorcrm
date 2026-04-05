import { describe, expect, it } from "vitest";
import { BASE_FUNDS } from "../base-funds";
import { BASE_FUND_KEYS, type BaseFundKey } from "../legacy-fund-key-map";
import { FA_INVESTMENT_TYPES_BY_KEY } from "../fa-investment-rows";

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
});
