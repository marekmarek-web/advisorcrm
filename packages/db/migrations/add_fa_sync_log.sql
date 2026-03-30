-- FA → CRM sync audit table (matches Drizzle faSyncLog in packages/db/src/schema/fa-sync-log.ts).
-- Run in Supabase SQL editor or via your migration runner if opportunities.fa_source_id is already applied.

CREATE TABLE IF NOT EXISTS fa_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES financial_analyses(id) ON DELETE CASCADE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_by TEXT,
  contacts_created JSONB,
  household_id UUID,
  company_id UUID,
  sync_notes TEXT
);

CREATE INDEX IF NOT EXISTS fa_sync_log_analysis_idx ON fa_sync_log (analysis_id);

-- Existing DBs that created fa_sync_log before tenant FK: add constraint if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'fa_sync_log'
      AND c.conname = 'fa_sync_log_tenant_id_fkey'
  ) THEN
    ALTER TABLE fa_sync_log
      ADD CONSTRAINT fa_sync_log_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;
