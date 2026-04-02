-- Oprava produkčních chyb: chybějící tabulka advisor_notifications a sloupec documents.visible_to_client
-- (starší DB, kde CREATE TABLE documents běželo bez visible_to_client; add_reminders.sql nebyl spuštěn).
-- Idempotentní — bezpečné opakované spuštění. Poté můžeš znovu spustit advisor-notifications-realtime-rls.sql.

-- Dokumenty: viditelnost v klientské zóně (Drizzle: packages/db/src/schema/documents.ts)
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS visible_to_client boolean DEFAULT false;

-- Reminders + in-app notifikace pro poradce (viz packages/db/migrations/add_reminders.sql)
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  reminder_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  related_entity_type TEXT,
  related_entity_id UUID,
  suggestion_origin TEXT NOT NULL DEFAULT 'rule',
  status TEXT NOT NULL DEFAULT 'pending',
  snoozed_until TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  assigned_to UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_tenant ON reminders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reminders_assigned ON reminders(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(due_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS advisor_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  target_user_id UUID NOT NULL,
  channels JSONB NOT NULL DEFAULT '["in_app"]',
  related_entity_type TEXT,
  related_entity_id UUID,
  status TEXT NOT NULL DEFAULT 'unread',
  group_key TEXT,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advisor_notif_target ON advisor_notifications(target_user_id, status);
CREATE INDEX IF NOT EXISTS idx_advisor_notif_group ON advisor_notifications(group_key);
