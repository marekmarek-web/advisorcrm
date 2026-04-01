-- Google Calendar integrace na úrovni uživatele (jeden záznam na uživatele/tenant).
-- Spusť v Supabase SQL Editoru nebo: psql $DATABASE_URL -f packages/db/migrations/add_user_google_calendar_integrations.sql
-- Vyžaduje existující tabulku: tenants
--
-- Návrh: user_id (text) bez FK na auth.users – stejně jako memberships/advisor_preferences; tenant_id
-- pro multi-tenant izolaci a UNIQUE(tenant_id, user_id). RLS omezí přístup na auth.uid() = user_id.
-- updated_at bez triggeru – projekt jinde triggery pro updated_at nepoužívá; aplikace ho nastaví při UPDATE.

CREATE TABLE IF NOT EXISTS user_google_calendar_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  google_email text,
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  scope text,
  calendar_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- Index pro výběr aktivního napojení uživatele (API: "můj Google Calendar").
CREATE INDEX IF NOT EXISTS idx_user_google_calendar_integrations_user_id
  ON user_google_calendar_integrations(user_id);

CREATE INDEX IF NOT EXISTS idx_user_google_calendar_integrations_user_active
  ON user_google_calendar_integrations(user_id, is_active)
  WHERE is_active = true;

-- RLS: uživatel vidí a mění jen své vlastní napojení (auth.uid() = user_id).
-- Sloupce tabulky events pro sync: samostatný soubor add_events_google_calendar_fields.sql (nepřimíchávej sem).
ALTER TABLE user_google_calendar_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_google_calendar_integrations_select_own ON user_google_calendar_integrations;
DROP POLICY IF EXISTS user_google_calendar_integrations_insert_own ON user_google_calendar_integrations;
DROP POLICY IF EXISTS user_google_calendar_integrations_update_own ON user_google_calendar_integrations;
DROP POLICY IF EXISTS user_google_calendar_integrations_delete_own ON user_google_calendar_integrations;

CREATE POLICY user_google_calendar_integrations_select_own
  ON user_google_calendar_integrations
  FOR SELECT
  USING ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_calendar_integrations_insert_own
  ON user_google_calendar_integrations
  FOR INSERT
  WITH CHECK ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_calendar_integrations_update_own
  ON user_google_calendar_integrations
  FOR UPDATE
  USING ((SELECT auth.uid())::text = user_id)
  WITH CHECK ((SELECT auth.uid())::text = user_id);

CREATE POLICY user_google_calendar_integrations_delete_own
  ON user_google_calendar_integrations
  FOR DELETE
  USING ((SELECT auth.uid())::text = user_id);
