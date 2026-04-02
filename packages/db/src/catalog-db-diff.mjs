/**
 * Porovná packages/db/src/catalog.json (po excludePartners) s DB — globální katalog (partners.tenant_id IS NULL).
 * Vypíše: chybí v DB, navíc v DB oproti katalogu.
 * Načte DATABASE_URL z apps/web/.env.local (stejně jako seed-catalog.mjs).
 * Spustit: pnpm run db:catalog-diff   (z kořene repa)
 */
import postgres from "postgres";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "../../..");
const webEnv = join(repoRoot, "apps/web/.env.local");
if (existsSync(webEnv)) {
  const lines = readFileSync(webEnv, "utf-8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? "";
if (!connectionString) {
  console.error("DATABASE_URL not set. Expected in:", webEnv);
  process.exit(1);
}

const catalogPath = join(__dirname, "catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf-8"));
const excludeSet = new Set((catalog.rules?.excludePartners ?? []).map((p) => String(p).trim().toLowerCase()));

function isExcluded(partnerName) {
  return partnerName && excludeSet.has(String(partnerName).trim().toLowerCase());
}

function key(partner, segment, productName) {
  return `${partner}\0${segment}\0${productName}`;
}

/** Očekávané trojice z JSON (stejná logika jako seed-catalog.mjs). */
function expectedKeysFromCatalog() {
  const set = new Set();
  for (const entry of catalog.catalog ?? []) {
    const partner = entry.partner;
    const category = entry.category;
    if (!partner || !category) continue;
    if (isExcluded(partner)) continue;
    for (const name of entry.products ?? []) {
      if (!name) continue;
      set.add(key(partner, category, name));
    }
  }
  return set;
}

const sql = postgres(connectionString, { max: 1, prepare: false });

async function run() {
  const expected = expectedKeysFromCatalog();

  const rows = await sql`
    SELECT r.name AS partner_name, r.segment, p.name AS product_name
    FROM products p
    JOIN partners r ON p.partner_id = r.id
    WHERE r.tenant_id IS NULL
  `;

  const inDb = new Set();
  for (const r of rows) {
    inDb.add(key(r.partner_name, r.segment, r.product_name));
  }

  const missingInDb = [...expected].filter((k) => !inDb.has(k));
  const extraInDb = [...inDb].filter((k) => !expected.has(k));

  missingInDb.sort();
  extraInDb.sort();

  console.log("=== catalog.json → DB (globální katalog) ===");
  console.log("Očekávaných záznamů (JSON, po excludePartners):", expected.size);
  console.log("V DB (globální):", inDb.size);
  console.log("");

  if (missingInDb.length === 0) {
    console.log("Chybí v DB: žádné (katalog je pokrytý).");
  } else {
    console.log(`Chybí v DB (${missingInDb.length}) — spusťte pnpm run db:seed-catalog:`);
    for (const k of missingInDb) {
      const [partner, segment, productName] = k.split("\0");
      console.log(`  - ${partner} | ${segment} | ${productName}`);
    }
  }
  console.log("");

  if (extraInDb.length === 0) {
    console.log("Navíc v DB oproti catalog.json: žádné.");
  } else {
    console.log(
      `Navíc v DB oproti catalog.json (${extraInDb.length}) — ruční záznamy nebo starší verze katalogu:`
    );
    for (const k of extraInDb) {
      const [partner, segment, productName] = k.split("\0");
      console.log(`  - ${partner} | ${segment} | ${productName}`);
    }
  }

  await sql.end();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
