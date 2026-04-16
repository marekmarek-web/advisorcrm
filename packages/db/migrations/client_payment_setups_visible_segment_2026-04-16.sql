-- Manual payment instructions: visible_to_client + segment columns
-- Needed for advisor CRUD (manual entry) and portal display control.

ALTER TABLE client_payment_setups
  ADD COLUMN IF NOT EXISTS visible_to_client boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS segment text;

-- Back-fill: existing AI Review rows that are active and not needing review are visible
UPDATE client_payment_setups
SET visible_to_client = true
WHERE status = 'active'
  AND needs_human_review = false
  AND visible_to_client = false;

-- Index to speed up client portal queries filtering by visibility
CREATE INDEX IF NOT EXISTS client_payment_setups_visible_client_idx
  ON client_payment_setups (tenant_id, contact_id, visible_to_client)
  WHERE visible_to_client = true;
