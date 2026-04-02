-- Portfolio metadata on contracts: client visibility, source lineage, normalized attributes.
-- Run in Supabase SQL Editor or via db:apply-schema pipeline.
--
-- Důležité: spusť celý soubor od začátku. CREATE INDEX níže používá visible_to_client,
-- portfolio_status a archived_at — bez předchozích ALTER TABLE ADD COLUMN skript spadne (42703).

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS visible_to_client boolean NOT NULL DEFAULT true;

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS portfolio_status text NOT NULL DEFAULT 'active';

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'manual';

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS source_document_id uuid;

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS source_contract_review_id uuid;

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS advisor_confirmed_at timestamptz;

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS confirmed_by_user_id text;

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS portfolio_attributes jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS extraction_confidence numeric(5, 4);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contracts_portfolio_status_check'
  ) THEN
    ALTER TABLE contracts
      ADD CONSTRAINT contracts_portfolio_status_check
      CHECK (portfolio_status IN ('draft', 'pending_review', 'active', 'ended'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contracts_source_kind_check'
  ) THEN
    ALTER TABLE contracts
      ADD CONSTRAINT contracts_source_kind_check
      CHECK (source_kind IN ('manual', 'document', 'ai_review', 'import'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contracts_source_document_id_fkey'
  ) THEN
    ALTER TABLE contracts
      ADD CONSTRAINT contracts_source_document_id_fkey
      FOREIGN KEY (source_document_id) REFERENCES documents(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contracts_source_contract_review_id_fkey'
  ) THEN
    ALTER TABLE contracts
      ADD CONSTRAINT contracts_source_contract_review_id_fkey
      FOREIGN KEY (source_contract_review_id) REFERENCES contract_upload_reviews(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Sloupec klienta je client_id (Drizzle); starý název contact_id byl přejmenován (contracts-contact-id-to-client-id.sql).
CREATE INDEX IF NOT EXISTS contracts_client_portfolio_idx
  ON contracts (tenant_id, client_id)
  WHERE archived_at IS NULL AND visible_to_client = true AND portfolio_status IN ('active', 'ended');

COMMENT ON COLUMN contracts.visible_to_client IS 'When true, contract appears in client portal portfolio (if status allows).';
COMMENT ON COLUMN contracts.portfolio_status IS 'draft | pending_review | active | ended';
COMMENT ON COLUMN contracts.source_kind IS 'manual | document | ai_review | import';
COMMENT ON COLUMN contracts.portfolio_attributes IS 'Structured amounts/coverage (loan principal, sum insured, subcategory, etc.).';
