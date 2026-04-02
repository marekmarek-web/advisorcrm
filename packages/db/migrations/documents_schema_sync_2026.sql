-- Documents: full column sync vs Drizzle schema (packages/db/src/schema/documents.ts).
-- Safe to run multiple times (IF NOT EXISTS). Run in Supabase SQL Editor after base schema exists.
--
-- Also ensures document_processing_jobs exists (required by upload background processing).
--
-- Optional backfill after columns exist:
--   UPDATE documents SET upload_source = 'web' WHERE upload_source IS NULL;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS visible_to_client boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS document_type text,
  ADD COLUMN IF NOT EXISTS upload_source text DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS sensitive boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS page_count integer,
  ADD COLUMN IF NOT EXISTS captured_platform text,
  ADD COLUMN IF NOT EXISTS has_text_layer boolean,
  ADD COLUMN IF NOT EXISTS is_scan_like boolean,
  ADD COLUMN IF NOT EXISTS source_channel text,
  ADD COLUMN IF NOT EXISTS detected_input_mode text,
  ADD COLUMN IF NOT EXISTS document_fingerprint text,
  ADD COLUMN IF NOT EXISTS readability_score integer,
  ADD COLUMN IF NOT EXISTS normalized_pdf_path text,
  ADD COLUMN IF NOT EXISTS preprocessing_warnings jsonb,
  ADD COLUMN IF NOT EXISTS page_text_map jsonb,
  ADD COLUMN IF NOT EXISTS page_image_refs jsonb,
  ADD COLUMN IF NOT EXISTS capture_mode text,
  ADD COLUMN IF NOT EXISTS capture_quality_warnings jsonb,
  ADD COLUMN IF NOT EXISTS manual_crop_applied boolean,
  ADD COLUMN IF NOT EXISTS rotation_adjusted boolean,
  ADD COLUMN IF NOT EXISTS processing_provider text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS processing_stage text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS business_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS processing_error text,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS ocr_pdf_path text,
  ADD COLUMN IF NOT EXISTS markdown_path text,
  ADD COLUMN IF NOT EXISTS markdown_content text,
  ADD COLUMN IF NOT EXISTS extract_json_path text,
  ADD COLUMN IF NOT EXISTS ai_input_source text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

UPDATE documents SET upload_source = 'web' WHERE upload_source IS NULL;

CREATE TABLE IF NOT EXISTS document_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  provider text NOT NULL,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  requested_by text,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  provider_job_id text,
  input_path text,
  output_path text,
  output_metadata jsonb,
  attempt_number integer DEFAULT 1,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dpj_document_id ON document_processing_jobs (document_id);
CREATE INDEX IF NOT EXISTS idx_dpj_status ON document_processing_jobs (status);
CREATE INDEX IF NOT EXISTS idx_documents_processing_status ON documents (processing_status);
