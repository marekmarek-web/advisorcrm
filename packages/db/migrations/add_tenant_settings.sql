-- Add tenant_settings table for per-tenant configurable settings (Plan 8)
CREATE TABLE IF NOT EXISTS tenant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  domain TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1
);

-- (tenant_id, key) is covered by UNIQUE index below — no separate btree on same columns.
CREATE INDEX IF NOT EXISTS tenant_settings_domain_idx ON tenant_settings(tenant_id, domain);

-- Unique constraint: only one value per tenant+key
CREATE UNIQUE INDEX IF NOT EXISTS tenant_settings_unique_key ON tenant_settings(tenant_id, key);
