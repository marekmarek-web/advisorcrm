-- Dead letter queue for failed jobs (Plan 9B)
CREATE TABLE IF NOT EXISTS dead_letter_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  failure_reason TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dead_letter_items_tenant_status_idx ON dead_letter_items(tenant_id, status);
CREATE INDEX IF NOT EXISTS dead_letter_items_job_type_idx ON dead_letter_items(tenant_id, job_type);
