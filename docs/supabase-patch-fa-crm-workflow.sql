-- FA → CRM workflow migration
-- Phase 1: New tables and columns for FA plan items, sync log, sale status, coverage FA link, pipeline FA link, contact archiving

-- 1. financial_analyses: sale status
ALTER TABLE financial_analyses
  ADD COLUMN IF NOT EXISTS sale_status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS sale_notes TEXT,
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;

-- 2. contacts: soft delete (archiving)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

-- 3. fa_plan_items: individual recommendations/products from FA
CREATE TABLE IF NOT EXISTS fa_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  analysis_id UUID NOT NULL REFERENCES financial_analyses(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  item_type TEXT NOT NULL,
  item_key TEXT,
  segment_code TEXT,
  label TEXT,
  provider TEXT,
  amount_monthly NUMERIC(14,2),
  amount_annual NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'recommended',
  source_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fa_plan_items_analysis_idx ON fa_plan_items (analysis_id);
CREATE INDEX IF NOT EXISTS fa_plan_items_contact_idx ON fa_plan_items (contact_id);

-- 4. fa_sync_log: track FA → CRM sync operations
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

-- 5. contact_coverage: link to FA
ALTER TABLE contact_coverage
  ADD COLUMN IF NOT EXISTS fa_analysis_id UUID REFERENCES financial_analyses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fa_item_id UUID REFERENCES fa_plan_items(id) ON DELETE SET NULL;

-- 6. opportunities: link to source FA
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS fa_source_id UUID REFERENCES financial_analyses(id) ON DELETE SET NULL;

-- 7. Enable RLS on new tables
ALTER TABLE fa_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fa_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fa_plan_items_tenant_isolation" ON fa_plan_items
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true))::uuid);

CREATE POLICY "fa_sync_log_tenant_isolation" ON fa_sync_log
  USING (tenant_id = (SELECT current_setting('app.current_tenant_id', true))::uuid);
