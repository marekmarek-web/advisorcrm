-- Pre-launch data integrity: soft delete, unique email, FK constraints

-- Soft delete columns
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS archived_reason text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE households ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Unique email per tenant (excluding archived and empty)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_tenant_email 
  ON contacts(tenant_id, email) 
  WHERE email IS NOT NULL AND email != '' AND archived_at IS NULL;

-- FK constraints (safe additions)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_opportunities_household') THEN
    ALTER TABLE opportunities ADD CONSTRAINT fk_opportunities_household FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_contacts_referral') THEN
    ALTER TABLE contacts ADD CONSTRAINT fk_contacts_referral FOREIGN KEY (referral_contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
  END IF;
END $$;
