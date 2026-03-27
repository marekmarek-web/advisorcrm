-- Speeds up parallel queries in getDashboardKpis (portal/today). Safe to run multiple times.
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_active ON contacts (tenant_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_open_due ON tasks (tenant_id, due_date) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_tenant_open_expected ON opportunities (tenant_id, expected_close_date) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_tenant_start_at ON events (tenant_id, start_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_tenant_created_at ON activity_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant_anniversary ON contracts (tenant_id, anniversary_date);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant_next_service_due ON contacts (tenant_id, next_service_due) WHERE archived_at IS NULL;
