-- FA → CRM sync audit table (matches Drizzle faSyncLog in packages/db/src/schema/fa-sync-log.ts).
-- Run in Supabase SQL editor or via your migration runner if opportunities.fa_source_id is already applied.

CREATE TABLE IF NOT EXISTS fa_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  analysis_id UUID NOT NULL REFERENCES financial_analyses(id) ON DELETE CASCADE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_by TEXT,
  contacts_created JSONB,
  household_id UUID,
  company_id UUID,
  sync_notes TEXT
);

CREATE INDEX IF NOT EXISTS fa_sync_log_analysis_idx ON fa_sync_log (analysis_id);
