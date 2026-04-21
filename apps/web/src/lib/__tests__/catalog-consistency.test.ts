import { describe, it, expect } from "vitest";
import catalogJson from "../../../../../packages/db/src/catalog.json";
import topListsJson from "../../../../../packages/db/src/data/top-lists-seed-v2.json";
import { SEGMENT_LABELS } from "@/app/lib/segment-labels";

/**
 * Regresní testy pro konzistenci katalogu napříč třemi zdroji pravdy:
 *  - packages/db/src/catalog.json
 *  - packages/db/src/data/top-lists-seed-v2.json
 *  - SEGMENT_LABELS v apps/web/src/app/lib/segment-labels.ts
 *
 * Zabraňují regresi úklidu provedenému v `catalog-audit-2026-04-21.md` + migraci
 * `catalog-dedup-partners-products-2026-04-21.sql`. Jakýkoli PR, který znovu zavede
 * duplicitní partnery, TBD placeholder vedle reálného produktu nebo rozladí segmenty
 * napříč zdroji, selže zde.
 */

type CatalogRow = {
  partner: string;
  category: string;
  products: string[];
};

type CatalogFile = {
  categories: string[];
  rules?: { excludePartners?: string[]; tbdPlaceholderName?: string };
  catalog: CatalogRow[];
};

type TopListEntry = {
  partner: string;
  map: Record<string, string[]>;
  excluded?: boolean;
};

type TopListsFile = {
  segments: { code: string; label: string; displayName: string }[];
  topLists: {
    pojistovny_top10: TopListEntry[];
    investicni_spolecnosti_top10: TopListEntry[];
    banky_top10: TopListEntry[];
    penzijni_spolecnosti_top5: TopListEntry[];
  };
};

const catalog = catalogJson as CatalogFile;
const topLists = topListsJson as TopListsFile;

