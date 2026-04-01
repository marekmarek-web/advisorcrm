-- Align contracts.type with segment (canonical segment codes: ZP, MAJ, …).
-- Idempotent for Supabase / existing projects where type was added manually NOT NULL without app fill.

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS type text;

UPDATE contracts
SET type = segment
WHERE type IS NULL OR trim(type) = '';

-- After backfill, enforce NOT NULL (safe once no nulls remain)
ALTER TABLE contracts ALTER COLUMN type SET NOT NULL;
