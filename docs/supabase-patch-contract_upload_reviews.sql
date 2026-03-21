-- =============================================================================
-- Oprava chyby DB_INSERT_REVIEW / upload smluv
-- =============================================================================
-- Spusť v Supabase: SQL Editor → New query → vlož celý soubor → Run.
-- Musí být stejná databáze jako v DATABASE_URL na Vercelu.
--
-- Skript je idempotentní (bezpečné spustit vícekrát).
-- =============================================================================

-- Základ tabulky (když ještě neexistuje)
CREATE TABLE IF NOT EXISTS public.contract_upload_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  processing_status text NOT NULL,
  error_message text,
  extracted_payload jsonb,
  client_match_candidates jsonb,
  draft_actions jsonb,
  confidence jsonb,
  reasons_for_review jsonb,
  review_status text DEFAULT 'pending',
  uploaded_by text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Sloupce z migrací (starší produkční DB často nemá všechny)
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS size_bytes bigint;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS extracted_payload jsonb;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS client_match_candidates jsonb;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS draft_actions jsonb;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS confidence jsonb;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS reasons_for_review jsonb;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending';
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS uploaded_by text;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS reviewed_by text;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS reject_reason text;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS applied_by text;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS applied_at timestamp with time zone;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS matched_client_id uuid;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS create_new_client_confirmed text;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS apply_result_payload jsonb;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS review_decision_reason text;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS input_mode text;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS extraction_mode text;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS detected_document_type text;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS extraction_trace jsonb;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS validation_warnings jsonb;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS field_confidence_map jsonb;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS classification_reasons jsonb;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS original_extracted_payload jsonb;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS corrected_payload jsonb;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS corrected_fields jsonb;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS correction_reason text;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS corrected_by text;
ALTER TABLE public.contract_upload_reviews ADD COLUMN IF NOT EXISTS corrected_at timestamp with time zone;

-- Výchozí review_status, pokud sloupec vznikl bez DEFAULT
ALTER TABLE public.contract_upload_reviews
  ALTER COLUMN review_status SET DEFAULT 'pending';

-- FK na kontakty (jen pokud ještě neexistuje)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contract_upload_reviews_matched_client_id_contacts_id_fk'
  ) THEN
    ALTER TABLE public.contract_upload_reviews
      ADD CONSTRAINT contract_upload_reviews_matched_client_id_contacts_id_fk
      FOREIGN KEY (matched_client_id) REFERENCES public.contacts (id) ON DELETE SET NULL;
  END IF;
END $$;
