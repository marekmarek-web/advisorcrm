-- Workspace-level 14d trial (product access mode), separate from Stripe subscription trial.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_plan_key text,
  ADD COLUMN IF NOT EXISTS trial_converted_at timestamptz;

COMMENT ON COLUMN tenants.trial_started_at IS 'When the workspace trial window started.';
COMMENT ON COLUMN tenants.trial_ends_at IS 'When the workspace trial window ends (exclusive of enforcement in app layer).';
COMMENT ON COLUMN tenants.trial_plan_key IS 'Internal plan/tier key for trial entitlements (e.g. pro).';
COMMENT ON COLUMN tenants.trial_converted_at IS 'Set when the tenant subscribes via Stripe; workspace trial is consumed.';
