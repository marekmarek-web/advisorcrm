CREATE TABLE IF NOT EXISTS escalation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  policy_code TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  trigger_reason TEXT NOT NULL,
  threshold_crossed TEXT NOT NULL,
  escalated_to UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escalation_tenant ON escalation_events(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_escalation_entity ON escalation_events(entity_id);
