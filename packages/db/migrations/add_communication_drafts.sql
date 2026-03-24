CREATE TABLE IF NOT EXISTS communication_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  contact_id UUID,
  created_by UUID NOT NULL,
  draft_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  referenced_entity_type TEXT,
  referenced_entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communication_drafts_tenant ON communication_drafts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_communication_drafts_contact ON communication_drafts(contact_id);
CREATE INDEX IF NOT EXISTS idx_communication_drafts_status ON communication_drafts(status);