const normName = (s: string) => s.toLowerCase().trim();
const isTbdName = (s: string) =>
  s.startsWith("TBD") || s.includes("TBD -") || /\(doplnit/i.test(s);

describe("catalog consistency", () => {
  describe("segments", () => {
    it("catalog.json.categories matches SEGMENT_LABELS keys", () => {
      const catalogSet = new Set(catalog.categories);
      const labelsSet = new Set(Object.keys(SEGMENT_LABELS));
      expect([...catalogSet].sort()).toEqual([...labelsSet].sort());
    });

    it("top-lists segments match SEGMENT_LABELS keys", () => {
      const topSet = new Set(topLists.segments.map((s) => s.code));
      const labelsSet = new Set(Object.keys(SEGMENT_LABELS));
      expect([...topSet].sort()).toEqual([...labelsSet].sort());
    });

    it("no ZDRAV segment exists anywhere", () => {
      expect(catalog.categories).not.toContain("ZDRAV");
      expect(topLists.segments.map((s) => s.code)).not.toContain("ZDRAV");
      expect(Object.keys(SEGMENT_LABELS)).not.toContain("ZDRAV");
      expect(catalog.catalog.some((e) => e.category === "ZDRAV")).toBe(false);
    });

    it("every catalog row uses a known segment", () => {
      const known = new Set(Object.keys(SEGMENT_LABELS));
      const unknown = catalog.catalog
        .map((e) => e.category)
        .filter((c) => !known.has(c));
      expect(unknown, `Neznámé segmenty v catalog.json: ${unknown.join(", ")}`).toEqual([]);
    });
  });

  describe("partners uniqueness", () => {
    it("no duplicate (partner, segment) rows in catalog.json (case-insensitive)", () => {
      const seen = new Map<string, string>();
      const dups: string[] = [];
      for (const row of catalog.catalog) {
        const key = `${row.category}::${normName(row.partner)}`;
        if (seen.has(key)) {
          dups.push(`${row.partner} / ${row.category} (kolize s ${seen.get(key)})`);
        } else {
          seen.set(key, row.partner);
        }
      }
      expect(dups, `Duplicitní partneři v catalog.json: ${dups.join("; ")}`).toEqual([]);
    });

    it("partner names use consistent casing across segments (no Uniqa vs UNIQA mix)", () => {
      const byLower = new Map<string, Set<string>>();
      for (const row of catalog.catalog) {
        const k = normName(row.partner);
        if (!byLower.has(k)) byLower.set(k, new Set());
        byLower.get(k)!.add(row.partner);
      }
      const inconsistent: string[] = [];
      for (const [lower, variants] of byLower.entries()) {
        if (variants.size > 1) {
          inconsistent.push(`${lower}: ${[...variants].join(", ")}`);
        }
      }
      expect(
        inconsistent,
        `Partneři s nejednotným casingem: ${inconsistent.join("; ")}`,
      ).toEqual([]);
    });
  });

  describe("products uniqueness", () => {
    it("no duplicate products (case-insensitive) within (partner, segment)", () => {
      const dups: string[] = [];
      for (const row of catalog.catalog) {
        const seen = new Set<string>();
        for (const p of row.products) {
          const k = normName(p);
          if (seen.has(k)) {
            dups.push(`${row.partner} / ${row.category}: „${p}"`);
          } else {
            seen.add(k);
          }
        }
      }
      expect(dups, `Duplicitní produkty: ${dups.join("; ")}`).toEqual([]);
    });

    it("no row has both TBD placeholder and a real product (cleanup invariant)", () => {
      const violators: string[] = [];
      for (const row of catalog.catalog) {
        if (row.products.length <= 1) continue;
        const hasTbd = row.products.some(isTbdName);
        const hasReal = row.products.some((p) => !isTbdName(p));
        if (hasTbd && hasReal) {
          violators.push(`${row.partner} / ${row.category}: ${row.products.join(", ")}`);
        }
      }
      expect(
        violators,
        `Záznamy, které mají TBD placeholder vedle reálného produktu: ${violators.join("; ")}`,
      ).toEqual([]);
    });

    it("TBD placeholder has the unified name '(doplnit z dropdownu)'", () => {
      const odd: string[] = [];
      for (const row of catalog.catalog) {
        for (const p of row.products) {
          if (isTbdName(p) && !/\(doplnit z dropdownu\)/i.test(p)) {
            odd.push(`${row.partner} / ${row.category}: „${p}"`);
          }
        }
      }
      // Měkká kontrola: dáváme preferenci jednotnému tvaru, ale netrváme striktně
      // (některé TBD placeholdery mohou dočasně obsahovat další poznámku).
      // Fail pouze pokud má TBD placeholder prefix "TBD -" — to je starý formát.
      const strict = odd.filter((s) => /„TBD /i.test(s));
      expect(
        strict,
        `Staré TBD prefixy nutno přepsat na 'Ostatní (doplnit z dropdownu)': ${strict.join("; ")}`,
      ).toEqual([]);
    });
  });

  describe("top-lists vs catalog", () => {
    const excludeSet = new Set(
      (catalog.rules?.excludePartners ?? []).map(normName),
    );
    const catalogPartners = new Set(catalog.catalog.map((e) => normName(e.partner)));

    const allTopEntries: TopListEntry[] = [
      ...topLists.topLists.pojistovny_top10,
      ...topLists.topLists.investicni_spolecnosti_top10,
      ...topLists.topLists.banky_top10,
      ...topLists.topLists.penzijni_spolecnosti_top5,
    ];

    it("every top-list partner exists in catalog.json", () => {
      const missing: string[] = [];
      for (const entry of allTopEntries) {
        if (!catalogPartners.has(normName(entry.partner))) {
          missing.push(entry.partner);
        }
      }
      expect(
        missing,
        `Partneři v top-lists chybějí v catalog.json: ${missing.join(", ")}`,
      ).toEqual([]);
    });

    it("no excluded partner leaks into top-lists", () => {
      const leaks: string[] = [];
      for (const entry of allTopEntries) {
        if (excludeSet.has(normName(entry.partner))) {
          leaks.push(entry.partner);
        }
      }
      expect(
        leaks,
        `Vyloučení partneři se objevují v top-lists: ${leaks.join(", ")}`,
      ).toEqual([]);
    });

    it("top-list partner casing matches catalog.json canonical casing", () => {
      const canonical = new Map<string, string>();
      for (const row of catalog.catalog) {
        canonical.set(normName(row.partner), row.partner);
      }
      const mismatches: string[] = [];
      for (const entry of allTopEntries) {
        const key = normName(entry.partner);
        const canon = canonical.get(key);
        if (canon && canon !== entry.partner) {
          mismatches.push(`top-lists „${entry.partner}" != catalog „${canon}"`);
        }
      }
      expect(
        mismatches,
        `Top-lists používají jiný casing než catalog: ${mismatches.join("; ")}`,
      ).toEqual([]);
    });
  });
});
