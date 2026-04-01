-- Contracts: align with Drizzle app (packages/db/src/schema/contracts.ts).
-- 1) Legacy contact_id → client_id (rename, or merge + drop if both columns exist).
-- 2) Ensure advisor_id + archived_at exist (inserts use advisor_id).
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS advisor_id text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS archived_at timestamptz;
DO $$
BEGIN
  -- Only contact_id: rename in place.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'contact_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE contracts RENAME COLUMN contact_id TO client_id;
  -- Both contact_id and client_id (e.g. patch added client_id but old column remained): merge, then drop legacy.
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'contact_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'client_id'
  ) THEN
    UPDATE contracts SET client_id = COALESCE(client_id, contact_id);
    ALTER TABLE contracts DROP COLUMN contact_id;
  END IF;
END $$;
