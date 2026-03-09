/**
 * Vloží globální partnery (ŽP) do DB – aby v dropdownu „Partner“ u smluv něco bylo.
 * Načte DATABASE_URL z apps/web/.env.local. Spustit: node packages/db/src/seed-partners.mjs
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

const statements = [
  "INSERT INTO partners (tenant_id, name, segment) SELECT NULL, 'UNIQA', 'ZP' WHERE NOT EXISTS (SELECT 1 FROM partners WHERE tenant_id IS NULL AND name = 'UNIQA' AND segment = 'ZP')",
  "INSERT INTO partners (tenant_id, name, segment) SELECT NULL, 'NN Životní pojišťovna', 'ZP' WHERE NOT EXISTS (SELECT 1 FROM partners WHERE tenant_id IS NULL AND name = 'NN Životní pojišťovna' AND segment = 'ZP')",
  "INSERT INTO partners (tenant_id, name, segment) SELECT NULL, 'Generali Česká pojišťovna', 'ZP' WHERE NOT EXISTS (SELECT 1 FROM partners WHERE tenant_id IS NULL AND name = 'Generali Česká pojišťovna' AND segment = 'ZP')",
  "INSERT INTO partners (tenant_id, name, segment) SELECT NULL, 'Allianz', 'ZP' WHERE NOT EXISTS (SELECT 1 FROM partners WHERE tenant_id IS NULL AND name = 'Allianz' AND segment = 'ZP')",
  "INSERT INTO partners (tenant_id, name, segment) SELECT NULL, 'Kooperativa', 'ZP' WHERE NOT EXISTS (SELECT 1 FROM partners WHERE tenant_id IS NULL AND name = 'Kooperativa' AND segment = 'ZP')",
];

async function run() {
  const client = postgres(connectionString, { max: 1, prepare: false });
  for (const stmt of statements) await client.unsafe(stmt);
  await client.end();
  console.log("Partneři doplněni.");
}

run().catch((e) => { console.error(e); process.exit(1); });
