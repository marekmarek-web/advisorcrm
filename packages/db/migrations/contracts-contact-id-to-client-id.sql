-- Contracts: align with Drizzle app (packages/db/src/schema/contracts.ts).
-- 1) Rename legacy contact_id -> client_id if present.
-- 2) Ensure advisor_id + archived_at exist (inserts use advisor_id).
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS advisor_id text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS archived_at timestamptz;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'contact_id'
  ) THEN
    ALTER TABLE contracts RENAME COLUMN contact_id TO client_id;
  END IF;
END $$;
