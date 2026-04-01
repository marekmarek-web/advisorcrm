-- Google Drive + Gmail integrace (jeden záznam na uživatele / tenant).
-- Spusť v Supabase SQL Editoru nebo: psql $DATABASE_URL -f packages/db/migrations/add_user_google_drive_gmail_integrations.sql
-- Vyžaduje existující tabulku: tenants
--
-- Stejný model jako user_google_calendar_integrations: user_id (text), RLS podle auth.uid().

-- ---------- Drive ----------
CREATE TABLE IF NOT EXISTS user_google_drive_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  google_email text,
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  scope text,
  root_folder_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_google_drive_integrations_user_id
  ON user_google_drive_integrations(user_id);

CREATE INDEX IF NOT EXISTS idx_user_google_drive_integrations_user_active
  ON user_google_drive_integrations(user_id, is_active)
  WHERE is_active = true;

ALTER TABLE user_google_drive_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_google_drive_integrations_select_own ON user_google_drive_integrations;
DROP POLICY IF EXISTS user_google_drive_integrations_insert_own ON user_google_drive_integrations;
DROP POLICY IF EXISTS user_google_drive_integrations_update_own ON user_google_drive_integrations;
DROP POLICY IF EXISTS user_google_drive_integrations_delete_own ON user_google_drive_integrations;

CREATE POLICY user_google_drive_integrations_select_own
  ON user_google_drive_integrations
  FOR SELECT
  USING ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_drive_integrations_insert_own
  ON user_google_drive_integrations
  FOR INSERT
  WITH CHECK ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_drive_integrations_update_own
  ON user_google_drive_integrations
  FOR UPDATE
  USING ((SELECT auth.uid())::text = user_id)
  WITH CHECK ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_drive_integrations_delete_own
  ON user_google_drive_integrations
  FOR DELETE
  USING ((SELECT auth.uid())::text = user_id);

-- ---------- Gmail ----------
CREATE TABLE IF NOT EXISTS user_google_gmail_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  google_email text,
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  scope text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_google_gmail_integrations_user_id
  ON user_google_gmail_integrations(user_id);

CREATE INDEX IF NOT EXISTS idx_user_google_gmail_integrations_user_active
  ON user_google_gmail_integrations(user_id, is_active)
  WHERE is_active = true;

ALTER TABLE user_google_gmail_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_google_gmail_integrations_select_own ON user_google_gmail_integrations;
DROP POLICY IF EXISTS user_google_gmail_integrations_insert_own ON user_google_gmail_integrations;
DROP POLICY IF EXISTS user_google_gmail_integrations_update_own ON user_google_gmail_integrations;
DROP POLICY IF EXISTS user_google_gmail_integrations_delete_own ON user_google_gmail_integrations;

CREATE POLICY user_google_gmail_integrations_select_own
  ON user_google_gmail_integrations
  FOR SELECT
  USING ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_gmail_integrations_insert_own
  ON user_google_gmail_integrations
  FOR INSERT
  WITH CHECK ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_gmail_integrations_update_own
  ON user_google_gmail_integrations
  FOR UPDATE
  USING ((SELECT auth.uid())::text = user_id)
  WITH CHECK ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_gmail_integrations_delete_own
  ON user_google_gmail_integrations
  FOR DELETE
  USING ((SELECT auth.uid())::text = user_id);
