-- Advisor CRM – starší ruční bootstrap pro Supabase (SQL Editor)
--
-- DŮLEŽITÉ: Tento soubor NENÍ plná aktuální definice DB oproti kódu (Drizzle).
-- Chybí např. řada tabulek (user_profiles, document_extractions, Stripe, FA/AI, …)
-- a rozšíření `documents` (document_type, upload_source, sensitive, processing, …).
--
-- Pro nový / čistý Supabase projekt použij ve správném pořadí migrace v:
--   packages/db/drizzle/0000_*.sql … 0016_*.sql
-- (řádky "--> statement-breakpoint" smaž nebo ignoruj – Postgres je nezná.)
-- Doplň také ruční SQL z packages/db/migrations/ podle docs/OPS_RUNBOOK.md
-- (pre-launch-*, add-document-upload-source, Stripe, atd.).
--
-- Níže: historický bootstrap; IF NOT EXISTS = bezpečné opakované spuštění.

-- 1. tenants + roles + memberships (potřeba pro přihlášení)
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  permissions text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  parent_id text,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  invited_by text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  mfa_enabled boolean DEFAULT false,
  UNIQUE(tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_tenant_parent_idx ON memberships(tenant_id, parent_id);

-- 2. contacts (potřeba pro client_contacts)
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  title text,
  notes text,
  referral_source text,
  referral_contact_id uuid,
  notification_unsubscribed_at timestamptz,
  gdpr_consent_at timestamptz,
  service_cycle_months text,
  last_service_date date,
  next_service_due date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS household_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role text,
  joined_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  ico text,
  dic text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  from_type text NOT NULL,
  from_id uuid NOT NULL,
  to_type text NOT NULL,
  to_id uuid NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id text NOT NULL,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id),
  UNIQUE(tenant_id, contact_id)
);

CREATE TABLE IF NOT EXISTS unsubscribe_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);
ALTER TABLE client_invitations
  ADD COLUMN IF NOT EXISTS auth_user_id text,
  ADD COLUMN IF NOT EXISTS invited_by_user_id text,
  ADD COLUMN IF NOT EXISTS temporary_password_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_change_required_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_email_error text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

-- 3. pipeline
CREATE TABLE IF NOT EXISTS opportunity_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  probability integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  household_id uuid,
  case_type text NOT NULL,
  title text NOT NULL,
  stage_id uuid NOT NULL REFERENCES opportunity_stages(id) ON DELETE RESTRICT,
  probability integer,
  expected_value decimal(14,2),
  expected_close_date date,
  assigned_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

-- 4. tasks + events
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  due_date date,
  completed_at timestamptz,
  assigned_to text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  title text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  all_day boolean DEFAULT false,
  location text,
  assigned_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotent column sync (older DBs skipped these on CREATE TABLE IF NOT EXISTS)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS analysis_id uuid;
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type text DEFAULT 'schuzka';
ALTER TABLE events ADD COLUMN IF NOT EXISTS reminder_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS meeting_link text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS task_id uuid;

