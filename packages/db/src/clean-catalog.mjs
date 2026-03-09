/**
 * Čistí katalog: u ZP odstraní redundantní "ZP"/"životní" v názvech, odstraní duplicity produktů.
 * Spustit: node packages/db/src/clean-catalog.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogPath = join(__dirname, "catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf-8"));

function cleanZPProductName(name) {
  if (typeof name !== "string") return name;
  let s = name
    .replace(/\s*životní\s+pojištění\s*/gi, " ")
    .replace(/\s*\(ZP\)\s*/gi, " ")
    .replace(/\s+ZP\s+(doplnit|–|-)/gi, " $1")
    .replace(/Život\s*\(\s*doplnit/, "(doplnit")
    .replace(/TBD\s*-\s*([^(]+)\s*Život\s*\(\s*doplnit/, "TBD - $1(doplnit z dropdownu)")
    .trim();
  if (s.startsWith("(doplnit")) s = "TBD - doplnit z dropdownu";
  if (/^elán\s*životní/i.test(name)) return "Elán";
  return s || name;
}

function normForDedup(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s*[–-]\s*/g, " - ")
    .replace(/\s*\(\s*/g, " (");
}

for (const entry of catalog.catalog ?? []) {
  let products = entry.products ?? [];
  if (entry.category === "ZP") {
    products = products.map(cleanZPProductName);
  }
  const seen = new Set();
  const out = [];
  for (const p of products) {
    const n = normForDedup(p);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(p);
    }
  }
  entry.products = out.length ? out : products;
}

writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), "utf-8");
console.log("Katalog vyčištěn.");