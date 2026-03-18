CREATE TABLE IF NOT EXISTS user_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  push_token text NOT NULL,
  platform text NOT NULL,
  app_version text,
  device_name text,
  push_enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_devices_tenant_user_token_unique
  ON user_devices(tenant_id, user_id, push_token);

CREATE INDEX IF NOT EXISTS user_devices_tenant_user_idx
  ON user_devices(tenant_id, user_id);
