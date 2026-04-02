/**
 * Applies idempotent schema patch to DATABASE_URL. Load .env from apps/web/.env.local first.
 * Run from repo root: node packages/db/src/apply-schema.mjs
 * Or: cd packages/db && node --env-file=../apps/web/.env.local src/apply-schema.mjs (Node 20+)
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const postgres = require("postgres");

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
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS advisor_id text;
ALTER TABLE contracts ALTER COLUMN advisor_id DROP NOT NULL;
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
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS type text;
UPDATE contracts SET type = segment WHERE type IS NULL OR trim(type) = '';
ALTER TABLE contracts ALTER COLUMN type SET NOT NULL;
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
CREATE TABLE IF NOT EXISTS financial_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  household_id uuid REFERENCES households(id) ON DELETE SET NULL,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  primary_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'financial',
  status text NOT NULL DEFAULT 'draft',
  source_type text NOT NULL DEFAULT 'native',
  version integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_exported_at timestamptz,
  linked_company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  last_refreshed_from_shared_at timestamptz
);
CREATE TABLE IF NOT EXISTS financial_shared_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  company_person_link_id uuid REFERENCES company_person_links(id) ON DELETE SET NULL,
  fact_type text NOT NULL,
  value jsonb NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  source_analysis_id uuid REFERENCES financial_analyses(id) ON DELETE SET NULL,
  source_payload_path text,
  valid_from timestamptz,
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS analysis_id uuid;
DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_analysis_id_financial_analyses_id_fk
    FOREIGN KEY (analysis_id) REFERENCES financial_analyses(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
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
  UNIQUE (tenant_id, user_id)
);
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS report_logo_url text;
CREATE TABLE IF NOT EXISTS fa_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  analysis_id uuid NOT NULL REFERENCES financial_analyses(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  item_type text NOT NULL,
  item_key text,
  segment_code text,
  label text,
  provider text,
  amount_monthly numeric(14,2),
  amount_annual numeric(14,2),
  status text NOT NULL DEFAULT 'recommended',
  source_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fa_plan_items_analysis_idx ON fa_plan_items (analysis_id);
CREATE INDEX IF NOT EXISTS fa_plan_items_contact_idx ON fa_plan_items (contact_id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS visible_to_client boolean DEFAULT false;
CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  reminder_type text NOT NULL,
  title text NOT NULL,
  description text,
  due_at timestamptz NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  related_entity_type text,
  related_entity_id uuid,
  suggestion_origin text NOT NULL DEFAULT 'rule',
  status text NOT NULL DEFAULT 'pending',
  snoozed_until timestamptz,
  resolved_at timestamptz,
  assigned_to uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reminders_tenant ON reminders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reminders_assigned ON reminders(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(due_at) WHERE status = 'pending';
CREATE TABLE IF NOT EXISTS advisor_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  severity text NOT NULL DEFAULT 'info',
  target_user_id uuid NOT NULL,
  channels jsonb NOT NULL DEFAULT '["in_app"]',
  related_entity_type text,
  related_entity_id uuid,
  status text NOT NULL DEFAULT 'unread',
  group_key text,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_advisor_notif_target ON advisor_notifications(target_user_id, status);
CREATE INDEX IF NOT EXISTS idx_advisor_notif_group ON advisor_notifications(group_key);
ALTER TABLE contact_coverage ADD COLUMN IF NOT EXISTS fa_analysis_id uuid REFERENCES financial_analyses(id) ON DELETE SET NULL;
ALTER TABLE contact_coverage ADD COLUMN IF NOT EXISTS fa_item_id uuid REFERENCES fa_plan_items(id) ON DELETE SET NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS visible_to_client boolean NOT NULL DEFAULT true;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS portfolio_status text NOT NULL DEFAULT 'active';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'manual';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source_document_id uuid;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source_contract_review_id uuid;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS advisor_confirmed_at timestamptz;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS confirmed_by_user_id text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS portfolio_attributes jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS extraction_confidence numeric(5, 4);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_portfolio_status_check') THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_portfolio_status_check CHECK (portfolio_status IN ('draft', 'pending_review', 'active', 'ended'));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_source_kind_check') THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_source_kind_check CHECK (source_kind IN ('manual', 'document', 'ai_review', 'import'));
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_source_document_id_fkey') THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_source_document_id_fkey FOREIGN KEY (source_document_id) REFERENCES documents(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_source_contract_review_id_fkey') THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_source_contract_review_id_fkey FOREIGN KEY (source_contract_review_id) REFERENCES contract_upload_reviews(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS contracts_client_portfolio_idx ON contracts (tenant_id, client_id) WHERE archived_at IS NULL AND visible_to_client = true AND portfolio_status IN ('active', 'ended');
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
