/**
 * Applies supabase-schema.sql to the database at DATABASE_URL.
 * Loads .env from apps/web/.env.local so the same DB the app uses gets migrated.
 * Run from repo root: pnpm run db:apply-schema
 */
import postgres from "postgres";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from apps/web/.env.local (repo root is packages/db/../..)
const repoRoot = join(__dirname, "../..");
const webEnv = join(repoRoot, "apps/web/.env.local");
config({ path: webEnv });

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? "";
if (!connectionString) {
  console.error("DATABASE_URL not set. Loaded from:", webEnv);
  process.exit(1);
}

const schemaPath = join(__dirname, "../supabase-schema.sql");
const sql = readFileSync(schemaPath, "utf-8");

// Idempotent patch: add columns to existing tables that may have been created from an older schema.
// (CREATE TABLE IF NOT EXISTS does not add columns to existing tables.)
const patchSql = `
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS advisor_id text;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'contact_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE contracts RENAME COLUMN contact_id TO client_id;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'contact_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'client_id'
  ) THEN
    UPDATE contracts SET client_id = COALESCE(client_id, contact_id);
    ALTER TABLE contracts DROP COLUMN contact_id CASCADE;
  END IF;
END $$;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS segment text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS premium_amount numeric(12,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS premium_annual numeric(12,2);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS personal_id text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS zip text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lifecycle_stage text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE board_views ADD COLUMN IF NOT EXISTS groups_config jsonb;
ALTER TABLE households ADD COLUMN IF NOT EXISTS icon text;
ALTER TABLE mindmap_maps ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE meeting_notes ALTER COLUMN contact_id DROP NOT NULL;
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
CREATE TABLE IF NOT EXISTS mindmap_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  viewport jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mindmap_maps_tenant_entity ON mindmap_maps (tenant_id, entity_type, entity_id);
CREATE TABLE IF NOT EXISTS mindmap_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES mindmap_maps(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  subtitle text,
  x real NOT NULL DEFAULT 0,
  y real NOT NULL DEFAULT 0,
  entity_type text,
  entity_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mindmap_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid NOT NULL REFERENCES mindmap_maps(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES mindmap_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES mindmap_nodes(id) ON DELETE CASCADE,
  dashed boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS advisor_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quick_actions jsonb,
  avatar_url text,
  phone text,
  website text,
  report_logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS report_logo_url text;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS public_booking_token text;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS public_booking_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS booking_availability jsonb;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS booking_slot_minutes integer NOT NULL DEFAULT 30;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS booking_buffer_minutes integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS advisor_preferences_public_booking_token_uidx
  ON advisor_preferences (public_booking_token)
  WHERE public_booking_token IS NOT NULL;
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  ico text,
  name text NOT NULL,
  industry text,
  employees integer,
  cat3 integer,
  avg_wage integer,
  top_client integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS company_person_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  role_type text NOT NULL,
  ownership_percent integer,
  salary_from_company_monthly integer,
  dividend_relation text,
  guarantees_company_liabilities boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contact_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  segment_code text NOT NULL,
  status text NOT NULL,
  linked_contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  linked_opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  notes text,
  is_relevant boolean DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  UNIQUE(tenant_id, contact_id, item_key)
);
ALTER TABLE contact_coverage ADD COLUMN IF NOT EXISTS fa_analysis_id uuid REFERENCES financial_analyses(id) ON DELETE SET NULL;
ALTER TABLE contact_coverage ADD COLUMN IF NOT EXISTS fa_item_id uuid REFERENCES fa_plan_items(id) ON DELETE SET NULL;
`;

const client = postgres(connectionString, { max: 1, prepare: false });
const unsafe = (client as unknown as { unsafe: (q: string) => Promise<unknown> }).unsafe;

async function main() {
  console.log("Applying schema to DATABASE_URL...");
  await unsafe(sql);
  console.log("Applying idempotent patch (missing columns/tables)...");
  await unsafe(patchSql);
  console.log("Schema applied.");
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