-- 5. contracts
CREATE TABLE IF NOT EXISTS partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  name text NOT NULL,
  segment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  is_tbd boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  advisor_id text,
  segment text NOT NULL,
  partner_id uuid REFERENCES partners(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  partner_name text,
  product_name text,
  premium_amount numeric(12,2),
  premium_annual numeric(12,2),
  contract_number text,
  start_date date,
  anniversary_date date,
  note text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Migration: add premium columns if upgrading
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS premium_amount numeric(12,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS premium_annual numeric(12,2);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS advisor_id text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS archived_at timestamptz;
-- Legacy DBs: column was contact_id; Drizzle app expects client_id (see packages/db/migrations/contracts-contact-id-to-client-id.sql)
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
    ALTER TABLE contracts DROP COLUMN contact_id;
  END IF;
END $$;

-- board_views for Phase 2
CREATE TABLE IF NOT EXISTS board_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id text,
  name text NOT NULL DEFAULT 'Default',
  columns_config jsonb,
  group_by text,
  filters jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  partner_id uuid REFERENCES partners(id) ON DELETE CASCADE,
  partner_name text,
  segment text NOT NULL,
  account_number text NOT NULL,
  bank text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. documents
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  tags text[],
  visible_to_client boolean DEFAULT false,
  uploaded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  version text NOT NULL,
  uploaded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. meeting notes
CREATE TABLE IF NOT EXISTS note_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  domain text NOT NULL,
  schema jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  template_id uuid REFERENCES note_templates(id) ON DELETE SET NULL,
  meeting_at timestamptz NOT NULL,
  participants text[],
  domain text NOT NULL,
  content jsonb NOT NULL,
  version text DEFAULT '1',
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 8. timeline
CREATE TABLE IF NOT EXISTS timeline_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  type text NOT NULL,
  subject text,
  body text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. audit + compliance
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id text,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id text,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  meta jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS processing_purposes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  legal_basis text,
  retention_months integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  purpose_id uuid NOT NULL REFERENCES processing_purposes(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL,
  revoked_at timestamptz,
  legal_basis text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aml_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  performed_by text NOT NULL,
  performed_at timestamptz NOT NULL,
  checklist_type text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incident_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  reported_by text NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  type text NOT NULL,
  requested_by text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS export_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_id uuid NOT NULL REFERENCES exports(id) ON DELETE CASCADE,
  kind text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  plan text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  amount decimal(14,2),
  status text DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11. board items (Phase 1.2 persistence)
ALTER TABLE board_views ADD COLUMN IF NOT EXISTS groups_config jsonb;

CREATE TABLE IF NOT EXISTS board_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  view_id uuid NOT NULL REFERENCES board_views(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  group_id text NOT NULL DEFAULT 'default',
  name text NOT NULL,
  cells jsonb NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 12. notification_log (Phase 3.1)
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

-- 13. messages (Phase 4.2)
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  sender_type text NOT NULL,
  sender_id text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 14. contact schema expansion (Phase 1.3)
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
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS archived_reason text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_channel text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_email boolean NOT NULL DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_push boolean NOT NULL DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS best_contact_time text;

-- 15. mindmap (strategická mapa klienta/domácnosti nebo libovolná standalone mapa)
CREATE TABLE IF NOT EXISTS mindmap_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  name text,
  viewport jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, entity_type, entity_id)
);

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

-- Portal notifications (client in-app)
CREATE TABLE IF NOT EXISTS portal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  read_at timestamptz,
  related_entity_type text,
  related_entity_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_notifications_contact_read_idx ON portal_notifications (contact_id, read_at);

-- ---------------------------------------------------------------------------
-- Portal + financial analysis (align with Drizzle app schema / Sentry fixes)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS financial_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid,
  household_id uuid,
  company_id uuid,
  primary_contact_id uuid,
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
  linked_company_id uuid,
  last_refreshed_from_shared_at timestamptz
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
  UNIQUE (tenant_id, user_id)
);

ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS quick_actions jsonb;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS report_logo_url text;

DO $$ BEGIN
  ALTER TABLE tasks
    ADD CONSTRAINT tasks_analysis_id_financial_analyses_id_fk
    FOREIGN KEY (analysis_id) REFERENCES financial_analyses(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE events
    ADD CONSTRAINT events_task_id_tasks_id_fk
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS fa_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  analysis_id uuid NOT NULL,
  contact_id uuid,
  opportunity_id uuid,
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

DO $$ BEGIN
  ALTER TABLE fa_plan_items
    ADD CONSTRAINT fa_plan_items_analysis_id_financial_analyses_id_fk
    FOREIGN KEY (analysis_id) REFERENCES financial_analyses(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE fa_plan_items
    ADD CONSTRAINT fa_plan_items_contact_id_contacts_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE fa_plan_items
    ADD CONSTRAINT fa_plan_items_opportunity_id_opportunities_id_fk
    FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
