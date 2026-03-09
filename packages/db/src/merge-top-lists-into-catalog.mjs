/**
 * Sloučí data z data/top-lists-seed-v2.json do catalog.json (doplní partnery/produkty).
 * Spustit: node packages/db/src/merge-top-lists-into-catalog.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogPath = join(__dirname, "catalog.json");
const topListsPath = join(__dirname, "data", "top-lists-seed-v2.json");

const catalog = JSON.parse(readFileSync(catalogPath, "utf-8"));
const topLists = JSON.parse(readFileSync(topListsPath, "utf-8"));

const labelToCode = new Map();
for (const s of topLists.segments ?? []) {
  if (s.code) {
    labelToCode.set(s.label, s.code);
    labelToCode.set(s.displayName, s.code);
  }
}

function normProduct(name) {
  if (typeof name !== "string") return name;
  const t = name.trim();
  if (t === "(TBD)" || /^\(TBD\s*[–-]/.test(t)) return "TBD - doplnit z dropdownu";
  return t;
}

const key = (p, c) => `${p}\t${c}`;
const byKey = new Map();
for (const e of catalog.catalog ?? []) {
  const k = key(e.partner, e.category);
  byKey.set(k, { partner: e.partner, category: e.category, products: [...(e.products || [])] });
}

const listNames = ["pojistovny_top10", "investicni_spolecnosti_top10", "banky_top10", "penzijni_spolecnosti_top5"];
for (const listName of listNames) {
  const list = topLists.topLists?.[listName] ?? [];
  for (const item of list) {
    if (item.excluded) continue;
    const partner = item.partner?.trim();
    if (!partner) continue;
    const map = item.map ?? {};
    for (const [segmentLabel, products] of Object.entries(map)) {
      const code = labelToCode.get(segmentLabel);
      if (!code) continue;
      const k = key(partner, code);
      const existing = byKey.get(k);
      const normalized = (products || []).map(normProduct).filter(Boolean);
      if (existing) {
        const set = new Set([...existing.products, ...normalized]);
        existing.products = [...set];
      } else {
        byKey.set(k, { partner, category: code, products: normalized });
      }
    }
  }
}

catalog.catalog = [...byKey.values()].sort((a, b) => a.partner.localeCompare(b.partner) || a.category.localeCompare(b.category));
if (!catalog.rules.excludePartners.includes("Slavia")) catalog.rules.excludePartners.push("Slavia");
const newCats = ["CEST", "DIP", "DPS", "ZDRAV"];
for (const c of newCats) {
  if (!catalog.categories.includes(c)) catalog.categories.push(c);
}
catalog.categories.sort();

writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), "utf-8");
console.log("Merged top-lists into catalog.json. Entries:", catalog.catalog.length, "Categories:", catalog.categories.length);
