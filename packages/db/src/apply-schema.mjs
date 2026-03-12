/**
 * Applies idempotent schema patch to DATABASE_URL. Load .env from apps/web/.env.local first.
 * Run from repo root: node packages/db/src/apply-schema.mjs
 * Or: cd packages/db && node --env-file=../apps/web/.env.local src/apply-schema.mjs (Node 20+)
 */
import postgres from "postgres";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually (__dirname is packages/db/src, repo root is 3 up)
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

const schemaPath = join(__dirname, "../supabase-schema.sql");
const fullSchema = readFileSync(schemaPath, "utf-8");

const patchSql = `
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS advisor_id text;
ALTER TABLE contracts ALTER COLUMN advisor_id DROP NOT NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS segment text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES partners(id) ON DELETE SET NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS partner_name text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS product_name text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS premium_amount numeric(12,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS premium_annual numeric(12,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS variable_symbol text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_number text;
UPDATE contracts SET contract_number = variable_symbol WHERE contract_number IS NULL AND variable_symbol IS NOT NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS anniversary_date date;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS personal_id text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS zip text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lifecycle_stage text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_source text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_source_url text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS priority text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE board_views ADD COLUMN IF NOT EXISTS groups_config jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type text DEFAULT 'schuzka';
ALTER TABLE events ADD COLUMN IF NOT EXISTS reminder_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS meeting_link text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES tasks(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'email',
  template text,
  subject text,
  recipient text,
  status text NOT NULL DEFAULT 'sent',
  meta jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS closed_as text;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS custom_fields jsonb;
ALTER TABLE households ADD COLUMN IF NOT EXISTS icon text;
`;

// Globální partneři (tenant_id NULL) – vidí je každý tenant v dropdownu (po jednom, aby nepadl multi-statement)
const seedPartnersStatements = [
  "INSERT INTO partners (tenant_id, name, segment) SELECT NULL, 'UNIQA', 'ZP' WHERE NOT EXISTS (SELECT 1 FROM partners WHERE tenant_id IS NULL AND name = 'UNIQA' AND segment = 'ZP')",
  "INSERT INTO partners (tenant_id, name, segment) SELECT NULL, 'NN Životní pojišťovna', 'ZP' WHERE NOT EXISTS (SELECT 1 FROM partners WHERE tenant_id IS NULL AND name = 'NN Životní pojišťovna' AND segment = 'ZP')",
  "INSERT INTO partners (tenant_id, name, segment) SELECT NULL, 'Generali Česká pojišťovna', 'ZP' WHERE NOT EXISTS (SELECT 1 FROM partners WHERE tenant_id IS NULL AND name = 'Generali Česká pojišťovna' AND segment = 'ZP')",
  "INSERT INTO partners (tenant_id, name, segment) SELECT NULL, 'Allianz', 'ZP' WHERE NOT EXISTS (SELECT 1 FROM partners WHERE tenant_id IS NULL AND name = 'Allianz' AND segment = 'ZP')",
  "INSERT INTO partners (tenant_id, name, segment) SELECT NULL, 'Kooperativa', 'ZP' WHERE NOT EXISTS (SELECT 1 FROM partners WHERE tenant_id IS NULL AND name = 'Kooperativa' AND segment = 'ZP')",
];

const sql = postgres(connectionString, { max: 1, prepare: false });

async function main() {
  console.log("Applying full schema to DATABASE_URL...");
  await sql.unsafe(fullSchema);
  console.log("Applying idempotent patch...");
  await sql.unsafe(patchSql);
  console.log("Seeding global partners (if missing)...");
  for (const stmt of seedPartnersStatements) await sql.unsafe(stmt);
  console.log("Done.");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
