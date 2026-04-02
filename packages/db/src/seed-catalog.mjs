/**
 * Naplní partnery a produkty z packages/db/src/catalog.json (globální, tenant_id NULL).
 * Respektuje rules.excludePartners. Načte DATABASE_URL z apps/web/.env.local.
 * Spustit: pnpm run db:seed-catalog  nebo  node packages/db/src/seed-catalog.mjs
 */
import postgres from "./postgres-from-root.mjs";
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
const excludeSet = new Set((catalog.rules?.excludePartners ?? []).map((p) => p.trim().toLowerCase()));

function isExcluded(partnerName) {
  return partnerName && excludeSet.has(String(partnerName).trim().toLowerCase());
}

function isTbd(name) {
  return typeof name === "string" && (name.startsWith("TBD") || name.includes("TBD -"));
}

const sql = postgres(connectionString, { max: 1, prepare: false });

async function ensurePartner(name, segment) {
  const existing = await sql`SELECT id FROM partners WHERE tenant_id IS NULL AND name = ${name} AND segment = ${segment}`;
  if (existing.length) return existing[0].id;
  const inserted = await sql`INSERT INTO partners (tenant_id, name, segment) VALUES (NULL, ${name}, ${segment}) RETURNING id`;
  return inserted[0].id;
}

async function ensureProduct(partnerId, name, category) {
  const existing = await sql`SELECT id FROM products WHERE partner_id = ${partnerId} AND name = ${name}`;
  if (existing.length) return;
  await sql`INSERT INTO products (partner_id, name, category, is_tbd) VALUES (${partnerId}, ${name}, ${category}, ${isTbd(name)})`;
}

async function run() {
  for (const entry of catalog.catalog ?? []) {
    const { partner, category, products: productList } = entry;
    if (!partner || !category) continue;
    if (isExcluded(partner)) continue;
    const partnerId = await ensurePartner(partner, category);
    for (const name of productList ?? []) {
      if (!name) continue;
      await ensureProduct(partnerId, name, category);
    }
  }
  const partnerCount = (await sql`SELECT COUNT(*) AS c FROM partners WHERE tenant_id IS NULL`)[0]?.c ?? 0;
  const productCount = (await sql`SELECT COUNT(*) AS c FROM products p JOIN partners r ON p.partner_id = r.id WHERE r.tenant_id IS NULL`)[0]?.c ?? 0;
  await sql.end();
  console.log("Katalog naplněn. Partneři (globální):", partnerCount, ", produkty:", productCount);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
