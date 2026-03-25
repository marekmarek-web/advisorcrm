CREATE TABLE IF NOT EXISTS portal_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  page_url text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_feedback_tenant_created_at_idx
  ON portal_feedback (tenant_id, created_at DESC);
