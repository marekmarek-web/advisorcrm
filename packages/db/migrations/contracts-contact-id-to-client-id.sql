-- Contracts: align column name with DB (client_id). Rename contact_id -> client_id if present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'contact_id'
  ) THEN
    ALTER TABLE contracts RENAME COLUMN contact_id TO client_id;
  END IF;
END $$;
