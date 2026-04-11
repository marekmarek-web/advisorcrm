-- Distinguish plan-provisioned defaults vs manual admin overrides (Phase 2 billing).
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS setting_origin text;

COMMENT ON COLUMN tenant_settings.setting_origin IS 'plan = written by syncPlanDefaultsToTenantSettings; manual = user/admin API; NULL = legacy row (never overwritten by sync).';
