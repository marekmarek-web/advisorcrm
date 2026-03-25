CREATE TABLE IF NOT EXISTS execution_actions (
  id TEXT PRIMARY KEY,
  tenant_id UUID NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  execution_mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_for TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  executed_by UUID,
  approved_by UUID,
  risk_level TEXT NOT NULL DEFAULT 'low',
  metadata JSONB,
  result_payload JSONB,
  failure_code TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execution_actions_tenant ON execution_actions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_execution_actions_status ON execution_actions(status);
CREATE INDEX IF NOT EXISTS idx_execution_actions_scheduled ON execution_actions(scheduled_for) WHERE status = 'scheduled';
